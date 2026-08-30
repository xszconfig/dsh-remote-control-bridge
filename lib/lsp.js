/**
 * LSP 代码智能：按需拉起 Language Server，跟踪 Agent 编辑的文件，
 * 把 publishDiagnostics 实时回调给 bridge 广播到手机。
 *
 * 设计取舍（v1）：
 * - 只做诊断，不做补全/悬停/跳转；
 * - 全量文档同步（didOpen 全文 + didChange 全文，节流 400ms），不做增量同步；
 * - 按语言懒启动 server，二进制缺失时优雅降级（记一次日志，不重试风暴）；
 * - 每个语言一个 server 实例 + 一个 workspace root（文件所在目录）；
 * - server 崩溃后自动清理，30s 内不重启同语言。
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
/** 语言 → server 命令（PATH 里找不到二进制时该语言自动禁用）。 */
const LANGS = {
    typescript: { languageId: 'typescript', exts: ['.ts', '.tsx', '.mts', '.cts'], cmd: ['typescript-language-server', '--stdio'] },
    javascript: { languageId: 'javascript', exts: ['.js', '.jsx', '.mjs', '.cjs'], cmd: ['typescript-language-server', '--stdio'] },
    python: { languageId: 'python', exts: ['.py'], cmd: ['pyright-langserver', '--stdio'] },
    rust: { languageId: 'rust', exts: ['.rs'], cmd: ['rust-analyzer'] },
    cpp: { languageId: 'cpp', exts: ['.c', '.h', '.cc', '.cpp', '.hpp'], cmd: ['clangd'] },
};
const DIAG_THROTTLE_MS = 400;
const RESTART_BACKOFF_MS = 30_000;
export class LspManager {
    opts;
    servers = new Map();
    missing = new Set(); // 二进制缺失的语言
    diagTimers = new Map();
    tsServerPathCache; // undefined=未探测 null=没有
    constructor(opts) {
        this.opts = opts;
    }
    /** 已就绪（二进制存在）的语言列表，hello 快照里下发给手机。 */
    availableLangs() {
        return Object.keys(LANGS).filter((lang) => {
            const cmd = this.cmdFor(lang);
            if (cmd.length === 0)
                return false;
            return this.findExecutable(cmd[0]) !== undefined;
        });
    }
    /** Agent 编辑/写入了文件 → 打开或更新到对应 language server。 */
    notifyFileChanged(path) {
        if (!path.startsWith('/'))
            return; // 只处理绝对路径
        if (!existsSync(path))
            return;
        const lang = this.langFor(path);
        if (lang === undefined)
            return;
        if (this.missing.has(lang))
            return;
        const state = this.ensureServer(lang, path);
        if (state === undefined)
            return;
        const uri = pathToFileURL(path).href;
        // LSP 规定 didOpen 等通知必须在 initialize 完成之后：初始化未就绪先入队
        void state.initPromise.then(() => {
            if (state.dead)
                return;
            const doc = state.openDocs.get(uri);
            if (doc === undefined) {
                state.openDocs.set(uri, '');
                this.notify(state, 'textDocument/didOpen', {
                    textDocument: { uri, languageId: LANGS[lang].languageId, version: 1, text: '' },
                });
            }
            // 全量同步：读盘节流后发出（首次 didOpen 后立即同步一次内容）
            const prev = this.diagTimers.get(path);
            if (prev !== undefined)
                clearTimeout(prev);
            this.diagTimers.set(path, setTimeout(() => {
                this.diagTimers.delete(path);
                this.syncDoc(state, uri, path);
            }, DIAG_THROTTLE_MS));
        });
    }
    /** 立即同步一次文件内容（绕过节流，供测试）。 */
    flush(path) {
        const t = this.diagTimers.get(path);
        if (t !== undefined) {
            clearTimeout(t);
            this.diagTimers.delete(path);
        }
        const lang = this.langFor(path);
        if (lang === undefined)
            return;
        const state = this.servers.get(lang);
        if (state === undefined)
            return;
        const uri = pathToFileURL(path).href;
        if (state.openDocs.has(uri))
            this.syncDoc(state, uri, path);
    }
    dispose() {
        for (const t of this.diagTimers.values())
            clearTimeout(t);
        this.diagTimers.clear();
        for (const [, s] of this.servers)
            this.killServer(s);
        this.servers.clear();
    }
    // ---- 内部 ----
    cmdFor(lang) {
        return this.opts.cmdOverride?.[lang] ?? LANGS[lang].cmd;
    }
    langFor(path) {
        const dot = path.lastIndexOf('.');
        if (dot < 0)
            return undefined;
        const ext = path.slice(dot).toLowerCase();
        for (const [lang, cfg] of Object.entries(LANGS)) {
            if (cfg.exts.includes(ext))
                return lang;
        }
        return undefined;
    }
    /** 全局 typescript 安装里的 tsserver.js（typescript-language-server 不捆绑 typescript 时需要显式指路）。 */
    tsserverPath() {
        if (this.tsServerPathCache !== undefined)
            return this.tsServerPathCache ?? undefined;
        const candidates = [];
        if (process.env.DSH_TSSERVER_PATH !== undefined)
            candidates.push(process.env.DSH_TSSERVER_PATH);
        const bin = this.findExecutable('typescript-language-server');
        if (bin !== undefined) {
            const globalRoot = join(dirname(dirname(bin)), 'lib', 'node_modules');
            candidates.push(join(globalRoot, 'typescript', 'lib', 'tsserver.js'));
        }
        candidates.push('/opt/homebrew/lib/node_modules/typescript/lib/tsserver.js');
        candidates.push('/usr/local/lib/node_modules/typescript/lib/tsserver.js');
        const hit = candidates.find((c) => c !== '' && existsSync(c));
        this.tsServerPathCache = hit ?? null;
        return hit;
    }
    findExecutable(bin) {
        if (bin.includes('/'))
            return existsSync(bin) ? bin : undefined;
        const dirs = (process.env.PATH ?? '').split(':');
        for (const d of dirs) {
            const p = `${d}/${bin}`;
            if (existsSync(p))
                return p;
        }
        return undefined;
    }
    ensureServer(lang, path) {
        const existing = this.servers.get(lang);
        if (existing !== undefined && !existing.dead)
            return existing;
        if (existing?.dead && Date.now() < existing.restartBlockedUntil)
            return undefined;
        const cmd = this.cmdFor(lang);
        const bin = this.findExecutable(cmd[0]);
        if (bin === undefined) {
            this.missing.add(lang);
            this.opts.log?.(`[lsp] ${lang}: 未找到 ${cmd[0]}，该语言诊断禁用`);
            return undefined;
        }
        try {
            const proc = spawn(bin, cmd.slice(1), {
                stdio: ['pipe', 'pipe', 'pipe'],
            });
            const state = {
                proc,
                pending: new Map(),
                nextId: 1,
                openDocs: new Map(),
                dead: false,
                restartBlockedUntil: 0,
                initPromise: Promise.resolve(),
            };
            proc.on('error', (e) => {
                this.opts.log?.(`[lsp] ${lang} spawn 失败: ${String(e)}`);
                this.killServer(state);
            });
            proc.on('exit', () => {
                if (!state.dead) {
                    this.opts.log?.(`[lsp] ${lang} 进程退出，清理状态`);
                    state.dead = true;
                    state.restartBlockedUntil = Date.now() + RESTART_BACKOFF_MS;
                    state.pending.clear();
                }
            });
            proc.stderr?.on('data', (d) => this.opts.log?.(`[lsp:${lang}] ${String(d).trim().slice(0, 300)}`));
            let buf = Buffer.alloc(0);
            proc.stdout?.on('data', (chunk) => {
                buf = Buffer.concat([buf, chunk]);
                for (;;) {
                    const msg = extractFrame(buf);
                    if (msg === null)
                        break;
                    buf = msg.rest;
                    this.handleMessage(lang, state, msg.payload);
                }
            });
            this.servers.set(lang, state);
            // initialize（rootUri 用文件所在目录；capabilities 只用默认即可收到诊断）。
            // didOpen/didChange 一律等 initPromise，否则 server 会静默丢弃初始化前通知。
            state.initPromise = this.request(state, 'initialize', {
                processId: process.pid,
                rootUri: pathToFileURL(dirname(path)).href,
                // 声明 publishDiagnostics 能力：否则 ts-language-server 可能静默切换诊断拉取模式
                capabilities: { textDocument: { publishDiagnostics: { relatedInformation: true } } },
                ...(lang === 'typescript' || lang === 'javascript'
                    ? (() => {
                        const tsp = this.tsserverPath();
                        return tsp !== undefined
                            ? { initializationOptions: { tsserver: { path: tsp } } }
                            : {};
                    })()
                    : {}),
            }).then(() => {
                if (!state.dead)
                    this.send(state, 'initialized', {});
            }).catch((e) => {
                this.opts.log?.(`[lsp] ${lang} 初始化失败: ${String(e)}`);
            });
            return state;
        }
        catch (e) {
            this.opts.log?.(`[lsp] ${lang} 启动异常: ${String(e)}`);
            return undefined;
        }
    }
    killServer(state) {
        if (state.dead)
            return;
        state.dead = true;
        try {
            state.proc.kill();
        }
        catch { /* 忽略 */ }
        state.pending.clear();
    }
    send(state, method, params) {
        if (state.dead)
            return;
        const id = state.nextId++;
        const frame = JSON.stringify({ jsonrpc: '2.0', id, method, params });
        state.proc.stdin?.write(`Content-Length: ${Buffer.byteLength(frame)}\r\n\r\n${frame}`);
    }
    notify(state, method, params) {
        if (state.dead)
            return;
        const frame = JSON.stringify({ jsonrpc: '2.0', method, params });
        state.proc.stdin?.write(`Content-Length: ${Buffer.byteLength(frame)}\r\n\r\n${frame}`);
    }
    request(state, method, params) {
        if (state.dead)
            return Promise.reject(new Error('server dead'));
        const id = state.nextId++;
        const frame = JSON.stringify({ jsonrpc: '2.0', id, method, params });
        return new Promise((resolve, reject) => {
            state.pending.set(id, resolve);
            try {
                state.proc.stdin?.write(`Content-Length: ${Buffer.byteLength(frame)}\r\n\r\n${frame}`);
            }
            catch (e) {
                state.pending.delete(id);
                reject(e);
            }
        });
    }
    handleMessage(lang, state, payload) {
        let msg;
        try {
            msg = JSON.parse(payload.toString('utf8'));
        }
        catch {
            this.opts.log?.(`[lsp:${lang}] 无法解析帧`);
            return;
        }
        if (msg.method === 'textDocument/publishDiagnostics') {
            const p = (msg.params ?? {});
            if (typeof p.uri !== 'string' || !Array.isArray(p.diagnostics))
                return;
            const path = fileURLToPath(p.uri);
            const diags = p.diagnostics
                .map((d) => {
                const r = (d.range ?? {});
                if (r.start === undefined || typeof d.message !== 'string')
                    return null;
                return {
                    path,
                    line: (r.start.line ?? 0) + 1,
                    column: (r.start.character ?? 0) + 1,
                    ...(r.end !== undefined ? { endLine: (r.end.line ?? 0) + 1, endColumn: (r.end.character ?? 0) + 1 } : {}),
                    severity: (typeof d.severity === 'number' ? d.severity : 3),
                    message: d.message.slice(0, 500),
                    ...(typeof d.source === 'string' ? { source: d.source } : {}),
                };
            })
                .filter((d) => d !== null)
                .slice(0, 200);
            this.opts.onDiagnostics(path, diags);
            return;
        }
        if (msg.id !== undefined && typeof msg.id === 'number') {
            const cb = state.pending.get(msg.id);
            if (cb !== undefined) {
                state.pending.delete(msg.id);
                cb(msg.result);
            }
        }
    }
    syncDoc(state, uri, path) {
        if (state.dead)
            return;
        let text;
        try {
            text = readFileSync(path, 'utf8');
        }
        catch {
            return;
        }
        const prev = state.openDocs.get(uri);
        if (prev === text)
            return;
        state.openDocs.set(uri, text);
        this.notify(state, 'textDocument/didChange', {
            textDocument: { uri, version: Date.now() },
            contentChanges: [{ text }],
        });
    }
}
/** 从字节流里解出一帧 LSP 消息（Content-Length 头）。返回 null = 数据不足。 */
function extractFrame(buf) {
    const headerEnd = buf.indexOf('\r\n\r\n');
    if (headerEnd < 0)
        return null;
    const header = buf.subarray(0, headerEnd).toString('ascii');
    const lenMatch = /Content-Length:\s*(\d+)/i.exec(header);
    if (lenMatch === null)
        return null;
    const len = Number(lenMatch[1]);
    if (buf.length < headerEnd + 4 + len)
        return null;
    const payload = buf.subarray(headerEnd + 4, headerEnd + 4 + len);
    const rest = buf.subarray(headerEnd + 4 + len);
    return { payload, rest };
}
