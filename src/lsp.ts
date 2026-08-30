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
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export type LspSeverity = 1 | 2 | 3 | 4 // error / warning / info / hint

export interface LspDiagnosticWire {
  path: string
  line: number
  column: number
  endLine?: number
  endColumn?: number
  severity: LspSeverity
  message: string
  source?: string
}

interface LanguageConfig {
  languageId: string
  exts: string[]
  cmd: string[]
}

/** 语言 → server 命令（PATH 里找不到二进制时该语言自动禁用）。 */
const LANGS: Record<string, LanguageConfig> = {
  typescript: { languageId: 'typescript', exts: ['.ts', '.tsx', '.mts', '.cts'], cmd: ['typescript-language-server', '--stdio'] },
  javascript: { languageId: 'javascript', exts: ['.js', '.jsx', '.mjs', '.cjs'], cmd: ['typescript-language-server', '--stdio'] },
  python: { languageId: 'python', exts: ['.py'], cmd: ['pyright-langserver', '--stdio'] },
  rust: { languageId: 'rust', exts: ['.rs'], cmd: ['rust-analyzer'] },
  cpp: { languageId: 'cpp', exts: ['.c', '.h', '.cc', '.cpp', '.hpp'], cmd: ['clangd'] },
}

const DIAG_THROTTLE_MS = 400
const RESTART_BACKOFF_MS = 30_000

interface ServerState {
  proc: ChildProcess
  pending: Map<number, (result: unknown) => void>
  nextId: number
  openDocs: Map<string, string>
  /** uri → 触发会话（诊断广播做会话隔离用）。 */
  docSessions: Map<string, string>
  dead: boolean
  restartBlockedUntil: number
  /** initialize 完成即 resolve（didOpen/didChange 必须等它，否则 server 静默丢弃）。 */
  initPromise: Promise<void>
}

export interface LspOptions {
  /** 诊断回调：path + 触发它的会话 + 该文件当前全部诊断。 */
  onDiagnostics: (path: string, sessionId: string | undefined, diagnostics: LspDiagnosticWire[]) => void
  /** 语言 → 覆盖命令（测试注入 mock server 用）。 */
  cmdOverride?: Record<string, string[]>
  /** 日志钩子（默认静默）。 */
  log?: (message: string) => void
}

export class LspManager {
  private readonly servers = new Map<string, ServerState>()
  private readonly missing = new Set<string>() // 二进制缺失的语言
  private readonly diagTimers = new Map<string, NodeJS.Timeout>()
  private tsServerPathCache: string | null | undefined // undefined=未探测 null=没有

  constructor(private readonly opts: LspOptions) {}

  /** 已就绪（二进制存在）的语言列表，hello 快照里下发给手机。 */
  availableLangs(): string[] {
    return Object.keys(LANGS).filter((lang) => {
      const cmd = this.cmdFor(lang)
      if (cmd.length === 0) return false
      return this.findExecutable(cmd[0]) !== undefined
    })
  }

  /** Agent 编辑/写入了文件 → 打开或更新到对应 language server（sessionId 用于诊断会话隔离）。 */
  notifyFileChanged(path: string, sessionId?: string): void {
    if (!path.startsWith('/')) return // 只处理绝对路径
    if (!existsSync(path)) return
    const lang = this.langFor(path)
    if (lang === undefined) return
    if (this.missing.has(lang)) return
    const state = this.ensureServer(lang, path)
    if (state === undefined) return
    const uri = pathToFileURL(path).href
    // LSP 规定 didOpen 等通知必须在 initialize 完成之后：初始化未就绪先入队
    void state.initPromise.then(() => {
      if (state.dead) return
      const doc = state.openDocs.get(uri)
      if (doc === undefined) {
        state.openDocs.set(uri, '')
        state.docSessions.set(uri, sessionId ?? '')
        this.notify(state, 'textDocument/didOpen', {
          textDocument: { uri, languageId: LANGS[lang].languageId, version: 1, text: '' },
        })
      } else {
        state.docSessions.set(uri, sessionId ?? '')
      }
      // 全量同步：读盘节流后发出（首次 didOpen 后立即同步一次内容）
      const prev = this.diagTimers.get(path)
      if (prev !== undefined) clearTimeout(prev)
      this.diagTimers.set(path, setTimeout(() => {
        this.diagTimers.delete(path)
        this.syncDoc(state, uri, path)
      }, DIAG_THROTTLE_MS))
    })
  }

  /** 立即同步一次文件内容（绕过节流，供测试）。 */
  flush(path: string): void {
    const t = this.diagTimers.get(path)
    if (t !== undefined) {
      clearTimeout(t)
      this.diagTimers.delete(path)
    }
    const lang = this.langFor(path)
    if (lang === undefined) return
    const state = this.servers.get(lang)
    if (state === undefined) return
    const uri = pathToFileURL(path).href
    if (state.openDocs.has(uri)) this.syncDoc(state, uri, path)
  }

  dispose(): void {
    for (const t of this.diagTimers.values()) clearTimeout(t)
    this.diagTimers.clear()
    for (const [, s] of this.servers) this.killServer(s)
    this.servers.clear()
  }

  // ---- 内部 ----

  private cmdFor(lang: string): string[] {
    return this.opts.cmdOverride?.[lang] ?? LANGS[lang].cmd
  }

  private langFor(path: string): string | undefined {
    const dot = path.lastIndexOf('.')
    if (dot < 0) return undefined
    const ext = path.slice(dot).toLowerCase()
    for (const [lang, cfg] of Object.entries(LANGS)) {
      if (cfg.exts.includes(ext)) return lang
    }
    return undefined
  }

  /** 全局 typescript 安装里的 tsserver.js（typescript-language-server 不捆绑 typescript 时需要显式指路）。 */
  private tsserverPath(): string | undefined {
    if (this.tsServerPathCache !== undefined) return this.tsServerPathCache ?? undefined
    const candidates: string[] = []
    if (process.env.DSH_TSSERVER_PATH !== undefined) candidates.push(process.env.DSH_TSSERVER_PATH)
    const bin = this.findExecutable('typescript-language-server')
    if (bin !== undefined) {
      const globalRoot = join(dirname(dirname(bin)), 'lib', 'node_modules')
      candidates.push(join(globalRoot, 'typescript', 'lib', 'tsserver.js'))
    }
    candidates.push('/opt/homebrew/lib/node_modules/typescript/lib/tsserver.js')
    candidates.push('/usr/local/lib/node_modules/typescript/lib/tsserver.js')
    const hit = candidates.find((c) => c !== '' && existsSync(c))
    this.tsServerPathCache = hit ?? null
    return hit
  }

  private findExecutable(bin: string): string | undefined {
    if (bin.includes('/')) return existsSync(bin) ? bin : undefined
    const dirs = (process.env.PATH ?? '').split(':')
    for (const d of dirs) {
      const p = `${d}/${bin}`
      if (existsSync(p)) return p
    }
    return undefined
  }

  private ensureServer(lang: string, path: string): ServerState | undefined {
    const existing = this.servers.get(lang)
    if (existing !== undefined && !existing.dead) return existing
    if (existing?.dead && Date.now() < existing.restartBlockedUntil) return undefined

    const cmd = this.cmdFor(lang)
    const bin = this.findExecutable(cmd[0])
    if (bin === undefined) {
      this.missing.add(lang)
      this.opts.log?.(`[lsp] ${lang}: 未找到 ${cmd[0]}，该语言诊断禁用`)
      return undefined
    }
    try {
      const proc = spawn(bin, cmd.slice(1), {
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      const state: ServerState = {
        proc,
        pending: new Map(),
        nextId: 1,
        openDocs: new Map(),
        docSessions: new Map(),
        dead: false,
        restartBlockedUntil: 0,
        initPromise: Promise.resolve(),
      }
      proc.on('error', (e) => {
        this.opts.log?.(`[lsp] ${lang} spawn 失败: ${String(e)}`)
        this.killServer(state)
      })
      proc.on('exit', () => {
        if (!state.dead) {
          this.opts.log?.(`[lsp] ${lang} 进程退出，清理状态`)
          state.dead = true
          state.restartBlockedUntil = Date.now() + RESTART_BACKOFF_MS
          state.pending.clear()
        }
      })
      proc.stderr?.on('data', (d) => this.opts.log?.(`[lsp:${lang}] ${String(d).trim().slice(0, 300)}`))
      let buf: Buffer = Buffer.alloc(0)
      proc.stdout?.on('data', (chunk: Buffer) => {
        buf = Buffer.concat([buf, chunk])
        for (;;) {
          const msg = extractFrame(buf)
          if (msg === null) break
          buf = msg.rest
          this.handleMessage(lang, state, msg.payload)
        }
      })
      this.servers.set(lang, state)
      // initialize（rootUri 用文件所在目录；capabilities 只用默认即可收到诊断）。
      // didOpen/didChange 一律等 initPromise，否则 server 会静默丢弃初始化前通知。
      state.initPromise = this.request(state, 'initialize', {
        processId: process.pid,
        rootUri: pathToFileURL(dirname(path)).href,
        // 声明 publishDiagnostics 能力：否则 ts-language-server 可能静默切换诊断拉取模式
        capabilities: { textDocument: { publishDiagnostics: { relatedInformation: true } } },
        ...(lang === 'typescript' || lang === 'javascript'
          ? (() => {
              const tsp = this.tsserverPath()
              return tsp !== undefined
                ? { initializationOptions: { tsserver: { path: tsp } } }
                : {}
            })()
          : {}),
      }).then(() => {
        if (!state.dead) this.send(state, 'initialized', {})
      }).catch((e) => {
        this.opts.log?.(`[lsp] ${lang} 初始化失败: ${String(e)}`)
      })
      return state
    } catch (e) {
      this.opts.log?.(`[lsp] ${lang} 启动异常: ${String(e)}`)
      return undefined
    }
  }

  private killServer(state: ServerState): void {
    if (state.dead) return
    state.dead = true
    try { state.proc.kill() } catch { /* 忽略 */ }
    state.pending.clear()
  }

  private send(state: ServerState, method: string, params: unknown): void {
    if (state.dead) return
    const id = state.nextId++
    const frame = JSON.stringify({ jsonrpc: '2.0', id, method, params })
    state.proc.stdin?.write(`Content-Length: ${Buffer.byteLength(frame)}\r\n\r\n${frame}`)
  }

  private notify(state: ServerState, method: string, params: unknown): void {
    if (state.dead) return
    const frame = JSON.stringify({ jsonrpc: '2.0', method, params })
    state.proc.stdin?.write(`Content-Length: ${Buffer.byteLength(frame)}\r\n\r\n${frame}`)
  }

  private request(state: ServerState, method: string, params: unknown): Promise<unknown> {
    if (state.dead) return Promise.reject(new Error('server dead'))
    const id = state.nextId++
    const frame = JSON.stringify({ jsonrpc: '2.0', id, method, params })
    return new Promise((resolve, reject) => {
      state.pending.set(id, resolve)
      try {
        state.proc.stdin?.write(`Content-Length: ${Buffer.byteLength(frame)}\r\n\r\n${frame}`)
      } catch (e) {
        state.pending.delete(id)
        reject(e)
      }
    })
  }

  private handleMessage(lang: string, state: ServerState, payload: Buffer): void {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(payload.toString('utf8')) as Record<string, unknown>
    } catch {
      this.opts.log?.(`[lsp:${lang}] 无法解析帧`)
      return
    }
    if (msg.method === 'textDocument/publishDiagnostics') {
      const p = (msg.params ?? {}) as { uri?: unknown; diagnostics?: unknown }
      if (typeof p.uri !== 'string' || !Array.isArray(p.diagnostics)) return
      const path = fileURLToPath(p.uri)
      const diags = (p.diagnostics as Array<Record<string, unknown>>)
        .map((d): LspDiagnosticWire | null => {
          const r = (d.range ?? {}) as { start?: { line?: number; character?: number }; end?: { line?: number; character?: number } }
          if (r.start === undefined || typeof d.message !== 'string') return null
          return {
            path,
            line: (r.start.line ?? 0) + 1,
            column: (r.start.character ?? 0) + 1,
            ...(r.end !== undefined ? { endLine: (r.end.line ?? 0) + 1, endColumn: (r.end.character ?? 0) + 1 } : {}),
            severity: (typeof d.severity === 'number' ? (d.severity as LspSeverity) : 3),
            message: d.message.slice(0, 500),
            ...(typeof d.source === 'string' ? { source: d.source } : {}),
          }
        })
        .filter((d): d is LspDiagnosticWire => d !== null)
        .slice(0, 200)
      this.opts.onDiagnostics(path, state.docSessions.get(p.uri), diags)
      return
    }
    if (msg.id !== undefined && typeof msg.id === 'number') {
      const cb = state.pending.get(msg.id)
      if (cb !== undefined) {
        state.pending.delete(msg.id)
        cb(msg.result)
      }
    }
  }

  private syncDoc(state: ServerState, uri: string, path: string): void {
    if (state.dead) return
    let text: string
    try {
      text = readFileSync(path, 'utf8')
    } catch {
      return
    }
    const prev = state.openDocs.get(uri)
    if (prev === text) return
    state.openDocs.set(uri, text)
    this.notify(state, 'textDocument/didChange', {
      textDocument: { uri, version: Date.now() },
      contentChanges: [{ text }],
    })
  }
}

/** 从字节流里解出一帧 LSP 消息（Content-Length 头）。返回 null = 数据不足。 */
function extractFrame(buf: Buffer): { payload: Buffer; rest: Buffer } | null {
  const headerEnd = buf.indexOf('\r\n\r\n')
  if (headerEnd < 0) return null
  const header = buf.subarray(0, headerEnd).toString('ascii')
  const lenMatch = /Content-Length:\s*(\d+)/i.exec(header)
  if (lenMatch === null) return null
  const len = Number(lenMatch[1])
  if (buf.length < headerEnd + 4 + len) return null
  const payload = buf.subarray(headerEnd + 4, headerEnd + 4 + len)
  const rest = buf.subarray(headerEnd + 4 + len)
  return { payload, rest }
}
