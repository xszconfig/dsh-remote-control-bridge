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
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
/** 语言 → server 命令（PATH 里找不到二进制时该语言自动禁用）。 */
const LANGS = {
    typescript: { languageId: 'typescript', exts: ['.ts', '.tsx', '.mts', '.cts'], cmd: ['typescript-language-server', '--stdio'] },
    javascript: { languageId: 'javascript', exts: ['.js', '.jsx', '.mjs', '.cjs'], cmd: ['typescript-language-server', '--stdio'] },
    python: { languageId: 'python', exts: ['.py'], cmd: ['pyright-langserver', '--stdio'] },
    rust: { languageId: 'rust', exts: ['.rs'], cmd: ['rust-analyzer'] },
    cpp: { languageId: 'cpp', exts: ['.c', '.h', '.cc', '.cpp', '.hpp'], cmd: ['clangd'] },
    // 官方 JetBrains Kotlin LSP（IntelliJ 内核）——二进制在 cmdFor 里按 DSH_KOTLIN_LSP_BIN →
    // 内置解包路径 → PATH 上的 kotlin-lsp 三级解析；诊断是 pull 模式。
    kotlin: { languageId: 'kotlin', exts: ['.kt', '.kts'], cmd: ['kotlin-lsp', '--stdio'], pullDiagnostics: true },
};
const DIAG_THROTTLE_MS = 400;
const RESTART_BACKOFF_MS = 30_000;
export class LspManager {
    opts;
    servers = new Map();
    missing = new Set(); // 二进制缺失的语言
    diagTimers = new Map();
    diagCache = new Map(); // uri → 最新诊断（push/pull 共用）
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
    /** Agent 编辑/写入了文件 → 打开或更新到对应 language server（sessionId 用于诊断会话隔离）。 */
    notifyFileChanged(path, sessionId) {
        if (!path.startsWith('/'))
            return; // 只处理绝对路径
        if (!existsSync(path))
            return;
        const originalPath = path;
        // 解析符号链接（macOS /tmp→/private/tmp）：否则 file URI 与 IntelliJ server 解析出的 VFS 路径对不上，
        // didOpen/didChange 会落到错误的 URI，诊断请求 findVirtualFile 返回空 → 0 诊断。
        try {
            path = realpathSync(path);
        }
        catch { /* 保留原路径 */ }
        const lang = this.langFor(path);
        if (lang === undefined)
            return;
        if (this.missing.has(lang))
            return;
        const state = this.ensureServer(lang, path);
        if (state === undefined)
            return;
        const uri = pathToFileURL(path).href;
        state.docPaths.set(uri, originalPath);
        // LSP 规定 didOpen 等通知必须在 initialize 完成之后：初始化未就绪先入队
        void state.initPromise.then(() => {
            if (state.dead)
                return;
            const doc = state.openDocs.get(uri);
            if (doc === undefined) {
                state.openDocs.set(uri, '');
                state.docSessions.set(uri, sessionId ?? '');
                this.notify(state, 'textDocument/didOpen', {
                    textDocument: { uri, languageId: LANGS[lang].languageId, version: 1, text: '' },
                });
            }
            else {
                state.docSessions.set(uri, sessionId ?? '');
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
        try {
            path = realpathSync(path);
        }
        catch { /* 保留原路径 */ }
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
    /**
     * Agent 主动查询语言服务器（OMP 同款能力）：diagnostics / hover / definition / references。
     * 返回给模型看的纯文本；诊断优先读缓存（push/pull 两个通道都会更新）。
     */
    async query(action, path, line, column) {
        const lang = this.langFor(path);
        if (lang === undefined)
            return { text: `不支持的文件类型：${path}` };
        const state = this.ensureServer(lang, path);
        if (state === undefined)
            return { text: `${lang} 语言服务器不可用（二进制缺失或启动退避中）` };
        const uri = pathToFileURL(path).href;
        try {
            await state.initPromise;
        }
        catch {
            return { text: `${lang} 语言服务器初始化失败` };
        }
        if (state.dead)
            return { text: `${lang} 语言服务器已退出` };
        if (action === 'diagnostics') {
            // 确保文档已打开并同步（首次查询会触发一次诊断流程），随后读缓存
            this.notifyFileChanged(path);
            this.flush(path);
            await new Promise((r) => setTimeout(r, 1200));
            const cached = this.diagCache.get(uri);
            if (cached === undefined || cached.length === 0) {
                return { text: '暂无诊断（语言服务器可能仍在分析，或该文件确实没有问题）' };
            }
            const lines = cached.map((d) => {
                const sev = d.severity === 1 ? 'error' : d.severity === 2 ? 'warning' : d.severity === 3 ? 'info' : 'hint';
                return `[${sev}] ${path}:${d.line}:${d.column} ${d.message}`;
            });
            return { text: lines.slice(0, 100).join('\n') };
        }
        const pos = { line: Math.max((line ?? 1) - 1, 0), character: Math.max((column ?? 1) - 1, 0) };
        try {
            if (action === 'hover') {
                const r = await this.request(state, 'textDocument/hover', { textDocument: { uri }, position: pos });
                const h = r;
                return { text: formatHover(h?.contents) };
            }
            const method = action === 'definition' ? 'textDocument/definition' : 'textDocument/references';
            const r = await this.request(state, method, {
                textDocument: { uri },
                position: pos,
                ...(action === 'references' ? { context: { includeDeclaration: true } } : {}),
            });
            return { text: formatLocations(r, path) };
        }
        catch (e) {
            return { text: `${action} 查询失败：${String(e)}` };
        }
    }
    // ---- 内部 ----
    cmdFor(lang) {
        const override = this.opts.cmdOverride?.[lang];
        if (override !== undefined)
            return override;
        if (lang === 'kotlin')
            return this.kotlinCmd();
        return LANGS[lang].cmd;
    }
    /**
     * 官方 JetBrains Kotlin LSP 二进制三级解析：
     * a. DSH_KOTLIN_LSP_BIN（绝对路径或 PATH 上的名字）；
     * b. 解包在 ~/.dsh/kotlin-lsp/server/bin/intellij-server；
     * c. PATH 上的 `kotlin-lsp`。
     */
    kotlinBin() {
        const env = process.env.DSH_KOTLIN_LSP_BIN;
        if (env !== undefined && env !== '') {
            const hit = this.findExecutable(env);
            if (hit !== undefined)
                return hit;
        }
        const bundled = '/Users/xieshaoze/.dsh/kotlin-lsp/server/bin/intellij-server';
        if (existsSync(bundled))
            return bundled;
        return this.findExecutable('kotlin-lsp');
    }
    /** IntelliJ LSP 的索引/缓存目录（稳定路径，跨进程复用，避免每次重建索引）。 */
    kotlinIndexDir() {
        return join(homedir(), '.dsh', 'kotlin-lsp', 'index');
    }
    /** Kotlin 需要项目根（含 build 文件）才能导入分析；找不到就退回文件所在目录。 */
    kotlinProjectRoot(path) {
        const markers = ['build.gradle.kts', 'build.gradle', 'settings.gradle.kts', 'settings.gradle', 'pom.xml'];
        let dir = dirname(path);
        for (let i = 0; i < 20; i++) {
            if (markers.some((m) => existsSync(join(dir, m))))
                return dir;
            const parent = dirname(dir);
            if (parent === dir)
                break;
            dir = parent;
        }
        return dirname(path);
    }
    kotlinCmd() {
        const bin = this.kotlinBin();
        if (bin === undefined)
            return ['kotlin-lsp', '--stdio']; // 找不到时让 findExecutable 记一次缺失日志
        return [bin, '--stdio', '--system-path', this.kotlinIndexDir()];
    }
    /** 项目根里的构建系统：Gradle / Maven。用于显式 buildTools 触发 IntelliJ 的项目导入。 */
    kotlinBuildTool(root) {
        if (existsSync(join(root, 'build.gradle.kts')) || existsSync(join(root, 'build.gradle')))
            return 'gradle';
        if (existsSync(join(root, 'pom.xml')))
            return 'maven';
        return undefined;
    }
    /**
     * 官方 IntelliJ Kotlin LSP 需要全量能力声明（oh-my-pi 同款）：只声明 publishDiagnostics 会让
     * IntelliJ 不完整启用分析/索引。这里覆盖诊断 + hover/definition/references（query 用）。
     */
    kotlinCapabilities() {
        return {
            textDocument: {
                synchronization: { didSave: true, dynamicRegistration: false, willSave: false, willSaveWaitUntil: false },
                hover: { contentFormat: ['markdown', 'plaintext'], dynamicRegistration: false },
                definition: { dynamicRegistration: false, linkSupport: true },
                typeDefinition: { dynamicRegistration: false, linkSupport: true },
                implementation: { dynamicRegistration: false, linkSupport: true },
                references: { dynamicRegistration: false },
                publishDiagnostics: { relatedInformation: true, versionSupport: true, tagSupport: { valueSet: [1, 2] }, codeDescriptionSupport: true, dataSupport: true },
                diagnostic: { dynamicRegistration: true },
            },
            window: { workDoneProgress: true },
            workspace: {
                configuration: true,
                workspaceFolders: true,
            },
        };
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
                // Kotlin（IntelliJ 内核）默认堆太小会在索引 stdlib 时 OOM：未显式设置时给 4g
                env: {
                    ...process.env,
                    ...(lang === 'kotlin' && (process.env.IJ_JAVA_OPTIONS === undefined || process.env.IJ_JAVA_OPTIONS === '')
                        ? { IJ_JAVA_OPTIONS: '-Xmx4g' }
                        : {}),
                },
            });
            const state = {
                proc,
                pending: new Map(),
                nextId: 1,
                openDocs: new Map(),
                docSessions: new Map(),
                dead: false,
                restartBlockedUntil: 0,
                initPromise: Promise.resolve(),
                pullDiagnostics: LANGS[lang].pullDiagnostics === true,
                docVersions: new Map(),
                workspaceFolders: [{ uri: pathToFileURL(dirname(path)).href, name: basename(dirname(path)) }],
                docPaths: new Map(),
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
            // initialize：rootUri 默认用文件所在目录。官方 Kotlin LSP 是 IntelliJ 内核：
            // - 需要 workspaceFolders + 完整同步/诊断能力声明（否则索引/分析不启动）；
            // - 需要项目根（含 build 文件）才能导入出 content root，松散 .kt 文件会被
            //   KotlinProblemHighlightFilter 判定为 not-under-content-root 而返回 0 诊断；
            // - 诊断是 pull 模式（diagnosticProvider），由 syncDoc 主动 textDocument/diagnostic 拉取。
            // didOpen/didChange 一律等 initPromise，否则 server 会静默丢弃初始化前通知。
            const isKotlin = lang === 'kotlin';
            const isTs = lang === 'typescript' || lang === 'javascript';
            // Kotlin 的 workspace root 用项目根（含 build 文件），并解析符号链接（macOS /tmp→/private/tmp），
            // 否则 buildTools 的 key 与 server 解析出的文件夹 URI 对不上，导入不会触发。
            let kotlinRoot = isKotlin ? this.kotlinProjectRoot(path) : dirname(path);
            if (isKotlin) {
                try {
                    kotlinRoot = realpathSync(kotlinRoot);
                }
                catch { /* 保留未解析路径 */ }
            }
            const kotlinRootUri = pathToFileURL(kotlinRoot).href;
            const kotlinTool = isKotlin ? this.kotlinBuildTool(kotlinRoot) : undefined;
            const kotlinInitOptions = { indexDir: this.kotlinIndexDir() };
            if (kotlinTool !== undefined)
                kotlinInitOptions.buildTools = { [kotlinRootUri]: kotlinTool };
            if (isKotlin)
                state.workspaceFolders = [{ uri: kotlinRootUri, name: basename(kotlinRoot) }];
            state.initPromise = this.request(state, 'initialize', {
                processId: isKotlin ? null : process.pid,
                rootUri: kotlinRootUri,
                ...(isKotlin ? { rootPath: kotlinRoot } : {}),
                ...(isKotlin ? { workspaceFolders: [{ uri: kotlinRootUri, name: basename(kotlinRoot) }] } : {}),
                // 声明 publishDiagnostics 能力：否则 ts-language-server 可能静默切换诊断拉取模式；
                // Kotlin 用全量能力（oh-my-pi 同款），否则 IntelliJ 不完整启用分析。
                capabilities: isKotlin
                    ? this.kotlinCapabilities()
                    : { textDocument: { publishDiagnostics: { relatedInformation: true } } },
                ...(isKotlin ? { initializationOptions: kotlinInitOptions } : {}),
                ...(isTs
                    ? (() => {
                        const tsp = this.tsserverPath();
                        return tsp !== undefined
                            ? { initializationOptions: { tsserver: { path: tsp } } }
                            : {};
                    })()
                    : {}),
            }).then(() => {
                if (state.dead)
                    return;
                // initialized 是通知不是请求：带 id 会让 IntelliJ LSP 报 "no handler for request: initialized" 并跳过项目导入
                this.notify(state, 'initialized', {});
                // 官方 Kotlin LSP 在 initialized 后需要一次 didChangeConfiguration，否则分析不启动（oh-my-pi 同款时序）
                if (isKotlin)
                    this.notify(state, 'workspace/didChangeConfiguration', { settings: {} });
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
            const path = state.docPaths.get(p.uri) ?? fileURLToPath(p.uri);
            const diags = p.diagnostics
                .map((d) => this.toWireDiagnostic(path, d))
                .filter((d) => d !== null)
                .slice(0, 200);
            this.diagCache.set(p.uri, diags);
            this.opts.onDiagnostics(path, state.docSessions.get(p.uri), diags);
            return;
        }
        if (msg.method === 'intellij/ready-for-test') {
            // IntelliJ 索引 + 分析就绪（首次项目导入可能要几分钟，且 ready 后仍需 ~20s 才算完）：
            // 项目导入会重建 analyzer project，可能丢掉导入前 didChange 的文档内容——这里对每个已打开文档
            // 强制重发一次 didChange（全量内容）+ 用更长重试窗口重新拉 pull 诊断。
            if (state.pullDiagnostics) {
                this.opts.log?.(`[lsp] ${lang} ready-for-test，重新同步并拉取诊断（${state.openDocs.size} 个文档）`);
                for (const [uri, text] of state.openDocs) {
                    const version = (state.docVersions.get(uri) ?? 1) + 1;
                    state.docVersions.set(uri, version);
                    this.notify(state, 'textDocument/didChange', { textDocument: { uri, version }, contentChanges: [{ text }] });
                    this.pullDiagnostics(state, uri, 20, 3000);
                }
            }
            return;
        }
        if (msg.id !== undefined && typeof msg.id === 'number') {
            const cb = state.pending.get(msg.id);
            if (cb !== undefined) {
                state.pending.delete(msg.id);
                cb(msg.result);
            }
            else if (typeof msg.method === 'string') {
                this.handleServerRequest(state, msg.id, msg.method, msg.params);
            }
        }
    }
    /** 回应服务器发起的请求（oh-my-pi 同款：workspace/configuration 与 workspace/workspaceFolders 必须回数组）。 */
    handleServerRequest(state, id, method, params) {
        switch (method) {
            case 'workspace/configuration': {
                // server 拉取设置（如 intellij.buildTool）：按请求项返回 null 数组
                const items = params?.items ?? [];
                this.respond(state, id, items.map(() => null));
                return;
            }
            case 'workspace/workspaceFolders':
                this.respond(state, id, state.workspaceFolders);
                return;
            case 'workspace/applyEdit':
                this.respond(state, id, { applied: false });
                return;
            case 'window/showDocument':
                this.respond(state, id, { success: false });
                return;
            default:
                // window/workDoneProgress/create、client/registerCapability、window/showMessageRequest、各种 refresh 等
                this.respond(state, id, null);
        }
    }
    respond(state, id, result) {
        if (state.dead)
            return;
        const frame = JSON.stringify({ jsonrpc: '2.0', id, result });
        state.proc.stdin?.write(`Content-Length: ${Buffer.byteLength(frame)}\r\n\r\n${frame}`);
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
        const version = (state.docVersions.get(uri) ?? 1) + 1;
        state.docVersions.set(uri, version);
        this.notify(state, 'textDocument/didChange', {
            textDocument: { uri, version },
            contentChanges: [{ text }],
        });
        // 官方 Kotlin LSP 的诊断是 pull 模式（diagnosticProvider）：不会推送 publishDiagnostics，
        // 必须主动 textDocument/diagnostic 拉取。IntelliJ 分析是异步的，空结果时稍后重试。
        if (state.pullDiagnostics)
            this.pullDiagnostics(state, uri);
    }
    /** 把一条 LSP Diagnostic（push 或 pull 两种来源共用）转成桥接的 wire 结构。 */
    toWireDiagnostic(path, d) {
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
    }
    /** pull 模式诊断：请求 textDocument/diagnostic，非空就回调，空则节流重试（IntelliJ 分析异步，就绪后仍需 20~30s 才算完）。 */
    pullDiagnostics(state, uri, attempts = 4, delayMs = 3000) {
        if (state.dead || attempts <= 0)
            return;
        void this.request(state, 'textDocument/diagnostic', { textDocument: { uri } })
            .then((result) => {
            if (state.dead)
                return;
            const items = result?.items;
            if (!Array.isArray(items))
                return;
            const path = state.docPaths.get(uri) ?? fileURLToPath(uri);
            const diags = items
                .map((d) => this.toWireDiagnostic(path, d))
                .filter((d) => d !== null)
                .slice(0, 200);
            this.diagCache.set(uri, diags);
            if (diags.length > 0) {
                this.opts.log?.(`[lsp] pull 诊断 ${diags.length} 条：${diags[0].message.slice(0, 80)}`);
                this.opts.onDiagnostics(path, state.docSessions.get(uri), diags);
            }
            else {
                setTimeout(() => this.pullDiagnostics(state, uri, attempts - 1, delayMs), delayMs);
            }
        })
            .catch(() => { });
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
/** hover 内容格式化：支持 MarkedString / MarkedString[] / MarkupContent。 */
function formatHover(contents) {
    if (contents === null || contents === undefined)
        return '（无 hover 信息）';
    const one = (c) => {
        if (typeof c === 'string')
            return c;
        if (c !== null && typeof c === 'object') {
            const o = c;
            if (typeof o.value === 'string')
                return o.value;
        }
        return '';
    };
    const text = Array.isArray(contents)
        ? contents.map(one).filter((t) => t.length > 0).join('\n\n')
        : one(contents);
    return text.length > 0 ? text.slice(0, 4000) : '（无 hover 信息）';
}
/** definition/references 位置格式化：Location | Location[] | LocationLink[] | null。 */
function formatLocations(result, fallbackPath) {
    if (result === null || result === undefined)
        return '（无结果）';
    const arr = Array.isArray(result) ? result : [result];
    const lines = [];
    for (const item of arr) {
        if (item === null || typeof item !== 'object')
            continue;
        const o = item;
        const uri = typeof o.uri === 'string' ? o.uri : typeof o.targetUri === 'string' ? o.targetUri : undefined;
        const range = (o.range ?? o.targetSelectionRange ?? o.targetRange ?? {});
        if (uri === undefined)
            continue;
        let path;
        try {
            path = fileURLToPath(uri);
        }
        catch {
            path = uri;
        }
        const line = (range.start?.line ?? 0) + 1;
        const col = (range.start?.character ?? 0) + 1;
        lines.push(`${path === fallbackPath ? path : path}:${line}:${col}`);
        if (lines.length >= 20) {
            lines.push('…（结果超过 20 条，已截断）');
            break;
        }
    }
    return lines.length > 0 ? lines.join('\n') : '（无结果）';
}
