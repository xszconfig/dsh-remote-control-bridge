// Debug 后端：Node Inspector（CDP over WebSocket）调试客户端。
// 零新依赖（复用 ws + node:child_process）：受控启动 `node --inspect-brk=0 <program>`，
// 设置断点 → 恢复运行；暂停时读调用栈 + 作用域对象，变量按 objectId 惰性展开。
// 后端接口（DebugManager hooks）与 CDP 解耦：将来接 DAP 适配器（debugpy 等）可平替。

import { spawn, type ChildProcess } from 'node:child_process'
import { resolve, isAbsolute } from 'node:path'
import { realpathSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { WebSocket } from 'ws'
import { ConnLogger } from './logger.js'

const logger = new ConnLogger('dsh-remote-control-bridge')

// ---- 手机侧线协议类型（与 protocol.ts 保持一致，这里只放 debug 模块自用的最小面）----

/** 断点（手机/agent 侧均为 1-based 行号）。 */
export interface DebugBreakpointWire {
  path: string
  line: number
}
export type DebugRunState = 'starting' | 'running' | 'paused' | 'stopped'
export interface DebugScopeWire {
  name: string
  variablesReference: string // CDP objectId
}
export interface DebugFrameWire {
  id: string
  name: string
  path: string
  line: number // 1-based
  scopes: DebugScopeWire[]
}
export interface DebugVariableWire {
  name: string
  value: string
  type?: string
  hasChildren: boolean
  variablesReference: string
}
export interface DebugPausedInfo {
  reason: string
  stoppedAt: { path: string; line: number } | null
  frames: DebugFrameWire[]
}
export interface DebugStateSnapshot {
  state: DebugRunState
  program: string
  cwd: string
  breakpoints: DebugBreakpointWire[]
  paused?: DebugPausedInfo
  /** 最近一次错误的说明（启动失败/脚本报错等），state=stopped 时可能携带。 */
  error?: string
}

export interface DebugStartOptions {
  program: string
  cwd?: string
  breakpoints?: DebugBreakpointWire[]
}

export interface DebugHooks {
  onState(sessionId: string, snap: DebugStateSnapshot): void
  onOutput(sessionId: string, line: string): void
  onVariables(sessionId: string, variablesReference: string, variables: DebugVariableWire[]): void
}

// ---- CDP 最小类型 ----

interface CdpResponse {
  id: number
  result?: Record<string, unknown>
  error?: { code: number; message: string }
}
interface CdpLocation {
  scriptId: string
  lineNumber: number
  columnNumber: number
}
interface CdpCallFrame {
  callFrameId: string
  functionName: string
  url: string
  location: CdpLocation
  scopeChain: Array<{ type: string; name?: string; object: { objectId?: string; type: string } }>
}

const OUTPUT_CAP = 200

class InspectorSession {
  private child: ChildProcess | null = null
  private ws: WebSocket | null = null
  private nextId = 1
  private pending = new Map<number, { resolve: (r: Record<string, unknown>) => void; reject: (e: Error) => void }>()
  private scriptUrls = new Map<string, string>() // scriptId -> url
  private pausedFrames: CdpCallFrame[] = []
  private pauseReason = ''
  private breakpointsDone = false // 断点注册完才恢复入口暂停（避免入口暂停先恢复导致断点竞态）
  private entryArmed = false // runIfWaitingForDebugger 后的首个 paused 是 -brk 入口暂停，自动恢复一次
  private stopped = false
  private outputRing: string[] = []
  private consoleLines = new Set<string>() // consoleAPICalled 与 stdout 双通道去重
  private failReason: string | null = null // 启动失败/协议错误的说明（正常退出为 null）

  constructor(
    private readonly hooks: DebugHooks,
    private readonly sessionId: string,
    private readonly program: string,
    private readonly cwd: string,
    private readonly breakpoints: DebugBreakpointWire[],
  ) {}

  snapshot(pausedFrames?: { reason: string; frames: CdpCallFrame[] }): DebugStateSnapshot {
    const state: DebugRunState = pausedFrames !== undefined ? 'paused' : (this.stopped ? 'stopped' : (this.ws ? 'running' : 'starting'))
    const snap: DebugStateSnapshot = {
      state,
      program: this.program,
      cwd: this.cwd,
      breakpoints: this.breakpoints,
    }
    if (pausedFrames !== undefined) {
      const frames = pausedFrames.frames.map((f) => this.wireFrame(f))
      snap.paused = {
        reason: pausedFrames.reason,
        stoppedAt: frames[0] !== undefined ? { path: frames[0].path, line: frames[0].line } : null,
        frames,
      }
    }
    if (this.failReason !== null) snap.error = this.failReason
    return snap
  }

  private wireFrame(f: CdpCallFrame): DebugFrameWire {
    // paused 事件里帧的 url 字段常为空：用 location.scriptId 查 scriptParsed 表兜底
    const url = f.url !== '' ? f.url : (this.scriptUrls.get(f.location.scriptId) ?? '')
    return {
      id: f.callFrameId,
      name: f.functionName || '(anonymous)',
      path: cdpUrlToPath(url),
      line: f.location.lineNumber + 1,
      scopes: f.scopeChain
        .filter((s) => s.object.objectId !== undefined && s.object.objectId.length > 0)
        .map((s) => ({
          name: s.type === 'local' ? '局部变量' : s.type === 'closure' ? '闭包' : s.type === 'global' ? '全局' : s.type === 'module' ? '模块' : s.type === 'block' ? '块作用域' : (s.name ?? s.type),
          variablesReference: s.object.objectId as string,
        })),
    }
  }

  start(): void {
    this.emitOutput(`$ node ${this.program}`)
    let child: ChildProcess
    try {
      child = spawn('node', ['--inspect-brk=0', this.program], {
        cwd: this.cwd,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (e: unknown) {
      this.failStart(`无法启动进程: ${String(e)}`)
      return
    }
    this.child = child
    child.stdout?.on('data', (d: Buffer) => {
      const line = d.toString().trimEnd()
      // console.log 会同时走 stdout 和 Runtime.consoleAPICalled：两条通道到达顺序不定，
      // stdout 侧延迟 250ms 再发，若期间 consoleAPICalled 已发过同一行则丢弃（双行去重）
      setTimeout(() => {
        if (this.consoleLines.has(line)) {
          this.consoleLines.delete(line)
          return
        }
        this.emitOutput(line)
      }, 250)
    })
    child.stderr?.on('data', (d: Buffer) => {
      const text = d.toString()
      // node 会把 "Debugger listening on ws://..." 打到 stderr：从这里拿到端口
      const m = /Debugger listening on ws:\/\/([^\s]+)/.exec(text)
      if (m && this.ws === null && !this.stopped) {
        void this.connect(`ws://${m[1]}`)
      } else if (text.includes('Waiting for the debugger to disconnect')) {
        // 脚本已跑完，等调试客户端断开才退出：主动关 WS 让进程收尾 → exit 事件 → stopped
        this.ws?.close()
        this.ws = null
      } else if (!/^Debugger listening/.test(text.trim())) {
        this.emitOutput(text.trimEnd())
      }
    })
    child.on('exit', (code) => {
      if (!this.stopped) {
        this.stopped = true
        this.ws?.close()
        this.ws = null
        this.emitOutput(`进程退出 (code=${code ?? 'null'})`)
        this.hooks.onState(this.sessionId, this.snapshot())
      }
    })
    // 兜底：10 秒内没连上 Inspector 就报错停止（--inspect-brk=0 是随机端口，只能靠 stderr 行拿地址）
    setTimeout(() => {
      if (this.ws === null && !this.stopped) this.failStart('连接调试器超时（未能从 stderr 发现 Inspector 地址）')
    }, 10_000)
  }

  private failStart(message: string): void {
    this.failReason = message
    this.emitOutput(message)
    this.stopped = true
    this.child?.kill()
    this.hooks.onState(this.sessionId, this.snapshot())
  }

  private connect(url: string): Promise<void> {
    return new Promise((resolveConn) => {
      if (this.ws !== null || this.stopped) {
        resolveConn()
        return
      }
      const ws = new WebSocket(url)
      this.ws = ws
      ws.on('open', () => {
        void this.send('Runtime.enable', {})
          .then(() => this.send('Debugger.enable', {}))
          .then(async () => {
            // 注册断点（相对路径按 cwd 解析；realpath 对齐 node 实际脚本 URL——
            // macOS 上 /tmp 是 /private/tmp 的软链，URL 不一致会导致断点静默失效）
            for (const bp of this.breakpoints) {
              const abs = isAbsolute(bp.path) ? bp.path : resolve(this.cwd, bp.path)
              let real = abs
              try { real = realpathSync(abs) } catch { /* 文件暂不存在等加载时再命中 */ }
              const url = pathToFileURL(real).href
              const r = await this.send('Debugger.setBreakpointByUrl', { url, lineNumber: bp.line - 1, columnNumber: 0 })
              const locations = (r.locations as CdpLocation[] | undefined) ?? []
              if (locations.length === 0) {
                this.emitOutput(`⚠️ 断点 ${bp.path}:${bp.line} 未命中可执行行（脚本加载后生效）`)
              }
            }
            this.breakpointsDone = true
            this.hooks.onState(this.sessionId, this.snapshot())
            // -brk 的等待态必须先 runIfWaitingForDebugger 释放，脚本才会开始跑
            // （只发 resume 时脚本根本不启动：无 scriptParsed、断点永远不命中）。
            // 注意：这里不再显式 resume——释放后脚本停在入口（Break on start），
            // 由 paused 处理器里的 entryArmed 自动恢复一次；两处都 resume 会
            // 撞出 "Can only perform operation while paused" 并把会话打停。
            this.entryArmed = true
            await this.send('Runtime.runIfWaitingForDebugger', {})
          })
          .catch((e: unknown) => this.failStart(`调试协议初始化失败: ${String(e)}`))
        resolveConn()
      })
      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as CdpResponse & { method?: string; params?: Record<string, unknown> }
          if (msg.id !== undefined) {
            const p = this.pending.get(msg.id)
            if (p) {
              this.pending.delete(msg.id)
              if (msg.error) p.reject(new Error(msg.error.message))
              else p.resolve(msg.result ?? {})
            }
            return
          }
          this.onEvent(msg.method ?? '', msg.params ?? {})
        } catch {
          // 非法帧直接忽略（调试事件流不允许击穿）
        }
      })
      ws.on('error', (e) => {
        if (!this.stopped) this.failStart(`调试器连接错误: ${e.message}`)
      })
      ws.on('close', () => {
        this.ws = null
        if (!this.stopped) {
          this.stopped = true
          this.hooks.onState(this.sessionId, this.snapshot())
        }
      })
    })
  }

  private onEvent(method: string, params: Record<string, unknown>): void {
    switch (method) {
      case 'Debugger.scriptParsed': {
        const url = params.url as string | undefined
        const scriptId = params.scriptId as string | undefined
        if (url && scriptId) this.scriptUrls.set(scriptId, url)
        break
      }
      case 'Debugger.paused': {
        const reason = String(params.reason ?? 'other')
        const frames = (params.callFrames as CdpCallFrame[] | undefined) ?? []
        // -brk 的入口暂停（runIfWaitingForDebugger 释放后的第一个 paused）：自动恢复一次，
        // 让脚本跑到用户断点——不在断点注册前恢复，避免断点未生效脚本就跑完的竞态
        if (this.entryArmed) {
          this.entryArmed = false
          void this.send('Debugger.resume', {}).catch(() => {})
          return
        }
        // 断点注册完成前的其它暂停同样忽略（统一等注册完的那次 resume）
        if (!this.breakpointsDone) return
        this.pausedFrames = frames
        this.pauseReason = reason
        this.hooks.onState(this.sessionId, this.snapshot({ reason, frames }))
        break
      }
      case 'Debugger.resumed': {
        this.pausedFrames = []
        this.pauseReason = ''
        this.hooks.onState(this.sessionId, this.snapshot())
        break
      }
      case 'Runtime.consoleAPICalled': {
        const args = (params.args as Array<{ value?: unknown; description?: string; type?: string }> | undefined) ?? []
        const line = args.map((a) => (a.description !== undefined && a.description !== '' ? a.description : String(a.value ?? a.type ?? ''))).join(' ')
        this.consoleLines.add(line)
        this.emitOutput(line)
        break
      }
      case 'Runtime.exceptionThrown': {
        const details = params.exceptionDetails as { text?: string; exception?: { description?: string } } | undefined
        this.emitOutput(`💥 未捕获异常: ${details?.exception?.description ?? details?.text ?? 'unknown'}`)
        break
      }
      default:
        break
    }
  }

  private send(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    return new Promise((resolveSend, rejectSend) => {
      const ws = this.ws
      if (ws === null || ws.readyState !== WebSocket.OPEN) {
        rejectSend(new Error('调试器未连接'))
        return
      }
      const id = this.nextId++
      this.pending.set(id, { resolve: resolveSend, reject: rejectSend })
      ws.send(JSON.stringify({ id, method, params }))
    })
  }

  private emitOutput(line: string): void {
    if (line.length === 0) return
    this.outputRing.push(line)
    if (this.outputRing.length > OUTPUT_CAP) this.outputRing.shift()
    this.hooks.onOutput(this.sessionId, line)
  }

  async command(action: 'resume' | 'step' | 'step_out'): Promise<void> {
    if (this.ws === null || this.stopped) return
    const method = action === 'resume' ? 'Debugger.resume' : action === 'step' ? 'Debugger.stepOver' : 'Debugger.stepOut'
    await this.send(method, {})
  }

  /** 读取变量并广播到手机（手机按钮走这条）。 */
  async variables(variablesReference: string): Promise<void> {
    if (this.ws === null || this.stopped) return
    const vars = await this.variablesFor(variablesReference)
    this.hooks.onVariables(this.sessionId, variablesReference, vars)
  }

  /** 读取变量并返回列表（Agent 调试工具走这条；不触发广播）。 */
  async variablesFor(variablesReference: string): Promise<DebugVariableWire[]> {
    if (this.ws === null || this.stopped) return []
    try {
      const r = await this.send('Runtime.getProperties', {
        objectId: variablesReference,
        ownProperties: true,
        generatePreview: true,
      })
      const result = (r.result as Array<{
        name: string
        value?: { type?: string; value?: unknown; description?: string; objectId?: string; className?: string }
      }> | undefined) ?? []
      return result
        .filter((p) => p.value !== undefined)
        .map((p) => {
          const v = p.value as { type?: string; value?: unknown; description?: string; objectId?: string; className?: string }
          const type = v.type ?? 'unknown'
          const hasChildren = v.objectId !== undefined && v.objectId.length > 0
          const value = v.description ?? (type === 'string' ? JSON.stringify(v.value) : String(v.value ?? type))
          return {
            name: p.name,
            value: value.slice(0, 500),
            type,
            hasChildren,
            variablesReference: hasChildren ? (v.objectId as string) : '',
          }
        })
    } catch {
      return []
    }
  }

  async stop(): Promise<void> {
    this.stopped = true
    this.breakpointsDone = true
    try {
      if (this.ws !== null && this.ws.readyState === WebSocket.OPEN) {
        await this.send('Debugger.disable', {})
      }
    } catch {
      // 忽略：进程可能已退出
    }
    this.ws?.close()
    this.ws = null
    this.child?.kill()
  }
}

/** 把 CDP 的 file:// URL 还原成文件路径（失败时原样返回）；macOS 显示时把 /private/tmp 归一为 /tmp。 */
function cdpUrlToPath(url: string): string {
  if (!url.startsWith('file://')) return url
  try {
    const p = fileURLToPath(url)
    return p.startsWith('/private/tmp/') ? p.slice('/private'.length) : p
  } catch {
    return url
  }
}

export class DebugManager {
  private sessions = new Map<string, InspectorSession>()

  constructor(private readonly hooks: DebugHooks) {}

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId)
  }

  snapshotOf(sessionId: string): DebugStateSnapshot | null {
    const s = this.sessions.get(sessionId)
    return s ? s.snapshot() : null
  }

  start(sessionId: string, opts: DebugStartOptions): DebugStateSnapshot {
    if (this.sessions.has(sessionId)) {
      throw new Error('该会话已有调试进程在运行')
    }
    const program = opts.program.trim()
    if (program.length === 0) throw new Error('program 不能为空')
    const cwd = opts.cwd ?? process.cwd()
    // 会话自然结束（进程退出/失败）后从注册表移除：否则永远无法对该会话再次启动调试
    // （stop() 路径会 delete，但自然退出路径此前漏了，导致"已有调试进程在运行"卡死）
    const hooks: DebugHooks = {
      ...this.hooks,
      onState: (sid, snap) => {
        if (snap.state === 'stopped' && this.sessions.get(sid) !== undefined) {
          this.sessions.delete(sid)
        }
        this.hooks.onState(sid, snap)
      },
    }
    const session = new InspectorSession(hooks, sessionId, program, cwd, opts.breakpoints ?? [])
    this.sessions.set(sessionId, session)
    logger.info('DEBUG', `启动调试 session=${sessionId.slice(0, 12)} program=${program} breakpoints=${(opts.breakpoints ?? []).length}`)
    session.start()
    return session.snapshot()
  }

  command(sessionId: string, action: 'resume' | 'step' | 'step_out'): void {
    const s = this.sessions.get(sessionId)
    if (s === undefined) throw new Error('该会话没有调试进程')
    void s.command(action)
  }

  variables(sessionId: string, variablesReference: string): void {
    const s = this.sessions.get(sessionId)
    if (s === undefined) throw new Error('该会话没有调试进程')
    void s.variables(variablesReference)
  }

  /** 读取变量并返回（Agent 调试工具用；不广播）。 */
  async variablesFor(sessionId: string, variablesReference: string): Promise<DebugVariableWire[]> {
    const s = this.sessions.get(sessionId)
    if (s === undefined) throw new Error('该会话没有调试进程')
    return s.variablesFor(variablesReference)
  }

  async stop(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId)
    if (s !== undefined) {
      await s.stop()
      this.sessions.delete(sessionId)
      this.hooks.onState(sessionId, { state: 'stopped', program: s.snapshot().program, cwd: s.snapshot().cwd, breakpoints: [] })
    }
  }
}
