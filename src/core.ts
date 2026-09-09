import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { hostname, homedir, networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { createServer, type IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocket, WebSocketServer } from 'ws'
import QRCode from 'qrcode'
import { Context } from '@deepseek-ai/cordis'
import { installModelSelection, type Agent, type ModelSelection, type ModelSelectionRef } from '@deepseek-ai/dsh-agent'
import { createUserMessage, MessageId, type ContentBlock } from '@deepseek-ai/dsh-llm'
import { SessionId, type Session, type SessionEvent, type SessionHeader } from '@deepseek-ai/dsh-session'
import type { WebRoute, WebUpgradeRoute } from '@deepseek-ai/dsh-host-webserver'
import { setApprovalPolicy } from '@deepseek-ai/dsh-user-approval'
import type { SessionProjectionCache } from '@deepseek-ai/dsh-session-projection-cache'
import type {} from '@deepseek-ai/dsh-session-title'
import type {} from '@deepseek-ai/dsh-workspace'
import type {} from '@deepseek-ai/dsh-session-persistence'
import { LspManager } from './lsp.js'
import { LspFeedback, lspFeedbackEnabledFromEnv } from './lsp-feedback.js'
import { DebugManager, type DebugBreakpointWire } from './debug.js'
import { loadWorkState, writeWorkState, type QueueSnapshotItem } from './work.js'
import { withTimeout } from './deadline.js'
import { defineTool } from '@deepseek-ai/dsh-tools'

import {
  BRIDGE_VERSION,
  type AgentSummary,
  type ApprovalRequestWire,
  type ClientCommand,
  type CmdSendMessage,
  type CommandWire,
  type DeviceRecord,
  type DiffWire,
  type EventProjection,  type EventSource,  type EvHello,
  type DeliveryNoticeWire,
  type GoalWire,
  type LogEntryWire,
  type PairInfo,
  type QuestionRequestWire,
  type QueueItemWire,
  type ServerEvent,
  type SessionSummary,
  type TodoWire,
  type WorkspaceSummary,
} from './protocol.js'
import { ConnLogger } from './logger.js'
import { loadDeliveries, writeDeliveries, type DeliveryRecord } from './deliveries.js'
import { allowLocalOrEnvToken, bearerToken, denied, isLoopback, isLoopbackHostHeader, json } from './auth.js'

// core 版本号对外暴露（ReloadController 读取 mod.BRIDGE_VERSION 作为 /remote/hot 的 coreVersion）
export { BRIDGE_VERSION } from './protocol.js'

export const name = 'dsh-remote-control-bridge-core'
export const inject = ['webServer', 'sessions', 'agents', 'workspaceRegistry', 'sessionTitle', 'sessionPersistence', 'tools']

const PAIR_TTL_MS = 10 * 60_000

/** 连接层结构化日志（基础组件；/remote/logs 可查）。 */
const logger = new ConnLogger('dsh-remote-control-bridge')

/**
 * 斜杠命令显示元数据：commandId → { name, args }。command/done 事件本身不带命令名，
 * 用 command/run 时记下的元数据补齐，让 done 行（含历史回放）总能渲染出 "/compact …"。
 * 仅内存缓存（命令行显示用），上限防泄漏。模块级：projectEvent 与 apply 内共用。
 */
const commandMeta = new Map<string, { name: string; args: string }>()

// ---- send_message 幂等去重（at-least-once 语义）----
// 只记录「成功投递」的 msgId（{ok:true}）；失败不落 Map——客户端用同 msgId 重试时服务端会重新投递，
// 这才是 at-least-once 的正确实现（若把失败也缓存，重试会被误判为「已处理」而静默丢弃）。
// 模块级：热重载（apply 重建）后仍保留，避免 reload 窗口内同 msgId 重复投递。
// 清理：查命中按 TTL 惰性过期 + 写满 MSGID_MAX 时逐出最旧（Map 插入序 = 时间序）。
const MSGID_TTL_MS = 10 * 60_000
const MSGID_MAX = 10_000
const processedMsgIds = new Map<string, { ok: boolean; ts: number }>()

// ---- persisted per-machine fingerprint + paired devices (under $DSH_HOME) ----

const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const serverId = loadOrCreateServerId()
const host = hostname()
/** 持久化工作状态：重启后自报版本 + 恢复进行中事项/待办（自动续跑）。 */
const WORK_FILE = join(dshHome, 'remote-control-work.json')
/** 结果交付通知台账：会话×轮次的交付事件持久化（重连补发，不丢）。 */
const DELIVERIES_FILE = join(dshHome, 'remote-control-deliveries.json')

interface StoredDevice extends DeviceRecord {
  token: string
}
interface DeviceFile {
  version: 1
  devices: StoredDevice[]
}

function loadOrCreateServerId(): string {
  const file = join(dshHome, 'remote-control-bridge-id')
  try {
    if (existsSync(file)) {
      const id = readFileSync(file, 'utf8').trim()
      if (/^[0-9a-f-]{36}$/.test(id)) return id
    }
    const id = randomUUID()
    mkdirSync(dshHome, { recursive: true })
    writeFileSync(file, id, { mode: 0o600 })
    return id
  } catch (e) {
    console.error(`[dsh-remote-control-bridge] cannot persist server id: ${e}`)
    return randomUUID()
  }
}

function loadDevices(): StoredDevice[] {
  const file = join(dshHome, 'remote-control-devices.json')
  try {
    if (!existsSync(file)) return []
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as DeviceFile
    return Array.isArray(parsed.devices) ? parsed.devices : []
  } catch (e) {
    console.error(`[dsh-remote-control-bridge] cannot read devices file: ${e}`)
    return []
  }
}

function saveDevices(devices: StoredDevice[]): void {
  const file = join(dshHome, 'remote-control-devices.json')
  try {
    mkdirSync(dshHome, { recursive: true })
    const payload: DeviceFile = { version: 1, devices }
    writeFileSync(file, JSON.stringify(payload, null, 2), { mode: 0o600 })
  } catch (e) {
    console.error(`[dsh-remote-control-bridge] cannot persist devices: ${e}`)
  }
}

// eslint-disable-next-line max-lines-per-function -- P0 存量豁免（apply 为启动装配超大函数，TODO 拆分），见 docs/lint-rules.md
export function apply(ctx: Context) {
  // Token: reuse DSH_REMOTE_TOKEN, otherwise generate one and surface it once.
  const envToken = process.env.DSH_REMOTE_TOKEN ?? ''
  if (!envToken) {
    console.log(
      `[dsh-remote-control-bridge] no DSH_REMOTE_TOKEN set — clients may connect unauthenticated ` +
        `(bridge binds to the loopback web server only).`,
    )
  }

  const clients = new Set<WebSocket>()
  let devices = loadDevices()
  const pairTokens = new Map<string, number>() // token -> expiry epoch ms
  const thinkStreams = new Map<string, { text: string; timer?: NodeJS.Timeout }>() // sessionId -> 思考流累积
  const pairPrune = setInterval(() => {
    const now = Date.now()
    for (const [t, exp] of pairTokens) if (exp < now) pairTokens.delete(t)
  }, 60_000)
  pairPrune.unref?.()

  // ---- 启动自检：版本 + 待办恢复（重启后自动续跑，不等客户端来问）----
  const bootedAt = Date.now()
  const bootWork = loadWorkState(WORK_FILE)
  const recentClients = devices.filter((d) => d.lastSeenAt !== undefined && Date.now() - d.lastSeenAt < 24 * 3600_000)
  logger.info('BOOT', `bridge ${BRIDGE_VERSION} 启动完成 serverId=${serverId.slice(0, 8)} host=${host} 会话=${ctx.sessions.list().length} 已配对设备=${devices.length}（24h 内活跃 ${recentClients.length}）`)
  if (bootWork !== null && (bootWork.activity !== null || bootWork.pending.length > 0)) {
    logger.info('WORK', `待办恢复：活动="${bootWork.activity ?? '-'}" · 待办 ${bootWork.pending.length} 条`)
    for (const p of bootWork.pending) logger.info('WORK', `  - ${p}`)
  } else {
    logger.info('WORK', '无待办事项')
  }
  // 自动续跑（根治版）：boot 立即尝试一次 + agent 挂载（agent/created）/上线（agent/status running）
  // 事件即时补注入 + 定时器兜底。首轮兜底间隔可用 DSH_REMOTE_RESUME_DELAY_MS 调小（测试用）；
  // 事件触发已覆盖绝大多数场景，定时器只兜「事件早于 bridge 注册而错过 / agent 一直不挂载」等极端情况。
  // 具体调度放在 resumeTick 定义之后（此处 resumeTick 尚未声明，无法立即调用）。
  const resumeDelayMs = Number(process.env.DSH_REMOTE_RESUME_DELAY_MS ?? 20_000)

  const upsertDevice = (deviceId: string, name: string, model?: string): StoredDevice => {
    const now = Date.now()
    const existing = devices.find((d) => d.deviceId === deviceId)
    if (existing) {
      existing.name = name || existing.name
      if (model) existing.model = model
      existing.lastSeenAt = now
      saveDevices(devices)
      return existing
    }
    const rec: StoredDevice = {
      deviceId,
      name: name || host,
      model,
      createdAt: now,
      lastSeenAt: now,
      token: randomBytes(24).toString('hex'),
    }
    devices.push(rec)
    saveDevices(devices)
    return rec
  }

  const deviceByToken = (token: string): StoredDevice | undefined =>
    devices.find((d) => d.token === token)

  // ---- helpers ----
  const allAgents = (): Agent[] => ctx.agents.list()
  const agentOf = (sessionId: string): Agent | undefined =>
    allAgents().find((a) => String(a.id) === sessionId)

  // ---- 休眠会话自动打开（与 DSH Web 的 prompt 同一恢复机制）----
  // DSH Web 在侧边栏点开休眠会话时并不挂载 agent（sessions.history 只读持久化日志），
  // 真正挂载发生在发送消息时：dsh-host-apiproxy 的 agentFor → ctx.agents.resume。
  // 本 bridge 复刻同款机制，让手机对休眠会话 send_message 时自动打开再投递：
  //   · 顶层会话：ctx.agents.resume（挂 preset + 装模型选择）后 followup；
  //   · 子代理会话：先 resume 父会话，再经 ctx.subagents.followup 冷恢复并投递
  //     （子代理由 subagent 路由拥有，不能用 ctx.agents.resume 直接拉起，否则会
  //     丢失 persona/toolFilter/父子归属，官方 apiproxy 也会拒绝子代理走通用路由）。
  interface AgentDefaultModelLike {
    currentSelection(): ModelSelection | undefined
  }
  interface AgentPresetsLike {
    mount(agentCtx: unknown, presetId: string | undefined): Promise<unknown>
  }
  interface SubagentsLike {
    followup(
      parent: Agent,
      childId: unknown,
      content: ContentBlock[],
      options: { source: { kind: 'user' }; signal: AbortSignal },
    ): Promise<unknown>
  }
  /** 会话实际运行的 preset：后选优先，无事件回退 header（与 dsh-agent-presets 同款）。 */
  const sessionPresetOf = (session: Session): string | undefined => {
    for (let i = session.events.length - 1; i >= 0; i -= 1) {
      const ev = session.events[i]
      if (ev !== undefined && (ev.type as string) === 'agent-preset/selected') {
        return (ev.data as { agentPreset?: string } | undefined)?.agentPreset
      }
    }
    return session.header.agentPreset
  }
  /** 复刻 apiproxy selectionFor：优先会话最近记录模型，回退 agentDefaultModel（只读，不做切换）。 */
  const modelSelectionOf = (agent: Agent): ModelSelectionRef => ({
    get current(): ModelSelection | undefined {
      const logged = agent.session.requestHeader()?.config
      if (logged !== undefined && logged.provider !== undefined && logged.model !== undefined) {
        return {
          provider: logged.provider,
          model: logged.model,
          ...(logged.reasoningEffort === undefined ? {} : { reasoningEffort: logged.reasoningEffort }),
        }
      }
      const dm = ctx.get('agentDefaultModel') as AgentDefaultModelLike | undefined
      return dm?.currentSelection()
    },
    set current(_next: ModelSelection | undefined) { /* 手机端只读，不做模型切换 */ },
    assembled: undefined,
  })
  /** 按 sessionId 取 header：先查活跃会话，再查持久化层（供子代理判定用）。 */
  const sessionHeaderOf = async (sessionId: string): Promise<SessionHeader | undefined> => {
    const live = ctx.sessions.list().find((s) => String(s.id) === sessionId)
    if (live !== undefined) return live.header
    if (!ctx.sessionPersistence) return undefined
    try {
      const headers = await ctx.sessionPersistence.list()
      return headers.find((h) => String(h.id) === sessionId)
    } catch (e: unknown) {
      logger.warn('SESSION', `冷会话 header 读取失败 session=${sessionId.slice(0, 12)}: ${String(e)}`)
      return undefined
    }
  }
  // 并发去重：同一休眠会话的恢复请求合并（与 apiproxy 的 sessionCreations/resumes 去重同义）
  const resumeInflight = new Map<string, Promise<{ agent?: Agent; error?: string }>>()
  /** 打开一个顶层休眠会话（官方 ctx.agents.resume），返回挂载后的 agent；失败返回 error。 */
  const resumeAgent = (sessionId: string): Promise<{ agent?: Agent; error?: string }> => {
    const live = agentOf(sessionId)
    if (live !== undefined) return Promise.resolve({ agent: live })
    const pending = resumeInflight.get(sessionId)
    if (pending !== undefined) return pending
    const run = (async (): Promise<{ agent?: Agent; error?: string }> => {
      try {
        const presets = ctx.get('agentPresets') as AgentPresetsLike | undefined
        const handle = await ctx.agents.resume({
          resumeSessionId: SessionId(sessionId),
          setup: async (agentCtx) => {
            const agent = agentCtx.agent
            if (agent === undefined) throw new Error('dsh-remote-control-bridge: resume setup 缺少 scoped agent')
            // 1) 模型选择（会话最近记录 → agentDefaultModel 兜底），与 Web 的 installSelection 对齐
            installModelSelection(agentCtx, modelSelectionOf(agent))
            // 2) 挂载 preset（有 agentPresets 服务时）：恢复该会话的工具/提示词/目标等能力
            if (presets !== undefined) await presets.mount(agentCtx, sessionPresetOf(agent.session))
          },
        })
        logger.info('SESSION', `休眠会话自动打开 session=${sessionId.slice(0, 12)}（DSH Web 同款 agents.resume）`)
        return { agent: handle.agent }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        logger.warn('SESSION', `休眠会话自动打开失败 session=${sessionId.slice(0, 12)}: ${msg}`)
        return { error: msg }
      }
    })()
    resumeInflight.set(sessionId, run)
    void run.finally(() => {
      if (resumeInflight.get(sessionId) === run) resumeInflight.delete(sessionId)
    })
    return run
  }
  /** 子代理会话发消息：先拉起父会话，再经官方 ctx.subagents.followup 冷恢复并投递。返回投递是否成功（供 ack）。 */
  const deliverSubagent = async (ws: WebSocket, cmd: CmdSendMessage, header: SessionHeader): Promise<boolean> => {
    const subagents = ctx.get('subagents') as SubagentsLike | undefined
    if (subagents === undefined || typeof subagents.followup !== 'function') {
      send(ws, { type: 'error', code: 'subagent_unavailable', message: '该部署未挂载子代理续跑服务，无法恢复子代理会话' })
      return false
    }
    const parentId = header.parentSession
    if (parentId === undefined) {
      send(ws, { type: 'error', code: 'not_running', message: '子代理会话缺少父会话归属，无法恢复' })
      return false
    }
    const parentRes = await resumeAgent(String(parentId))
    if (parentRes.agent === undefined) {
      send(ws, {
        type: 'error',
        code: 'not_running',
        message: `无法打开该子代理会话的父会话 ${String(parentId).slice(0, 12)}：${parentRes.error ?? '未知原因'}`,
      })
      return false
    }
    try {
      await subagents.followup(
        parentRes.agent,
        SessionId(cmd.sessionId),
        [{ type: 'text', text: cmd.text }],
        { source: { kind: 'user' }, signal: new AbortController().signal },
      )
      logger.info('SUBAGENT', `子代理会话冷恢复并投递消息 child=${cmd.sessionId.slice(0, 12)} parent=${String(parentId).slice(0, 12)}`)
      return true
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.warn('SUBAGENT', `子代理会话冷恢复/投递失败 child=${cmd.sessionId.slice(0, 12)}: ${msg}`)
      send(ws, { type: 'error', code: 'subagent_unavailable', message: `子代理会话恢复失败：${msg}` })
      return false
    }
  }

  /** 投影缓存服务（软依赖：headless 部署可缺省，降级 header 信息）。 */
  const projectionCache = (): SessionProjectionCache | undefined =>
    ctx.get('sessionProjectionCache') as SessionProjectionCache | undefined

  /** dsh-goal 软类型（bridge 编译面不含 dsh-goal 包；运行时 ctx.goals 由 profile 提供）。 */
  interface GoalViewLike {
    objective: string
    phase: 'active' | 'paused' | 'blocked' | 'complete'
    blockedReason?: { code?: string; message?: string }
    maxGoalRounds: number
    roundsStarted: number
    updatedAt: number
  }
  interface GoalProjectionLike {
    goal?: {
      objective: string
      phase: 'active' | 'paused' | 'blocked' | 'complete'
      blockedReason?: { code?: string; message?: string }
      maxGoalRounds: number
    } | null
    roundsStarted?: number
    updatedAt?: number
  }
  const goalWireFromView = (v: GoalViewLike): GoalWire => ({
    objective: v.objective,
    phase: v.phase,
    blockedCode: v.blockedReason?.code,
    blockedMessage: v.blockedReason?.message,
    maxGoalRounds: v.maxGoalRounds,
    roundsStarted: v.roundsStarted,
    updatedAt: v.updatedAt,
  })
  const goalWireFromProjection = (p: GoalProjectionLike | null | undefined): GoalWire | null => {
    const g = p?.goal
    if (g === null || g === undefined) return null
    return {
      objective: g.objective,
      phase: g.phase,
      blockedCode: g.blockedReason?.code,
      blockedMessage: g.blockedReason?.message,
      maxGoalRounds: g.maxGoalRounds,
      roundsStarted: p?.roundsStarted ?? 0,
      updatedAt: p?.updatedAt ?? 0,
    }
  }
  /** 活会话目标：ctx.goals.get(agent)（GoalView，含轮次）；失败/无 agent 回退 goal 投影快照。 */
  const goalWireOf = (sessionId: string): GoalWire | null => {
    try {
      const session = ctx.sessions.list().find((s) => String(s.id) === sessionId)
      if (session === undefined) return null
      // ctx.get 是软读（无需 inject 声明）；属性直读会触发 cordis 的 inject 陷阱抛错
      const goals = ctx.get('goals') as { get(agent: unknown): GoalViewLike | undefined } | undefined
      const agent = ctx.agents.get(session.id)
      const view = agent !== undefined ? goals?.get(agent) : undefined
      if (view !== undefined) return goalWireFromView(view)
      const proj = ctx.get('sessionProjections') as
        | { snapshot(s: unknown): { values: Record<string, unknown> } }
        | undefined
      return goalWireFromProjection(proj?.snapshot(session).values?.['goal'] as GoalProjectionLike | null | undefined)
    } catch (e: unknown) {
      logger.warn('GOAL', `读取会话 ${sessionId.slice(0, 12)} 目标失败（降级隐藏）: ${String(e)}`)
      return null
    }
  }

  /** 活会话的任务列表（todos 投影，todo/write 事件全量快照；turn/start 后清空）。 */
  const todosOfSession = (session: Session): TodoWire[] => {
    try {
      const proj = ctx.get('sessionProjections') as
        | { snapshot(s: unknown): { values: Record<string, unknown> } }
        | undefined
      const todos = proj?.snapshot(session).values?.['todos'] as Array<{ content: string; status: string }> | null | undefined
      if (!Array.isArray(todos)) return []
      return todos
        .filter((t) => t !== null && typeof t === 'object' && typeof t.content === 'string')
        .map((t) => ({ content: t.content, status: typeof t.status === 'string' ? t.status : 'pending' }))
    } catch {
      return []
    }
  }
  const todosWireOf = (sessionId: string): TodoWire[] => {
    const session = ctx.sessions.list().find((s) => String(s.id) === sessionId)
    return session === undefined ? [] : todosOfSession(session)
  }
  /** 从投影快照 values 提取 todos（冷会话订阅用）。 */
  const todosFromValues = (values: Record<string, unknown> | undefined): TodoWire[] => {
    const todos = values?.['todos'] as Array<{ content: string; status: string }> | null | undefined
    if (!Array.isArray(todos)) return []
    return todos
      .filter((t) => t !== null && typeof t === 'object' && typeof t.content === 'string')
      .map((t) => ({ content: t.content, status: typeof t.status === 'string' ? t.status : 'pending' }))
  }

  /**
   * 从投影快照 values 提取子代理 identity 的 label（创建该子代理时 tool/call 的 description）。
   * dsh-subagent 的 `subagent` 投影把 child 自身日志里的 `subagent/descriptor` 事件折成
   * `{ mode, label, seq }`，其中 label 正是主 agent 派发时写的 5~10 字凝练描述。
   */
  const subagentLabelFromValues = (values: Record<string, unknown> | undefined): string | undefined => {
    const identity = values?.['subagent'] as { label?: unknown } | null | undefined
    if (identity === null || typeof identity !== 'object') return undefined
    const label = identity.label
    if (typeof label !== 'string') return undefined
    const trimmed = label.replace(/\s+/g, ' ').trim()
    return trimmed.length > 0 ? trimmed : undefined
  }

  /** 活子代理会话的 description：读 sessionProjections 快照（软依赖，缺失降级）。 */
  const subagentLabelOfLive = (s: Session): string | undefined => {
    try {
      const proj = ctx.get('sessionProjections') as
        | { snapshot(s: unknown): { values: Record<string, unknown> } }
        | undefined
      return subagentLabelFromValues(proj?.snapshot(s).values)
    } catch {
      return undefined
    }
  }

  /** 活会话投影快照 values（软依赖：headless 部署可缺省 → 元信息字段随之缺省）。 */
  const liveProjectionValues = (s: Session): Record<string, unknown> | undefined => {
    try {
      const proj = ctx.get('sessionProjections') as
        | { snapshot(s: unknown): { values: Record<string, unknown> } }
        | undefined
      return proj?.snapshot(s).values
    } catch {
      return undefined
    }
  }

  /**
   * 从投影快照 values 提取累计运行时长：sessionStats 投影的 llmMs + toolMs
   * （模型 wall time + 工具 wall time，跨重启持久化的权威来源）。无该投影时缺省。
   */
  const runDurationMsFromValues = (values: Record<string, unknown> | undefined): number | undefined => {
    const stats = values?.['sessionStats'] as { llmMs?: unknown; toolMs?: unknown } | null | undefined
    if (stats === null || typeof stats !== 'object') return undefined
    const llm = typeof stats.llmMs === 'number' ? stats.llmMs : 0
    const tool = typeof stats.toolMs === 'number' ? stats.toolMs : 0
    return llm + tool
  }

  /**
   * 从投影快照 values 提取累计 token 总量：tokenUsage 投影四桶之和
   * （uncachedInput + output + cacheRead + cacheWrite，provider 上报，跨重启持久化）。无该投影时缺省。
   */
  const totalTokensFromValues = (values: Record<string, unknown> | undefined): number | undefined => {
    const usage = values?.['tokenUsage'] as
      | { uncachedInputTokens?: unknown; outputTokens?: unknown; cacheReadTokens?: unknown; cacheWriteTokens?: unknown }
      | null | undefined
    if (usage === null || typeof usage !== 'object') return undefined
    const buckets = [
      usage.uncachedInputTokens,
      usage.outputTokens,
      usage.cacheReadTokens,
      usage.cacheWriteTokens,
    ]
    let total = 0
    let seen = false
    for (const b of buckets) {
      if (typeof b === 'number') {
        total += b
        seen = true
      }
    }
    return seen ? total : undefined
  }

  /** Desktop display title: durable title, cwd basename, then id. */
  const displayTitleOf = (s: Session): string => {
    // 子代理会话：标题优先取创建时的 description（subagent 投影 label，高度凝练）
    if (s.header.parentSession !== undefined) {
      const label = subagentLabelOfLive(s)
      if (label) return label
    }
    const title = ctx.sessionTitle.get(s)?.title
    if (title) return title
    const cwd = s.header.cwd
    if (cwd) {
      const base = cwd.replace(/[/\\]+$/, '').split(/[/\\]/).pop()
      if (base) return base
    }
    return String(s.id)
  }

  const listWorkspaces = (): WorkspaceSummary[] =>
    ctx.workspaceRegistry.list().map((w) => ({
      id: String(w.id),
      title: w.title,
      path: w.path,
      sessionCount: w.sessionIds.length,
    }))

  const workspaceIdOf = (sessionId: string): string | null => {
    for (const w of ctx.workspaceRegistry.list()) {
      if (w.sessionIds.some((sid) => String(sid) === sessionId)) return String(w.id)
    }
    return null
  }

  /** 活跃会话的行投影（agent 未挂载时为 idle）。 */
  const sessionRowFromLive = (s: Session): SessionSummary => {
    const id = String(s.id)
    const a = agentOf(id)
    const updatedAt = lastEventTime(s)
    const values = liveProjectionValues(s)
    const runDurationMs = runDurationMsFromValues(values)
    const totalTokens = totalTokensFromValues(values)
    return {
      id,
      name: displayTitleOf(s),
      cwd: s.header.cwd ?? '',
      workspaceId: workspaceIdOf(id),
      status: a?.status ?? 'idle',
      agentCount: a ? 1 : 0,
      subagentCount: allAgents().filter(
        (x) => String(x.session.header.parentSession) === id && isSubagent(x),
      ).length,
      updatedAt,
      lastMessageAt: updatedAt,
      // 子代理会话：挂在主会话下，客户端不列入顶层会话列表
      ...(s.header.parentSession !== undefined ? { parentSessionId: String(s.header.parentSession) } : {}),
      // 元信息（服务端权威投影；缺省字段客户端不渲染对应段）
      ...(runDurationMs !== undefined ? { runDurationMs } : {}),
      ...(totalTokens !== undefined ? { totalTokens } : {}),
    }
  }

  /** 冷会话标题回退（无投影缓存行时）：cwd basename → id。 */
  const coldFallbackTitle = (h: SessionHeader): string => {
    const cwd = h.cwd
    if (cwd) {
      const base = cwd.replace(/[/\\]+$/, '').split(/[/\\]/).pop()
      if (base) return base
    }
    return String(h.id)
  }

  /**
   * 冷会话行：投影缓存零日志读取（title / sessionListMetadata 检查点），
   * 与桌面端 session.list 同源；失败降级为 header 信息，绝不读全量日志
   * （大日志的同步 JSON 解析会阻塞事件循环，曾导致整个服务卡死）。
   */
  const coldRowFromCache = (h: SessionHeader): SessionSummary => {
    let title: string | undefined
    let lastPromptAt: number | null = null
    let values: Record<string, unknown> | undefined
    try {
      const snap = projectionCache()?.cachedSnapshot(h)
      values = snap?.values as Record<string, unknown> | undefined
      const titleVal = values?.['title']
      if (typeof titleVal === 'string' && titleVal.length > 0) title = titleVal
      // 子代理会话：标题优先取创建时的 description（subagent 投影 label，零日志读取）
      if (h.parentSession !== undefined) {
        const subagentLabel = subagentLabelFromValues(values)
        if (subagentLabel) title = subagentLabel
      }
      const meta = values?.['sessionListMetadata'] as { blank?: boolean; lastPromptAt?: number | null } | undefined
      if (typeof meta?.lastPromptAt === 'number') lastPromptAt = meta.lastPromptAt
    } catch (e: unknown) {
      logger.warn('SESSION', `冷会话 ${String(h.id)} 投影缓存读取失败（降级 header）: ${String(e)}`)
    }
    const updatedAt = Math.max(h.createdAt, lastPromptAt ?? 0)
    const runDurationMs = runDurationMsFromValues(values)
    const totalTokens = totalTokensFromValues(values)
    return {
      id: String(h.id),
      name: title ?? coldFallbackTitle(h),
      cwd: h.cwd ?? '',
      workspaceId: workspaceIdOf(String(h.id)),
      status: 'idle',
      agentCount: 0,
      subagentCount: 0,
      updatedAt,
      lastMessageAt: updatedAt,
      // 子代理会话：挂在主会话下，客户端不列入顶层会话列表
      ...(h.parentSession !== undefined ? { parentSessionId: String(h.parentSession) } : {}),
      // 元信息（服务端权威投影；投影缓存缺这些单元时字段缺省，客户端不渲染对应段）
      ...(runDurationMs !== undefined ? { runDurationMs } : {}),
      ...(totalTokens !== undefined ? { totalTokens } : {}),
    }
  }

  /**
   * 完整会话列表 = 活跃会话（内存 store）+ 冷会话（持久化层 headers）。
   * 修复「工作区计数来自 registry，而 list 只含活跃会话」导致的数据不一致。
   * 结果按 updatedAt 倒序；5s 内存 memo 消化 hello/list/ping 连发。
   */
  let sessionsMemo: { at: number; rows: SessionSummary[] } | null = null
  const listSessions = async (): Promise<SessionSummary[]> => {
    const now = Date.now()
    if (sessionsMemo && now - sessionsMemo.at < 5_000) return sessionsMemo.rows

    const persistence = ctx.sessionPersistence
    const live = new Map(ctx.sessions.list().map((s) => [String(s.id), s]))
    const rows: SessionSummary[] = []

    let headers: SessionHeader[] = []
    try {
      headers = persistence ? await persistence.list() : []
    } catch (e: unknown) {
      logger.warn('SESSION', `persistence.list 失败: ${String(e)}`)
    }
    for (const h of headers) {
      const id = String(h.id)
      const ls = live.get(id)
      if (ls) {
        rows.push(sessionRowFromLive(ls))
        live.delete(id)
        continue
      }
      // 冷会话：零日志读取——投影缓存（title / sessionListMetadata 检查点）
      // 与桌面端 session.list 同源。绝不全量读日志：大日志的同步 JSON 解析
      // 会阻塞事件循环（曾导致整个服务卡死）。
      rows.push(coldRowFromCache(h))
    }
    for (const ls of live.values()) rows.push(sessionRowFromLive(ls))
    rows.sort((a, b) => b.updatedAt - a.updatedAt)
    sessionsMemo = { at: now, rows }
    return rows
  }

  const listAgents = (): AgentSummary[] =>
    allAgents().map((a) => ({
      sessionId: String(a.id),
      role: isSubagent(a) ? 'subagent' : 'primary',
      status: a.status,
      depth: a.session.header.delegationDepth ?? 0,
    }))

  const snapshot = async (): Promise<EvHello> => ({
    type: 'hello',
    version: BRIDGE_VERSION,
    serverId,
    hostname: host,
    sessions: await listSessions(),
    agents: listAgents(),
    workspaces: listWorkspaces(),
    pendingApprovals: pendingApprovalList(),
    pendingRemoteApprovals: [...muxRemoteApprovals.values()],
    pendingQuestions: [...muxQuestions.values()],
    pendingDeliveries: [...deliveryRecords],
    lsp: { languages: lsp.availableLangs() },
    work: (() => {
      const w = loadWorkState(WORK_FILE)
      return w === null ? { activity: null, pending: [] } : { activity: w.activity, pending: w.pending }
    })(),
  })

  // 广播统计：每 5s 聚合输出一次「下行推送 X 条 → Y 客户端」，
  // 用于排查「手机收不到桌面消息」的下行链路问题。
  let broadcastCount = 0
  const broadcastStatTimer = setInterval(() => {
    if (broadcastCount > 0) {
      logger.debug('WS', `下行广播统计: ${broadcastCount} 条 → ${clients.size} 个客户端`)
      broadcastCount = 0
    }
  }, 5_000)
  broadcastStatTimer.unref?.()

  // 手机回传的本地日志缓冲（/remote/phone-logs 拉取用；环形保留最近 5000 条）
  const phoneLogBuffer: LogEntryWire[] = []

  const broadcast = (ev: ServerEvent): void => {
    const payload = JSON.stringify(ev)
    broadcastCount++
    for (const ws of clients) {
      if (ws.readyState !== WebSocket.OPEN) continue
      try {
        ws.send(payload)
      } catch (e: unknown) {
        // 单个僵尸 socket 发送失败不得中断广播循环，其余客户端照常收
        logger.warn('WS', `广播发送失败（跳过该客户端）: ${String(e)}`)
      }
    }
  }

  const send = (ws: WebSocket, ev: ServerEvent): void => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(ev))
  }

  // ---- LSP 代码智能：Agent 编辑文件 → Language Server 诊断 → 广播到手机 ----
  // 被动诊断反馈给 Agent 的自动闭环：error 才注入（防抖/去重/轮次上限在 LspFeedback 内）。
  // 运行中 agent.inject（下一步推理立即看到，不 steer 打断）；空闲 agent.followup 唤醒。
  // 逃生门 DSH_REMOTE_LSP_FEEDBACK（默认开启，0/false 关闭）。
  const lspFeedback = new LspFeedback({
    enabled: lspFeedbackEnabledFromEnv(),
    inject: (sessionId, text) => {
      const agent = agentOf(sessionId)
      if (agent === undefined) {
        logger.debug('LSP_FEEDBACK', `诊断注入跳过：会话 ${sessionId.slice(0, 12)} 无 live agent`)
        return
      }
      const message = createUserMessage({
        content: [{ type: 'text', text }],
        source: {
          kind: 'plugin',
          plugin: 'dsh-remote-control-bridge',
          form: 'notice',
          summary: `LSP 编译错误反馈（${sessionId.slice(0, 12)}）`,
        },
      })
      if (agent.status === 'running') {
        // 运行中：注入 next-step（模型下一步推理立即看到，不 steer 打断）
        agent.inject(message)
      } else {
        // 空闲：followup 唤醒
        agent.followup(message)
      }
      logger.info('LSP_FEEDBACK', `诊断注入 session=${sessionId.slice(0, 12)} status=${agent.status}`)
    },
    onCleared: (sessionId) => {
      // 清零：默认静默（倾向静默 + 日志），不再打扰 Agent
      logger.info('LSP_FEEDBACK', `本轮编译错误已全部消除 session=${sessionId.slice(0, 12)}`)
    },
    log: (m) => logger.debug('LSP_FEEDBACK', m),
  })

  const lsp = new LspManager({
    onDiagnostics: (path, sessionId, diagnostics) => {
      // 诊断带 sessionId：手机端只在对应会话内展示，杜绝跨会话串扰
      broadcast({ type: 'diagnostics', sessionId: sessionId ?? '', path, diagnostics })
      // 被动诊断反馈给 Agent（error 才注入；warning/info/hint 不注入）
      lspFeedback.handle(path, sessionId, diagnostics)
    },
    log: (m) => logger.debug('LSP', m),
  })

  // ---- Agent LSP 查询工具（OMP 同款：diagnostics / hover / definition / references）----
  try {
    ctx.tools.register(defineTool({
      name: 'lsp_query',
      description: '查询语言服务器（代码智能）：某文件的诊断、符号类型与文档（hover）、定义位置、引用位置。诊断需要文件曾被 Agent 编辑/写入过（语言服务器才会分析它）。',
      // 声明 10s 协作式超时预算：dsh-tool-call-timeout-policy 据此在超时后中止调用（不再无限挂起）。
      // 内部另有 LspManager.query 的 deadline 双保险（见 src/lsp.ts）。
      timeoutMs: 10_000,
      parameters: {
        action: {
          type: 'string',
          required: true,
          enum: ['diagnostics', 'hover', 'definition', 'references'],
          description: 'diagnostics = 该文件当前诊断（错误/警告）；hover = 指定位置的类型/文档；definition = 定义位置；references = 引用位置（含声明）。',
        },
        path: { type: 'string', required: true, description: '文件绝对路径。' },
        line: { type: 'integer', description: '1-based 行号（hover/definition/references 用；diagnostics 忽略）。' },
        column: { type: 'integer', description: '1-based 列号（hover/definition/references 用；diagnostics 忽略）。' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            text: { type: 'string', description: '查询结果文本（位置为 路径:行:列，1-based）。' },
          },
        },
        render: (_args, value) => {
          const text = (value as { text?: string } | null | undefined)?.text ?? ''
          return [{ type: 'text', text }]
        },
      },
      execute: async (args) => {
        const a = args as { action: 'diagnostics' | 'hover' | 'definition' | 'references'; path: string; line?: number; column?: number }
        return lsp.query(a.action, a.path, a.line, a.column)
      },
    }))
    logger.info('LSP', 'Agent 查询工具 lsp_query 已注册')
  } catch (e: unknown) {
    logger.warn('LSP', `lsp_query 工具注册失败（该能力禁用）: ${String(e)}`)
  }

  // ---- Debug：Agent 经 REST 启动受控调试进程（Node Inspector）→ 状态/输出/变量广播到手机 ----
  const debug = new DebugManager({
    onState: (sessionId, snap) => broadcast({ type: 'debug_state', sessionId, debug: snap }),
    onOutput: (sessionId, line) => broadcast({ type: 'debug_output', sessionId, line }),
    onVariables: (sessionId, variablesReference, variables) =>
      broadcast({ type: 'debug_variables', sessionId, variablesReference, variables }),
  })

  // ---- Agent 调试工具（与手机按钮同命令通道）：debug_start / debug_command ----
  try {
    ctx.tools.register(defineTool({
      name: 'debug_start',
      description: '启动受控调试会话（Node Inspector）：运行指定脚本并挂断点。断点命中的暂停现场（调用栈/作用域）经 WS 推送到手机调试面板；Agent 可用 debug_command 继续/单步/读变量。',
      timeoutMs: 10_000,
      parameters: {
        sessionId: { type: 'string', required: true, description: '归属会话 id（调试状态按会话隔离，推送到该会话的手机面板）。' },
        program: { type: 'string', required: true, description: '要调试的脚本绝对路径（node 可运行：.js/.mjs）。' },
        cwd: { type: 'string', description: '工作目录（缺省用服务进程当前目录）。' },
        breakpoints: {
          type: 'array',
          description: '断点列表。',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              path: { type: 'string', required: true, description: '文件绝对路径。' },
              line: { type: 'integer', required: true, description: '1-based 行号。' },
            },
          },
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: { text: { type: 'string', description: '启动结果摘要。' } },
        },
        render: (_args, value) => {
          const text = (value as { text?: string } | null | undefined)?.text ?? ''
          return [{ type: 'text', text }]
        },
      },
      execute: async (args) => {
        const a = args as { sessionId: string; program: string; cwd?: string; breakpoints?: DebugBreakpointWire[] }
        try {
          const snap = debug.start(a.sessionId, { program: a.program, cwd: a.cwd, breakpoints: a.breakpoints })
          const bps = snap.breakpoints.length > 0 ? snap.breakpoints.map((b) => `${b.path}:${b.line}`).join(', ') : '无'
          return { text: `调试会话已启动：state=${snap.state} program=${snap.program} 断点=${bps}。暂停现场与输出经 WS 推送到手机面板。` }
        } catch (e: unknown) {
          return { text: `启动失败：${String(e)}` }
        }
      },
    }))
    ctx.tools.register(defineTool({
      name: 'debug_command',
      description: '控制调试会话：继续(resume)/单步(step)/跳出(step_out)/停止(stop)/读变量(variables)。断点命中后逐步排查；状态同步推送手机面板。',
      timeoutMs: 10_000,
      parameters: {
        sessionId: { type: 'string', required: true, description: '调试会话归属的会话 id。' },
        action: {
          type: 'string',
          required: true,
          enum: ['resume', 'step', 'step_out', 'stop', 'variables'],
          description: 'resume=继续运行；step=单步；step_out=跳出当前函数；stop=终止调试；variables=按引用读变量（需 variablesReference，来自暂停帧的 scopes[].variablesReference）。',
        },
        variablesReference: { type: 'string', description: 'variables 动作专用：暂停现场的作用域/变量引用。' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: { text: { type: 'string', description: '执行结果/变量列表文本。' } },
        },
        render: (_args, value) => {
          const text = (value as { text?: string } | null | undefined)?.text ?? ''
          return [{ type: 'text', text }]
        },
      },
      execute: async (args) => {
        const a = args as {
          sessionId: string
          action: 'resume' | 'step' | 'step_out' | 'stop' | 'variables'
          variablesReference?: string
        }
        try {
          if (a.action === 'variables') {
            if (a.variablesReference === undefined || a.variablesReference === '') {
              return { text: 'variables 动作需要 variablesReference（来自暂停帧的 scopes[].variablesReference）' }
            }
            // deadline 兜底：调试器断开/进程退出时 CDP 请求可能永不落定，10s 内必返回
            const vars = await withTimeout(
              debug.variablesFor(a.sessionId, a.variablesReference),
              10_000,
              () => undefined,
            )
            if (vars === undefined) return { text: '调试读变量超时（10s）：调试器无响应，可能已停止/断开' }
            return {
              text: vars.length === 0
                ? '（无变量，或引用已随恢复失效）'
                : vars.map((v) => `${v.name} = ${v.value}`).join('\n'),
            }
          }
          if (a.action === 'stop') {
            const stopped = await withTimeout(
              debug.stop(a.sessionId).then(() => true),
              10_000,
              () => false,
            )
            return { text: stopped ? '调试会话已停止' : '调试停止超时（10s）：调试器无响应，可能已断开' }
          }
          debug.command(a.sessionId, a.action)
          return { text: `已发送 ${a.action} 指令；新状态经 WS 推送（手机面板同步显示）` }
        } catch (e: unknown) {
          return { text: `指令失败：${String(e)}` }
        }
      },
    }))
    logger.info('DEBUG', 'Agent 调试工具 debug_start/debug_command 已注册')
  } catch (e: unknown) {
    logger.warn('DEBUG', `调试工具注册失败（该能力禁用）: ${String(e)}`)
  }

  // ---- 历史分页（尾部优先 + 按 seq 翻页）----

  /** 订阅时下发的尾部条数：秒开的关键，历史翻页经 history_page 命令补。 */
  const HISTORY_TAIL = 300

  /** 事件投影（批量）：null 投影（无关事件类型）丢弃。 */
  const projectEvents = (events: readonly SessionEvent[], scope?: unknown): EventProjection[] =>
    events.flatMap((event) => projectEvent(ctx, event, scope))

  /**
   * 冷会话原始事件缓存：翻页复用，避免每页都重读/重解析整份日志。
   * TTL 5 分钟，最多缓存 5 个会话（超出按最旧淘汰）。
   */
  const coldEventCache = new Map<string, { at: number; events: SessionEvent[] }>()
  const coldSessionEvents = async (sessionId: string): Promise<SessionEvent[]> => {
    const hit = coldEventCache.get(sessionId)
    if (hit !== undefined && Date.now() - hit.at < 5 * 60_000) return hit.events
    if (!ctx.sessionPersistence) throw new Error('no sessionPersistence service')
    const { events } = await ctx.sessionPersistence.readFrom(SessionId(sessionId), 0)
    coldEventCache.set(sessionId, { at: Date.now(), events })
    while (coldEventCache.size > 5) {
      const oldestKey = coldEventCache.keys().next().value
      if (oldestKey === undefined) break
      coldEventCache.delete(oldestKey)
    }
    return events
  }

  /** 排队消息投影（与桌面端 session/queue 同源）：nextTurn → queued，nextStep → steering/context。 */
  const queueItemsOf = (agent: Agent): QueueItemWire[] => [
    ...agent.inbox.nextTurn.map((m) => ({
      id: m.id,
      placement: 'queued' as const,
      text: truncateResult(extractText(m.content)),
    })),
    ...agent.inbox.nextStep.map((m) => ({
      id: m.id,
      placement: (m.source.kind === 'user' ? 'steering' : 'context') as 'steering' | 'context',
      text: truncateResult(extractText(m.content)),
    })),
  ]

  /**
   * 排队消息持久化投影：只保留真实用户来源（source.kind === 'user'）的消息，用于 work.json 快照
   * 与重启恢复。子代理收尾通知（subagent-settled）、报告回传（subagent-report）、LSP 反馈等框架
   * 注入消息是瞬态的——它们随 inbox splice 进入队列投影；若一并写入快照，一旦被消费就会在 20s
   * 巡检（restoreQueueIfLost）里被误判为「重启丢失」→ 以用户身份 followup 重注入，导致同一条
   * 子代理收尾消息在会话里被重复送达多次。展示仍用 queueItemsOf（含 context 行），持久化/恢复
   * 只用 userQueueItemsOf。
   */
  const userQueueItemsOf = (agent: Agent): QueueItemWire[] => [
    ...agent.inbox.nextTurn.filter((m) => m.source.kind === 'user').map((m) => ({
      id: m.id,
      placement: 'queued' as const,
      text: truncateResult(extractText(m.content)),
    })),
    ...agent.inbox.nextStep.filter((m) => m.source.kind === 'user').map((m) => ({
      id: m.id,
      placement: 'steering' as const,
      text: truncateResult(extractText(m.content)),
    })),
  ]

  // ---- 排队消息持久化：变化时快照进 work.json，重启后对比恢复（丢了才重新注入，防重复）----
  // 防抖窗口（2000ms）内磁盘快照落后于真实队列：消息刚被消费、快照尚未刷新时，若恢复逻辑
  // 仍按陈旧快照对比，会把「已消费」误判为「重启丢失」→ 重复送达同一条消息。故恢复前必须先
  // flush 挂起的写入，让磁盘状态追上真实队列后再对比。
  const QUEUE_SNAPSHOT_DEBOUNCE_MS = 2000
  const queueSnapTimers = new Map<string, { timer: NodeJS.Timeout; items: QueueItemWire[] }>()
  const writeQueueSnapshot = (sessionId: string, items: QueueItemWire[]): void => {
    try {
      const work = loadWorkState(WORK_FILE)
      const queues = { ...(work?.queues ?? {}) }
      queues[sessionId] = {
        items: items.map((i) => ({ id: i.id, placement: i.placement, text: i.text })),
        at: Date.now(),
      }
      writeWorkState(WORK_FILE, { queues })
    } catch (e: unknown) {
      logger.warn('QUEUE', `队列快照写入失败 session=${sessionId.slice(0, 12)}: ${String(e)}`)
    }
  }
  /** 立即把挂起的（防抖未到期）快照写盘，使磁盘状态追上真实队列；无挂起则不动。 */
  const flushQueueSnapshot = (sessionId: string): void => {
    const pending = queueSnapTimers.get(sessionId)
    if (pending === undefined) return
    clearTimeout(pending.timer)
    queueSnapTimers.delete(sessionId)
    writeQueueSnapshot(sessionId, pending.items)
  }
  const scheduleQueueSnapshot = (sessionId: string, items: QueueItemWire[]): void => {
    const prev = queueSnapTimers.get(sessionId)
    if (prev !== undefined) clearTimeout(prev.timer)
    const timer = setTimeout(() => {
      queueSnapTimers.delete(sessionId)
      writeQueueSnapshot(sessionId, items)
    }, QUEUE_SNAPSHOT_DEBOUNCE_MS)
    timer.unref?.()
    queueSnapTimers.set(sessionId, { timer, items })
  }
  /** 重启后恢复：快照里活队列没有的消息（按 id 或文本去重）重新注入；恢复完清掉快照。 */
  // 与 tryResumeIfPending 同款重入防护：followup 会同步唤醒 idle agent → agent/status running →
  // 再次调用 restoreQueueIfLost。若在清快照前重入，同一条丢失消息会被重复注入。
  const restoringSessions = new Set<string>()
  const restoreQueueIfLost = (sessionId: string): void => {
    if (restoringSessions.has(sessionId)) return
    // 先 flush 防抖窗口内挂起的快照写入，避免按「已消费、尚未刷新」的陈旧快照误判为丢失而重复注入。
    flushQueueSnapshot(sessionId)
    try {
      const work = loadWorkState(WORK_FILE)
      const snap = work?.queues?.[sessionId]
      if (snap === undefined || snap.items.length === 0) return
      const agent = agentOf(sessionId)
      if (agent === undefined) return // 会话未挂载：保留快照，等 agent 上线再试
      const live = userQueueItemsOf(agent)
      const missing: QueueSnapshotItem[] = snap.items.filter(
        (it) => !live.some((l) => l.id === it.id || l.text === it.text),
      )
      if (missing.length === 0) {
        // 队列完好（harness 自己恢复了）——只清快照，不注入
        const queues = { ...(work?.queues ?? {}) }
        delete queues[sessionId]
        writeWorkState(WORK_FILE, { queues })
        logger.info('QUEUE', `会话 ${sessionId.slice(0, 12)} 队列跨重启完好，清理快照`)
        return
      }
      logger.info('QUEUE', `会话 ${sessionId.slice(0, 12)} 恢复丢失的排队消息 ${missing.length} 条`)
      restoringSessions.add(sessionId)
      try {
        for (const it of missing) {
          // 防御：context 行是框架注入（子代理收尾/报告/LSP 反馈等），绝不作为用户消息重注入。
          // 即便存在修复前写入的陈旧快照，也一并兜底阻断重复送达。
          if (it.placement === 'context') continue
          agent.followup(createUserMessage({ content: [{ type: 'text', text: it.text }], source: { kind: 'user' } }))
        }
      } finally {
        restoringSessions.delete(sessionId)
      }
      const queues = { ...(work?.queues ?? {}) }
      delete queues[sessionId]
      writeWorkState(WORK_FILE, { queues })
    } catch (e: unknown) {
      logger.warn('QUEUE', `队列恢复失败 session=${sessionId.slice(0, 12)}: ${String(e)}`)
    }
  }

  // ---- 自动续跑（根治版核心）：指纹幂等 + 持续重试，直到注入成功 ----
  // 旧版一次性定时器在 agent 晚挂载时直接放弃（"暂无 live agent，跳过"就再也不试），
  // 是"重启后经常恢复不了任务"的根因。新版：内容未变不重复注入；每 20s 重试；
  // agent 一上线（agent/status running）立即补注入；优先唤醒 work.sessionId 所属会话。
  const resumeFingerprintOf = (work: NonNullable<ReturnType<typeof loadWorkState>>): string =>
    `${work.activity ?? ''}\n${work.pending.join('\n')}\n${work.sessionId ?? ''}`
  // 重入防护：followup 会同步唤醒 idle agent（idle→running 触发 agent/status），
  // 而 agent/status 处理器会再次调用 tryResumeIfPending——若在指纹写盘前重入，同一批待办会被注入两次。
  // 用进程内布尔锁阻断「同批注入」期间的任何重入；跨 tick 的重复由磁盘指纹（resumeFingerprint）兜住。
  let resumeInjecting = false
  const tryResumeIfPending = (): void => {
    try {
      if (process.env.DSH_REMOTE_RESUME === '0') return
      if (resumeInjecting) return // 同一批待办正在注入（含 followup 同步触发的 agent/status 重入）
      const work = loadWorkState(WORK_FILE)
      if (work === null || work.pending.length === 0) return
      const fp = resumeFingerprintOf(work)
      if (work.resumeFingerprint === fp) return // 这批待办已注入过：等 agent 更新文件后再唤醒，不重复打扰
      const live = ctx.agents.list()
      let agent: Agent | undefined
      if (work.sessionId !== undefined) agent = agentOf(work.sessionId)
      if (agent === undefined) agent = live.find((a) => !isSubagent(a)) ?? live[0]
      if (agent === undefined) {
        logger.debug('WORK', '自动续跑：暂无 live agent，稍后重试')
        return
      }
      const text = [
        '【服务端自动续跑】bridge 重启完成，检测到进行中的事项，请自动继续执行，无需用户再提示：',
        `活动：${work.activity ?? '-'}`,
        '待办清单：',
        ...work.pending.map((p, i) => `${i + 1}. ${p}`),
        '（最新状态见 ~/.dsh/remote-control-work.json，完成后请把该文件清空。）',
      ].join('\n')
      logger.info('WORK', `自动续跑：向 agent ${String(agent.id).slice(0, 8)} 注入续跑指令（待办 ${work.pending.length} 条）`)
      resumeInjecting = true
      try {
        agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
        writeWorkState(WORK_FILE, { resumeFingerprint: fp })
      } finally {
        resumeInjecting = false
      }
    } catch (e: unknown) {
      logger.warn('WORK', `自动续跑尝试失败: ${String(e)}`)
    }
  }
  /** 每轮重试：续跑待办 + 恢复仍丢的排队消息（两者都幂等，可反复执行）。 */
  const resumeTick = (): void => {
    tryResumeIfPending()
    try {
      const work = loadWorkState(WORK_FILE)
      for (const sid of Object.keys(work?.queues ?? {})) restoreQueueIfLost(sid)
    } catch (e: unknown) {
      logger.warn('QUEUE', `队列恢复巡检失败: ${String(e)}`)
    }
  }
  // 立即尝试一次：agent 在 bridge 加载前就已挂载（agent/created 早于本插件注册而错过）时也能即时注入，
  // 不必等 20s 兜底定时器——这是「重启后代理挂载要等好久才续上」的主要延迟来源之一。
  resumeTick()
  // 兜底重试：首轮 resumeDelayMs 后、此后每 20s 一次；事件触发已覆盖绝大多数场景。
  const resumeBootTimer = setTimeout(() => resumeTick(), resumeDelayMs)
  resumeBootTimer.unref?.()
  const resumeInterval = setInterval(() => resumeTick(), 20_000)
  resumeInterval.unref?.()

  // ---- Deep Diving：模型请求起止 → 手机指示条 ----
  // modelStreams：会话 → 进行中的模型请求开始时间。订阅时下发，
  // 让"切进正在思考的会话"也能立刻看到指示条（状态随会话，不串扰）。
  const modelStreams = new Map<string, number>()
  // turnStarts：会话 → 本轮开始时间（turn/start 事件）。Deep Diving 显示"本轮累计耗时"，
  // 跨多次模型调用不重置——与旧版客户端语义一致，但时钟在服务端。
  const turnStarts = new Map<string, number>()
  // ---- 结果交付通知（服务端权威 turnKey + 台账持久化 + 重连补发）----
  // deliveryRecords：未确认投递的通知台账（启动加载，消费确认后删除，每次变更即落盘）。
  let deliveryRecords: DeliveryRecord[] = loadDeliveries(DELIVERIES_FILE)
  // turnOutput：会话 → 本轮是否有「最终结论(assistant) / 非空工具产出(tool)」，降噪用（turn/start 重置）。
  const turnOutput = new Map<string, { assistant: number; tool: number }>()
  /** 与 @deepseek-ai/dsh-commands 的 parseCommand 同构：仅"行首斜杠 + 合法命令名"才走命令通道。 */
  const SLASH_COMMAND_RE = /^\/([a-z][a-z0-9_-]*)(?=$|[\t\n\r ])/u
  /** ctx.get('commands') 的软读形状（DSH commands 服务：与 Web composer 同一条执行链）。 */
  interface CommandsServiceLike {
    execute(agent: Agent, line: string, images: unknown[], signal: AbortSignal): Promise<
      | { commandId: string; result: { kind: 'success' | 'error'; text?: string; sourceEventSeq?: number } }
      | undefined
    >
    list?: (agent: Agent) => readonly {
      name: string
      description: string
      input?: { hint: string; images?: boolean }
    }[]
  }
  /** 该会话可用的斜杠命令清单（服务端注册表权威；与 Web composer 同源）。 */
  const commandWireList = (agent: Agent | undefined): CommandWire[] => {
    const commands = ctx.get('commands') as CommandsServiceLike | undefined
    if (agent === undefined || commands?.list === undefined) return []
    try {
      return commands.list(agent).map((c) => ({
        name: c.name,
        description: c.description,
        ...(c.input !== undefined ? { input: { hint: c.input.hint, ...(c.input.images === true ? { images: true } : {}) } } : {}),
      }))
    } catch (e: unknown) {
      logger.warn('CMD', `命令清单读取失败（降级为空）: ${String(e)}`)
      return []
    }
  }
  ctx.on('llm/stream', (options, next) => {
    const sessionId = options.sessionId
    if (sessionId === undefined) return next()
    const startedAt = Date.now()
    const sid = String(sessionId)
    modelStreams.set(sid, startedAt)
    broadcast({ type: 'model_waiting', sessionId: sid, startedAt })
    const stream = next()
    return (async function* () {
      try {
        for await (const chunk of stream) yield chunk
      } finally {
        if (modelStreams.get(sid) === startedAt) modelStreams.delete(sid)
        broadcast({ type: 'model_waiting_done', sessionId: sid, startedAt, elapsedMs: Date.now() - startedAt })
      }
    })()
  }, { global: true, prepend: true })

  // Deep Diving 计时：服务端时钟按秒广播 elapsedSeconds（客户端不本地计时，一切以服务端为准）。
  // 与 DSH Web 对齐：锚点 = 当前 OPEN 轮次的开始时间，整个轮次期间持续广播（不止等模型时）；
  // 客户端只在 elapsed ≥ 15s 时显示时钟（DSH Web 的 showClock 阈值）。
  const divingTicker = setInterval(() => {
    for (const [sid, base] of turnStarts) {
      broadcast({
        type: 'deep_diving_tick',
        sessionId: sid,
        elapsedSeconds: Math.max(0, Math.floor((Date.now() - base) / 1000)),
        since: base,
      })
    }
  }, 1000)
  divingTicker.unref?.()

  /**
   * 结果交付：轮次结束（turn/end）时生成服务端权威 turnKey + 降噪判定 + 台账落盘 + 实时广播。
   * 降噪与 App 旧 hasDeliverySubstance 同语义：主会话认 assistant 最终结论，子代理认非空 tool_result 或 assistant。
   */
  const maybeDeliverOnTurnEnd = (session: Session): void => {
    try {
      const sid = String(session.id)
      const to = turnOutput.get(sid)
      turnOutput.delete(sid) // 轮次结束即清理，下一轮 turn/start 重建
      if (to === undefined) return
      const sub = (session.header.delegationDepth ?? 0) > 0 || session.header.origin === 'subagent'
      const substantive = sub ? to.assistant > 0 || to.tool > 0 : to.assistant > 0
      if (!substantive) {
        logger.debug('NOTIFY', `结果交付跳过（无实质产出）session=${sid.slice(0, 8)} subagent=${sub}`)
        return
      }
      const notice: DeliveryNoticeWire = {
        sessionId: sid,
        turnKey: randomUUID(),
        title: '结果已就绪',
        body: deliveryCompleteBody(displayTitleOf(session), sub),
        isSubagent: sub,
        completedAt: Date.now(),
      }
      deliveryRecords = [...deliveryRecords, notice]
      writeDeliveries(DELIVERIES_FILE, deliveryRecords)
      broadcast({ type: 'delivery_notice', notice })
      logger.info('NOTIFY', `结果交付通知 session=${sid.slice(0, 8)} turnKey=${notice.turnKey.slice(0, 8)} subagent=${sub} 台账=${deliveryRecords.length}`)
    } catch (e: unknown) {
      logger.warn('NOTIFY', `结果交付判定失败 session=${String(session.id).slice(0, 12)}: ${String(e)}`)
    }
  }

  /** 结果交付降噪：把单条投影记入本轮产出（assistant 最终结论 / 非空 tool_result）。 */
  const trackTurnOutput = (to: { assistant: number; tool: number }, proj: EventProjection): void => {
    if (proj.type === 'assistant_message') to.assistant = Date.now()
    else if (proj.type === 'tool_result' && typeof proj.toolResult === 'string' && proj.toolResult !== '') {
      to.tool = Date.now()
    }
  }

  // ---- live event fan-out ----
  ctx.on('session/event', (session, event) => {
    if (event.type === 'session/title') {
      // 子代理会话：标题用 description（而非 DSH 自动生成的首个 Prompt），避免手机端被覆盖
      const label = session.header.parentSession !== undefined ? subagentLabelOfLive(session) : undefined
      broadcast({
        type: 'session_title',
        sessionId: String(session.id),
        title: label ?? event.data.title,
      })
      return
    }
    // 思考流式：reasoning-delta 增量累积 → 节流广播 think_delta（手机端一行持续刷新，
    // 与 DeepSeek Web 的 thinking 体验对齐；最终行仍由 assistant/message 投影发出）
    if (event.type === 'assistant/chunk') {
      const chunk = (event.data as { chunk?: { type?: string } }).chunk
      if (chunk?.type === 'reasoning-delta') {
        const delta = (chunk as { text?: string }).text ?? ''
        if (delta) {
          const sid = String(session.id)
          let st = thinkStreams.get(sid)
          if (st === undefined) {
            st = { text: '' }
            thinkStreams.set(sid, st)
          }
          st.text += delta
          if (st.timer === undefined) {
            st.timer = setTimeout(() => {
              st.timer = undefined
              broadcast({ type: 'think_delta', sessionId: sid, text: st.text.slice(-240) })
            }, 100) // 思考流节流 100ms（用户要求，更跟手）
            st.timer.unref?.()
          }
        }
      }
      return
    }
    // 思考流结束/轮次边界：冲刷并清除实时思考行（终态由投影事件呈现）
    if (event.type === 'assistant/message' || event.type === 'turn/end' || event.type === 'turn/start' || event.type === 'user/message') {
      const st = thinkStreams.get(String(session.id))
      if (st !== undefined) {
        if (st.timer !== undefined) clearTimeout(st.timer)
        thinkStreams.delete(String(session.id))
        broadcast({ type: 'think_delta', sessionId: String(session.id), text: '' })
      }
    }
    // 排队队列变化（inbox splice）→ 推给手机
    if (event.type === 'agent/inbox/spliced') {
      // inbox.mutate 先 session.append 落库、后改内存投影，且 session/event 观察者
      // 是同步触发的：此刻读 agent.inbox 拿到的是"变更前"队列（滞后一拍）。
      // 必须延迟到本 tick 结束（投影已更新）再广播，否则手机端队列状态永远错位：
      // 入队广播不含新消息（乐观项被冲掉）、claim 广播仍含旧消息（永远显示排队）。
      queueMicrotask(() => {
        try {
          const agent = ctx.agents.get(session.id)
          const identity = agent?.session === session
          logger.debug('QUEUE', `inbox/spliced(deferred) session=${String(session.id).slice(0, 12)} agent=${agent === undefined ? 'no' : 'yes'} identity=${identity}`)
          if (identity && agent !== undefined) {
            const items = queueItemsOf(agent)
            logger.debug('QUEUE', `session_queue 广播 session=${String(session.id).slice(0, 12)} items=${items.length}`)
            broadcast({ type: 'session_queue', sessionId: String(session.id), items })
            // 持久化快照只收用户来源消息（子代理收尾/报告等框架注入不入快照，见 userQueueItemsOf）
            scheduleQueueSnapshot(String(session.id), userQueueItemsOf(agent))
          }
        } catch (e: unknown) {
          // 队列投影失败绝不能吞掉后续事件处理
          logger.warn('QUEUE', `inbox/spliced 延迟广播失败: ${String(e)}`)
        }
      })
      return
    }
    // 目标变更（goal/change 落库）：延迟到本 tick 末重读该会话目标并广播（GoalService 视图
    // 在事件提交后更新；与队列同款延迟，保证手机端拿到的是落库后的状态）。会话级，不串扰。
    if ((event.type as string) === 'goal/change') {
      queueMicrotask(() => {
        try {
          broadcast({ type: 'goal_update', sessionId: String(session.id), goal: goalWireOf(String(session.id)) })
        } catch (e: unknown) {
          logger.warn('GOAL', `goal/change 延迟广播失败 session=${String(session.id).slice(0, 12)}: ${String(e)}`)
        }
      })
      return
    }
    // 任务列表变更（todo/write 落库）：同样延迟重读 todos 投影广播（会话级隔离）
    if ((event.type as string) === 'todo/write') {
      queueMicrotask(() => {
        try {
          broadcast({ type: 'todos_update', sessionId: String(session.id), todos: todosWireOf(String(session.id)) })
        } catch (e: unknown) {
          logger.warn('TODO', `todo/write 延迟广播失败 session=${String(session.id).slice(0, 12)}: ${String(e)}`)
        }
      })
      return
    }
    // 任务列表按轮次生命周期：turn/start 时 DSH 会把 todos 投影清空，但手机端无从得知——
    // 主动广播空 todos_update，否则下轮开始手机还显示上一轮的旧任务清单。
    if ((event.type as string) === 'turn/start') {
      const t0 = Date.now()
      try {
        turnStarts.set(String(session.id), t0)
        // 新一轮：重置结果交付降噪标记（本轮是否已有最终结论/非空工具产出）
        turnOutput.set(String(session.id), { assistant: 0, tool: 0 })
        // 新一轮：重置 LSP 诊断反馈的轮次注入上限与批次指纹（新一轮重新计数）
        lspFeedback.markTurnStart(String(session.id))
        broadcast({ type: 'todos_update', sessionId: String(session.id), todos: [] })
        // 与 DSH Web 对齐：轮次一开就广播 turn_status（整个轮次期间显示 Deep diving 标签）
        broadcast({ type: 'turn_status', sessionId: String(session.id), open: true, since: t0 })
        broadcast({ type: 'deep_diving_tick', sessionId: String(session.id), elapsedSeconds: 0, since: t0 })
      } catch (e: unknown) {
        logger.warn('TODO', `turn/start 广播失败 session=${String(session.id).slice(0, 12)}: ${String(e)}`)
      }
      // 不 return：turn/start 本身仍需走下面的投影流程
    }
    if ((event.type as string) === 'turn/end') {
      turnStarts.delete(String(session.id))
      broadcast({ type: 'turn_status', sessionId: String(session.id), open: false })
      // 结果交付：轮次结束即判定（本轮产出已在投影流程中记入 turnOutput）
      maybeDeliverOnTurnEnd(session)
    }
    const scope = ctx.agents.get(session.id)
    // 结果交付降噪：实时投影时记录本轮是否有最终结论(assistant_message)/非空工具产出(tool_result)
    const to = turnOutput.get(String(session.id))
    for (const proj of projectEvent(ctx, event, scope)) {
      broadcast({ type: 'event', sessionId: String(session.id), event: proj })
      if (to !== undefined) trackTurnOutput(to, proj)
    }
    // LSP：实时事件里 Agent 编辑/写入文件 → 触发语言诊断（历史投影不触发，避免重放风暴）
    if (event.type === 'tool/call') {
      for (const p of toolFilePaths(event.data)) lsp.notifyFileChanged(p, String(session.id))
    }
  })

  // agent 挂载完成（含重启后恢复的持久化会话）：不必等它跑起来（agent/status running），
  // 也不用等 20s 兜底定时器——这是「重启后代理挂载要等好久才续上」的另一个延迟来源。
  ctx.on('agent/created', ({ agent }) => {
    broadcast({ type: 'agent_status', sessionId: String(agent.id), status: agent.status })
    tryResumeIfPending()
    restoreQueueIfLost(String(agent.id))
  })

  ctx.on('agent/status', ({ agent, status }) => {
    broadcast({ type: 'agent_status', sessionId: String(agent.id), status })
    // agent 重新挂载并开跑：立即补注入续跑指令 + 恢复丢失的排队消息（根治晚挂载场景）
    if (status === 'running') {
      tryResumeIfPending()
      restoreQueueIfLost(String(agent.id))
    }
  })

  // 会话列表增量：新建/下线时推该行（hello 全量对账兜底）。
  // 下线不删行（桌面端同样在刷新后回显持久化会话），只把状态置 idle。
  ctx.on('session/created', (session) => {
    broadcast({ type: 'session_upsert', session: sessionRowFromLive(session) })
  })
  ctx.on('session/disposed', (session) => {
    try {
      const row = sessionRowFromLive(session)
      broadcast({ type: 'session_upsert', session: { ...row, status: 'idle', agentCount: 0 } })
    } catch (e: unknown) {
      logger.warn('SESSION', `disposed 行投影失败: ${String(e)}`)
    }
  })

  // 斜杠命令注册表变更（DSH commands 服务 commands/change，如插件热重载）：
  // 重读各活跃会话的命令清单推给手机，保持候选弹窗与 Web composer 同源同新。
  ctx.events.on('commands/change', () => {
    try {
      for (const agent of ctx.agents.list()) {
        broadcast({
          type: 'commands_update',
          sessionId: String(agent.id),
          commands: commandWireList(agent),
        })
      }
    } catch (e: unknown) {
      logger.warn('CMD', `commands/change 重读命令清单失败: ${String(e)}`)
    }
  })

  // ---- approval answerer (mobile decides; desktop falls back) ----

  /**
   * 挂起审批表：approvalId -> 裁决闭包。审批到达时若存在已连接手机，本 bridge
   * 以 prepend 监听抢先认领（先于桌面端 apiproxy answerer）；手机裁决后回传。
   * 无人裁决的超时兜底时长（毫秒），可用 DSH_REMOTE_APPROVAL_TIMEOUT_MS 覆盖。
   */
  const approvalHoldTimeoutMs = Number(process.env.DSH_REMOTE_APPROVAL_TIMEOUT_MS ?? 30 * 60_000)
  const pendingApprovals = new Map<
    string,
    ApprovalRequestWire & { resolve: (outcome: 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable') => void; timer: NodeJS.Timeout }
  >()

  const pendingApprovalList = (): ApprovalRequestWire[] =>
    [...pendingApprovals.values()].map(({ resolve: _r, timer: _t, ...wire }) => wire)

  /** 与桌面端相同的审计关联：从会话日志找到最新一条未裁决且 callId 匹配的 approval/asked。 */
  const approvalIdOf = (req: { callId?: string; agent: Agent }): string | undefined => {
    const events = req.agent.session.events
    const claimed = new Set(pendingApprovals.keys())
    const decided = new Set<string>()
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const event = events[i]
      if (event.type === 'approval/decided') decided.add(String(event.data.id))
      else if (event.type === 'approval/asked') {
        const id = String(event.data.id)
        if (decided.has(id) || claimed.has(id)) continue
        if ((req.callId ?? null) !== (event.data.callId ?? null)) continue
        return id
      }
    }
    return undefined
  }

  /** 关联工具调用时提取可读命令文本（bash 等工具的命令字段）。 */
  const commandOfCall = (session: Session, callId: string): string | undefined => {
    for (let i = session.events.length - 1; i >= 0; i -= 1) {
      const event = session.events[i]
      if (event.type !== 'tool/call') continue
      if (String(event.data.callId ?? '') !== callId) continue
      try {
        const args = typeof event.data.arguments === 'string'
          ? JSON.parse(event.data.arguments)
          : (event.data.arguments ?? {})
        if (typeof args.command === 'string' && args.command !== '') return args.command
        return undefined
      } catch {
        return undefined
      }
    }
    return undefined
  }

  ctx.on('approval/request', async (req, next) => {
    if (req.signal?.aborted === true) {
      logger.info('APPROVAL', `请求已中止，直接 cancelled (tool=${req.toolName})`)
      return 'cancelled'
    }
    // 没有已连接手机：不认领，直接放行给桌面端 answerer。
    if (clients.size === 0) {
      logger.info('APPROVAL', `无手机在线，放行给桌面端 (tool=${req.toolName})`)
      return next()
    }

    const approvalId = approvalIdOf(req)
    if (approvalId === undefined) {
      logger.warn('APPROVAL', `日志关联 approvalId 失败，放行给桌面端 (tool=${req.toolName})`)
      return next()
    }

    const approval: ApprovalRequestWire = {
      approvalId,
      sessionId: String(req.agent.id),
      toolName: req.toolName,
      ...(req.callId !== undefined ? { callId: req.callId } : {}),
      ...(req.reason !== undefined ? { reason: req.reason } : {}),
      ...(() => { const c = req.callId !== undefined ? commandOfCall(req.agent.session, req.callId) : undefined; return c !== undefined ? { command: c } : {} })(),
      requestedAt: Date.now(),
    }

    logger.info('APPROVAL', `认领审批 approval=${approvalId.slice(0, 8)} tool=${req.toolName} session=${approval.sessionId.slice(0, 12)}，广播给 ${clients.size} 个客户端`)

    return await new Promise<'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'>((resolve) => {
      let settled = false
      const entry = pendingApprovals.get(approvalId)
      const settle = (outcome: 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable') => {
        if (settled) return
        settled = true
        clearTimeout(entry?.timer)
        pendingApprovals.delete(approvalId)
        req.signal?.removeEventListener('abort', onAbort)
        logger.info('APPROVAL', `审批裁决 approval=${approvalId.slice(0, 8)} outcome=${outcome}`)
        broadcast({ type: 'approval_resolved', approvalId, sessionId: approval.sessionId, outcome })
        resolve(outcome)
      }
      const onAbort = () => settle('cancelled')
      const timer = setTimeout(() => {
        logger.warn('APPROVAL', `审批超时兜底 approval=${approvalId.slice(0, 8)}（${approvalHoldTimeoutMs}ms 无裁决）→ unavailable`)
        settle('unavailable')
      }, approvalHoldTimeoutMs)
      pendingApprovals.set(approvalId, { ...approval, resolve: settle, timer })
      req.signal?.addEventListener('abort', onAbort, { once: true })
      broadcast({ type: 'approval_request', approval })
    })
  }, { prepend: true })

  // ---- mux 客户端：转发桌面端（apiproxy）持有的审批与提问到手机 ----

  /** 桌面端持有、经 mux 转发的审批（approvalId -> wire，rpcId 附着）。 */
  const muxRemoteApprovals = new Map<string, ApprovalRequestWire>()
  /** 桌面端持有、经 mux 转发的提问（rpcId -> wire）。 */
  const muxQuestions = new Map<string, QuestionRequestWire>()
  let muxStopped = false
  let muxWs: WebSocket | null = null

  /** 经 /api/respond 回传手机裁决给桌面端 answerer（返回是否被接受）。 */
  const respondToDesktop = async (rpcId: string, value: unknown): Promise<boolean> => {
    try {
      const res = await fetch(`http://127.0.0.1:${ctx.webServer.port}/api/respond`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // client-response 完整形态要求 type 判别字段
        body: JSON.stringify({ type: 'client-response', rpcId, result: { ok: true, value } }),
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) {
        logger.warn('RESPOND', `POST /api/respond HTTP ${res.status} (rpc=${rpcId.slice(0, 8)})`)
        return false
      }
      const receipt = (await res.json()) as { accepted?: boolean; reason?: string }
      if (receipt.accepted !== true) {
        logger.warn('RESPOND', `/api/respond 拒绝: ${receipt.reason ?? 'unknown'} (rpc=${rpcId.slice(0, 8)})`)
      } else {
        logger.info('RESPOND', `/api/respond 已接受 (rpc=${rpcId.slice(0, 8)})`)
      }
      return receipt.accepted === true
    } catch (e) {
      logger.error('RESPOND', `POST /api/respond 异常: ${e instanceof Error ? e.message : String(e)}`)
      return false
    }
  }

  const handleMuxFrame = (envelope: { rpcId?: string; payload?: { type?: string } & Record<string, unknown> }): void => {
    const payload = envelope.payload
    if (!payload?.type) return
    const rpcId = envelope.rpcId ?? ''
    switch (payload.type) {
      case 'approval/requested': {
        const f = payload as { sessionId: string; approvalId: string; toolName: string; callId?: string; reason?: string }
        if (pendingApprovals.has(f.approvalId)) return // 本 bridge 已持有（防御性去重）
        const session = ctx.sessions.list().find((s) => String(s.id) === f.sessionId)
        const command = f.callId !== undefined && session ? commandOfCall(session, f.callId) : undefined
        const wire: ApprovalRequestWire = {
          approvalId: f.approvalId,
          sessionId: f.sessionId,
          toolName: f.toolName,
          ...(f.callId !== undefined ? { callId: f.callId } : {}),
          ...(f.reason !== undefined ? { reason: f.reason } : {}),
          ...(command !== undefined ? { command } : {}),
          requestedAt: Date.now(),
          rpcId,
        }
        muxRemoteApprovals.set(f.approvalId, wire)
        logger.info('MUX', `转发桌面审批 approval=${f.approvalId.slice(0, 8)} tool=${f.toolName} → 手机`)
        broadcast({ type: 'approval_request', approval: wire })
        break
      }
      case 'approval/resolved': {
        const f = payload as { approvalId: string; sessionId: string; outcome: string }
        muxRemoteApprovals.delete(f.approvalId)
        broadcast({
          type: 'approval_resolved',
          approvalId: f.approvalId,
          sessionId: f.sessionId,
          outcome: (f.outcome as 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable') ?? 'unavailable',
        })
        break
      }
      case 'question/requested': {
        const f = payload as { sessionId: string; questions: QuestionRequestWire['questions'] }
        const wire: QuestionRequestWire = {
          rpcId,
          sessionId: f.sessionId,
          questions: f.questions,
          requestedAt: Date.now(),
        }
        muxQuestions.set(rpcId, wire)
        logger.info('MUX', `转发桌面提问 rpc=${rpcId.slice(0, 8)} questions=${f.questions.length} → 手机`)
        broadcast({ type: 'question_request', question: wire })
        break
      }
      case 'question/resolved': {
        const f = payload as { sessionId: string; questionRpcId: string; outcome: string }
        muxQuestions.delete(f.questionRpcId)
        broadcast({
          type: 'question_resolved',
          rpcId: f.questionRpcId,
          sessionId: f.sessionId,
          outcome: (f.outcome as 'answered' | 'cancelled') ?? 'cancelled',
        })
        break
      }
      default:
        break
    }
    // 缓存过期清扫（30 分钟未解决视为失效）
    const now = Date.now()
    for (const [id, wire] of muxRemoteApprovals) if (now - wire.requestedAt > 30 * 60_000) muxRemoteApprovals.delete(id)
    for (const [id, wire] of muxQuestions) if (now - wire.requestedAt > 30 * 60_000) muxQuestions.delete(id)
  }

  /** 维护与 /api/events.mux 的 WebSocket 长连接（只读下链，断开自动重连）。 */
  const runMuxClient = async (): Promise<void> => {
    let failures = 0
    // 帧类型计数（节流日志用）
    const frameCounts = new Map<string, number>()
    let lastFlush = 0
    while (!muxStopped) {
      await new Promise<void>((resolve) => {
        const ws = new WebSocket(`ws://127.0.0.1:${ctx.webServer.port}/api/events.mux`)
        muxWs = ws
        let settled = false
        const settle = () => {
          if (settled) return
          settled = true
          resolve()
        }
        ws.on('open', () => {
          failures = 0
          logger.info('MUX', `已连接桌面端 mux 下链 (${ctx.webServer.port}/api/events.mux)`)
        })
        ws.on('message', (data) => {
          try {
            const parsed = JSON.parse(data.toString()) as { rpcId?: string; payload?: { type?: string } & Record<string, unknown> }
            const type = parsed.payload?.type ?? 'unknown'
            frameCounts.set(type, (frameCounts.get(type) ?? 0) + 1)
            const now = Date.now()
            if (now - lastFlush > 5000) {
              const summary = [...frameCounts.entries()].map(([t, n]) => `${t}=${n}`).join(' ')
              logger.debug('MUX', `帧统计: ${summary}`)
              frameCounts.clear()
              lastFlush = now
            }
            handleMuxFrame(parsed)
          } catch {
            // 单帧损坏不致命，跳过
            logger.debug('MUX', '忽略无法解析的 mux 帧')
          }
        })
        ws.on('close', settle)
        ws.on('error', (e) => {
          failures += 1
          logger.warn('MUX', `mux 连接断开: ${e.message}（第 ${failures} 次，${Math.min(1000 * 2 ** Math.min(failures, 5), 30_000)}ms 后重连）`)
          settle()
        })
      })
      if (muxStopped) return
      // 指数退避重连（1s 起，封顶 30s）；重连后桌面端会重放未决帧
      await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** Math.min(failures, 5), 30_000)))
    }
  }

  // ---- connection auth ----

  type AuthKind = 'env' | 'pair' | 'device' | 'open' | 'none'
  interface WsAuth {
    kind: AuthKind
    deviceId?: string
  }

  const authenticate = (req: IncomingMessage): WsAuth => {
    const url = new URL(req.url ?? '', 'http://localhost')
    const candidates = [
      url.searchParams.get('pair'),
      url.searchParams.get('token'),
      bearerToken(req.headers.authorization),
    ].filter((x): x is string => x !== null)

    if (envToken) {
      if (candidates.includes(envToken)) return { kind: 'env' }
    } else if (candidates.length === 0) {
      // 无 token 的 open 路径必须同时满足「来源 IP 回环 + Host 头回环」，与 REST 的
      // allowLocalOrEnvToken 同语义。否则 Tailscale serve / SSH -L 把远程流量转发到
      // 127.0.0.1 时（remoteAddress 已变成回环），仍会被匿名放行——这是 S1 鉴权缺口。
      return isLoopback(req) && isLoopbackHostHeader(req) ? { kind: 'open' } : { kind: 'none' }
    }

    for (const c of candidates) {
      const exp = pairTokens.get(c)
      if (exp !== undefined && exp >= Date.now()) return { kind: 'pair' }
      const dev = deviceByToken(c)
      if (dev) {
        dev.lastSeenAt = Date.now()
        saveDevices(devices)
        return { kind: 'device', deviceId: dev.deviceId }
      }
    }
    return { kind: 'none' }
  }

  // ---- client command handling ----

  const wsAuth = new WeakMap<WebSocket, WsAuth>()
/** 每个连接的存活标记（心跳判活用）。 */
const wsAlive = new WeakMap<WebSocket, { alive: boolean }>()
const wsState = (ws: WebSocket): { alive: boolean } => {
  let s = wsAlive.get(ws)
  if (!s) {
    s = { alive: true }
    wsAlive.set(ws, s)
  }
  return s
}

  // eslint-disable-next-line max-lines-per-function, complexity -- P0 存量豁免（命令分派超大函数，TODO 拆分），见 docs/lint-rules.md
  const handleCommand = async (ws: WebSocket, raw: Buffer): Promise<void> => {
    let cmd: ClientCommand
    try {
      cmd = JSON.parse(raw.toString()) as ClientCommand
    } catch {
      logger.warn('CMD', '收到无法解析的 JSON 命令')
      send(ws, { type: 'error', code: 'bad_json', message: 'invalid JSON' })
      return
    }
    const extra = [
      'sessionId' in cmd && typeof (cmd as { sessionId?: unknown }).sessionId === 'string'
        ? `session=${(cmd as { sessionId: string }).sessionId.slice(0, 12)}`
        : '',
      'approvalId' in cmd && typeof (cmd as { approvalId?: unknown }).approvalId === 'string'
        ? `approval=${(cmd as { approvalId: string }).approvalId.slice(0, 8)}`
        : '',
      'rpcId' in cmd && typeof (cmd as { rpcId?: unknown }).rpcId === 'string'
        ? `rpc=${(cmd as { rpcId: string }).rpcId.slice(0, 8)}`
        : '',
      cmd.type === 'send_message' && typeof (cmd as { text?: unknown }).text === 'string'
        ? `text=${(cmd as { text: string }).text.slice(0, 40)}`
        : '',
    ].filter(Boolean).join(' ')
    logger.debug('CMD', `收到命令 type=${cmd.type} ${extra}`)

    switch (cmd.type) {
      case 'list': {
        void snapshot().then((snap) => send(ws, snap))
        break
      }
      case 'ping': {
        // 应用层心跳：客户端发 ping 探活，服务端立即回 pong；客户端超时未回 pong = 假连接判死。
        send(ws, { type: 'pong' })
        break
      }
      case 'confirm_delivery': {
        // 结果交付确认：手机按 (sessionId, turnKey) 幂等消费后回传，桥删除台账记录（标记已投递）。
        const keys = new Set((cmd.deliveries ?? []).map((d) => `${d.sessionId}\u0000${d.turnKey}`))
        const before = deliveryRecords.length
        if (keys.size > 0) {
          deliveryRecords = deliveryRecords.filter((r) => !keys.has(`${r.sessionId}\u0000${r.turnKey}`))
          if (deliveryRecords.length !== before) {
            writeDeliveries(DELIVERIES_FILE, deliveryRecords)
          }
        }
        logger.info('NOTIFY', `确认投递 ${before - deliveryRecords.length} 条（剩余 ${deliveryRecords.length}）`)
        break
      }
      case 'upload_logs': {
        const entries = cmd.entries ?? []
        for (const e of entries) {
          phoneLogBuffer.push({ ts: e.ts ?? Date.now(), level: e.level ?? 'I', tag: e.tag ?? '', message: e.message ?? '' })
        }
        while (phoneLogBuffer.length > 5000) phoneLogBuffer.shift()
        logger.info('PHONE', `收到手机回传日志 ${entries.length} 条 (request=${(cmd as { requestId?: string }).requestId?.slice(0, 8) ?? '-'})`)
        break
      }
      case 'queue_action': {
        const agent = ctx.agents.get(SessionId(cmd.sessionId))
        if (agent === undefined || String(agent.id) !== cmd.sessionId) {
          send(ws, { type: 'error', code: 'not_found', message: 'agent not attached' })
          break
        }
        const target = agent.inbox.nextTurn.some((m) => m.id === cmd.itemId)
          ? 'next-turn'
          : agent.inbox.nextStep.some((m) => m.id === cmd.itemId)
            ? 'next-step'
            : undefined
        if (target === undefined) {
          logger.warn('QUEUE', `排队操作失败 queue-item-not-found item=${cmd.itemId.slice(0, 8)} action=${cmd.action} session=${cmd.sessionId.slice(0, 12)}`)
          send(ws, { type: 'error', code: 'queue-item-not-found', message: '排队消息已不在队列中' })
          break
        }
        const message = (target === 'next-turn' ? agent.inbox.nextTurn : agent.inbox.nextStep)
          .find((m) => m.id === cmd.itemId)
        if (message === undefined) {
          logger.warn('QUEUE', `排队操作失败 queue-item-not-found item=${cmd.itemId.slice(0, 8)} action=${cmd.action} session=${cmd.sessionId.slice(0, 12)}`)
          send(ws, { type: 'error', code: 'queue-item-not-found', message: '排队消息已不在队列中' })
          break
        }
        if (cmd.action === 'steer') {
          if (target !== 'next-turn' || agent.status !== 'running') {
            logger.warn('QUEUE', `排队操作失败 steer-unavailable item=${cmd.itemId.slice(0, 8)} target=${target} status=${agent.status} session=${cmd.sessionId.slice(0, 12)}`)
            send(ws, { type: 'error', code: 'steer-unavailable', message: '当前轮次不接受插队，消息仍在排队' })
            break
          }
          agent.inbox.remove(MessageId(cmd.itemId))
          agent.steer(message)
        } else {
          agent.inbox.remove(MessageId(cmd.itemId))
        }
        logger.info('QUEUE', `排队操作 ${cmd.action} item=${cmd.itemId.slice(0, 8)} session=${cmd.sessionId.slice(0, 12)}`)
        break
      }
      case 'debug_command': {
        logger.info('DEBUG', `调试指令 ${cmd.action}${cmd.variablesReference !== undefined ? ` ref=${cmd.variablesReference.slice(0, 8)}` : ''} session=${cmd.sessionId.slice(0, 12)}`)
        try {
          if (cmd.action === 'variables') {
            if (cmd.variablesReference === undefined || cmd.variablesReference === '') {
              send(ws, { type: 'error', code: 'bad_request', message: 'variables 需要 variablesReference' })
            } else {
              debug.variables(cmd.sessionId, cmd.variablesReference)
            }
            break
          }
          if (cmd.action === 'stop') {
            void debug.stop(cmd.sessionId)
            break
          }
          debug.command(cmd.sessionId, cmd.action)
        } catch (e: unknown) {
          send(ws, { type: 'error', code: 'debug_unavailable', message: String(e) })
        }
        break
      }
      case 'subscribe': {
        if (!cmd.sessionId) {
          send(ws, { type: 'error', code: 'not_found', message: 'subscribe 需要 sessionId' })
          break
        }
        const liveSession = ctx.sessions.list().find((x) => String(x.id) === cmd.sessionId)
        if (liveSession) {
          const all = liveSession.events
          const scope = ctx.agents.get(liveSession.id)
          const { events, hasMore } = projectWindowBack(ctx, all, undefined, HISTORY_TAIL, scope)
          send(ws, {
            type: 'history',
            sessionId: String(liveSession.id),
            events,
            hasMore,
            total: all.length,
            // 该会话正在等模型 → 切进来立刻显示 Deep Diving（会话级状态，不串扰）
            modelWaitingSince: modelStreams.get(String(liveSession.id)) ?? null,
            ...(scope?.session === liveSession ? { queue: queueItemsOf(scope) } : {}),
            // 该会话当前目标（会话级状态；无目标为 null）
            goal: goalWireOf(String(liveSession.id)),
            // 该会话当前轮次任务列表（todos 投影；turn/start 后为空）
            todos: todosWireOf(String(liveSession.id)),
            // 当前 OPEN 轮次起点：中途切入会话也能立即显示 Deep diving 标签（不依赖错过的事件）
            turnSince: turnStarts.get(String(liveSession.id)) ?? null,
            // 该会话可用的斜杠命令清单（DSH commands 注册表权威；客户端 "/" 候选弹窗）
            commands: commandWireList(scope),
          })
          break
        }
        // 冷会话：从持久化层读历史（只读，不拉起 agent）；原始事件缓存复用给翻页
        try {
          if (!ctx.sessionPersistence) throw new Error('no sessionPersistence service')
          const all = await coldSessionEvents(cmd.sessionId)
          const { events, hasMore } = projectWindowBack(ctx, all, undefined, HISTORY_TAIL)
          // 冷会话目标：投影缓存冷读（零全量日志加载）；失败降级为 null（面板隐藏）
          let goal: GoalWire | null = null
          let todos: TodoWire[] = []
          try {
            const snap = await projectionCache()?.coldSnapshot(SessionId(cmd.sessionId))
            const values = snap?.values as Record<string, unknown> | undefined
            goal = goalWireFromProjection(values?.['goal'] as GoalProjectionLike | null | undefined)
            todos = todosFromValues(values)
          } catch (e: unknown) {
            logger.warn('GOAL', `冷会话 ${cmd.sessionId.slice(0, 12)} 目标冷读失败（降级隐藏）: ${String(e)}`)
          }
          logger.info('WS', `冷会话历史 session=${cmd.sessionId.slice(0, 12)} events=${all.length}（下发尾部 ${events.length}）`)
          send(ws, {
            type: 'history',
            sessionId: cmd.sessionId,
            events,
            hasMore,
            total: all.length,
            goal,
            todos,
            // 冷会话没有已挂载 agent：无命令清单（发消息本身也要求会话在桌面端打开）
            commands: [],
          })
        } catch (e) {
          send(ws, { type: 'error', code: 'not_found', message: `session not found: ${cmd.sessionId}` })
        }
        break
      }
      case 'history_page': {
        // 历史分页：按"投影后的可见行"翻页——向前扫描原始事件逐条投影，
        // 攒满一页可见行或扫到最开头（原始事件窗口翻页会整页投影为空，客户端卡死）。
        const sid = cmd.sessionId
        const limit = Math.min(Math.max(cmd.limit ?? 300, 10), 500)
        const liveSession = ctx.sessions.list().find((x) => String(x.id) === sid)
        const all = liveSession !== undefined
          ? liveSession.events
          : await coldSessionEvents(sid).catch(() => [])
        const scope = liveSession !== undefined ? ctx.agents.get(liveSession.id) : undefined
        const { events, hasMore } = projectWindowBack(ctx, all, cmd.beforeSeq, limit, scope)
        send(ws, {
          type: 'history',
          sessionId: sid,
          events,
          hasMore,
          total: all.length,
        })
        break
      }
      case 'send_message': {
        const msgId = cmd.msgId
        // ack 闭包：仅在携带 msgId 时回确认。成功才落幂等 Map（失败不落，允许同 msgId 重试重投）。
        const ack = (ok: boolean): void => {
          if (msgId === undefined) return
          if (ok) {
            processedMsgIds.set(msgId, { ok: true, ts: Date.now() })
            if (processedMsgIds.size > MSGID_MAX) {
              const oldest = processedMsgIds.keys().next().value
              if (oldest !== undefined) processedMsgIds.delete(oldest)
            }
          }
          send(ws, { type: 'ack', msgId, ok })
        }
        // 幂等去重：同 msgId 已成功投递过 → 不重复投递，直接回上次结果（at-least-once 语义）。
        if (msgId !== undefined) {
          const prior = processedMsgIds.get(msgId)
          if (prior !== undefined && Date.now() - prior.ts <= MSGID_TTL_MS) {
            send(ws, { type: 'ack', msgId, ok: prior.ok })
            logger.info('CMD', `send_message 幂等命中 msgId=${msgId.slice(0, 8)}（已处理，跳过重复投递）`)
            break
          }
          if (prior !== undefined) processedMsgIds.delete(msgId) // 过期 → 视为未处理，重新投递
        }
        try {
          let a = agentOf(cmd.sessionId)
          if (a === undefined) {
            // 无 live agent：判定会话类型，按 DSH Web 同款机制自动打开
            const header = await sessionHeaderOf(cmd.sessionId)
            if (header !== undefined && (header.origin === 'subagent' || header.parentSession !== undefined)) {
              ack(await deliverSubagent(ws, cmd, header))
              break
            }
            const found = await resumeAgent(cmd.sessionId)
            if (found.agent === undefined) {
              send(ws, {
                type: 'error',
                code: 'not_running',
                message: `该会话当前未在桌面端打开，且自动打开失败：${found.error ?? '未知原因'}`,
                ...(msgId !== undefined ? { msgId } : {}),
              })
              ack(false)
              break
            }
            a = found.agent
          }
          const line = cmd.text
          // 斜杠命令路由：与 DSH Web composer 同一执行链（ctx.commands.execute）。
          // 已注册命令 → 服务端命令通道执行，结果经 command/run + command/done 会话事件广播到手机；
          // 语法像命令但未注册 → 回错误行（与 Web 一致，不发给模型）；
          // 非斜杠文本 → 原样发给模型。
          const slash = SLASH_COMMAND_RE.exec(line)
          const commands = ctx.get('commands') as CommandsServiceLike | undefined
          if (slash !== null && commands?.execute !== undefined) {
            const name = slash[1]
            try {
              const outcome = await commands.execute(a, line, [], new AbortController().signal)
              if (outcome !== undefined) {
                logger.info('CMD', `斜杠命令已走命令通道 name=/${name} session=${cmd.sessionId.slice(0, 12)}`)
                ack(true)
                break
              }
            } catch (e: unknown) {
              // handler 抛出：commands 服务已落 command/done（error 行会广播到手机），
              // 这里只补一条连接级报错横幅（罕见路径：command/run 落库失败等无行可看的情况）。
              logger.warn('CMD', `斜杠命令执行异常 name=/${name} session=${cmd.sessionId.slice(0, 12)}: ${String(e)}`)
              send(ws, { type: 'error', code: 'command_failed', message: `/${name} 执行失败：${String(e)}`, ...(msgId !== undefined ? { msgId } : {}) })
              ack(false)
              break
            }
            // 未注册命令：回会话内错误行（瞬时、不落会话日志，与 Web composer 的准入反馈一致）
            broadcast({
              type: 'event',
              sessionId: cmd.sessionId,
              event: {
                seq: -Date.now(),
                timestamp: Date.now(),
                type: 'command',
                commandStatus: 'error',
                commandOk: false,
                commandName: name,
                commandArgs: line.slice(slash[0].length).trim(),
                text: `未知命令：/${name} 未注册`,
              },
            })
            logger.info('CMD', `未注册斜杠命令 name=/${name} session=${cmd.sessionId.slice(0, 12)}（回报错误行，不发模型）`)
            // 未注册命令已被服务端「处理」（回报错误行），非网络失败——ack ok:true，客户端不重试
            ack(true)
            break
          }
          a.followup(createUserMessage({ content: [{ type: 'text', text: line }], source: { kind: 'user' } }))
          ack(true)
        } catch (e: unknown) {
          logger.warn('CMD', `send_message 处理异常 msgId=${msgId ?? '-'} session=${cmd.sessionId.slice(0, 12)}: ${String(e)}`)
          ack(false)
        }
        break
      }
      case 'interrupt': {
        const a = agentOf(cmd.sessionId)
        if (!a) {
          send(ws, {
            type: 'error',
            code: 'not_running',
            message: '该会话当前未在桌面端打开，无需中断',
          })
          break
        }
        // 中断语义：clear=终止并清空排队（旧行为，缺省）；keep=仅终止当前循环、保留排队。
        // keep 用「快照用户消息 → cancel 清空 → followup 重投」：DSH 原生 keepInbox 只保留队列
        // 但不唤醒 agent，队列会停在 idle 无人消费；而 followup 重投既保留全文（非截断展示文本）、
        // 又同步唤醒 idle agent 自动开启新一轮循环消费（决策④「仅终止保留」后自动续跑）。
        const mode = cmd.mode === 'keep' ? 'keep' : 'clear'
        if (mode === 'keep') {
          const keep = [...a.inbox.nextTurn, ...a.inbox.nextStep].filter((m) => m.source.kind === 'user')
          a.cancel({ kind: 'user' })
          for (const m of keep) a.followup(createUserMessage({ content: m.content, source: m.source }))
          logger.info('INTERRUPT', `中断会话 session=${cmd.sessionId.slice(0, 12)} mode=keep 保留并重投 ${keep.length} 条排队消息`)
        } else {
          a.cancel({ kind: 'user' })
          logger.info('INTERRUPT', `中断会话 session=${cmd.sessionId.slice(0, 12)} mode=clear`)
        }
        break
      }
      case 'approve': {
        const entry = pendingApprovals.get(cmd.approvalId)
        if (!entry) {
          send(ws, { type: 'error', code: 'not_found', message: `approval not found: ${cmd.approvalId}` })
          break
        }
        entry.resolve(cmd.decision)
        break
      }
      case 'answer_approval': {
        const ok = await respondToDesktop(cmd.rpcId, {
          sessionId: cmd.sessionId,
          approvalId: cmd.approvalId,
          outcome: cmd.decision,
        })
        if (!ok) {
          send(ws, { type: 'error', code: 'not_found', message: `approval not pending: ${cmd.approvalId}` })
          break
        }
        muxRemoteApprovals.delete(cmd.approvalId)
        logger.info('RESPOND', `手机裁决桌面审批 approval=${cmd.approvalId.slice(0, 8)} outcome=${cmd.decision}`)
        broadcast({
          type: 'approval_resolved',
          approvalId: cmd.approvalId,
          sessionId: cmd.sessionId,
          outcome: cmd.decision,
        })
        break
      }
      case 'answer_question': {
        // 归一化答案：客户端（kotlinx encodeDefaults）可能显式带 custom:null，
        // 而桌面端 zod 的 z.string().optional() 只接受缺省、拒绝 null。
        const answers = cmd.answers.map((a) => ({
          id: a.id,
          selected: a.selected ?? [],
          ...(a.custom !== undefined && a.custom !== null && a.custom !== '' ? { custom: a.custom } : {}),
        }))
        const ok = await respondToDesktop(cmd.rpcId, {
          sessionId: cmd.sessionId,
          answer: { answers },
        })
        if (!ok) {
          send(ws, { type: 'error', code: 'not_found', message: `question answer rejected: ${cmd.rpcId}` })
          break
        }
        muxQuestions.delete(cmd.rpcId)
        logger.info('RESPOND', `手机回答桌面提问 rpc=${cmd.rpcId.slice(0, 8)} answers=${answers.length}`)
        broadcast({
          type: 'question_resolved',
          rpcId: cmd.rpcId,
          sessionId: cmd.sessionId,
          outcome: 'answered',
        })
        break
      }
      case 'register_device': {
        if (!cmd.deviceId || !cmd.name) {
          send(ws, { type: 'error', code: 'bad_request', message: 'deviceId and name are required' })
          break
        }
        const rec = upsertDevice(cmd.deviceId, cmd.name, cmd.model)
        logger.info('DEVICE', `设备注册 device=${cmd.deviceId.slice(0, 8)} name=${cmd.name}${cmd.model ? ` model=${cmd.model}` : ''}`)
        wsAuth.set(ws, { kind: 'device', deviceId: rec.deviceId })
        // 多路由候选端点：127.0.0.1（USB adb reverse）+ 非回环 IPv4（LAN/Tailscale 直连）
        // 非回环地址走 LAN 二级监听端口（lanPort，默认 3081）；LAN 监听关闭时回退 ctx.webServer.port（tailscale serve 旧路径）
        const nonLoopbackPort = lanServer !== null ? lanPort : ctx.webServer.port
        const endpoints = (() => {
          const seen = new Set<string>()
          const list: { host: string; port: number }[] = []
          const add = (h: string, p: number) => {
            const key = `${h}:${p}`
            if (seen.has(key)) return
            seen.add(key)
            list.push({ host: h, port: p })
          }
          add('127.0.0.1', ctx.webServer.port)
          for (const ip of lanIpv4s()) add(ip, nonLoopbackPort)
          return list
        })()
        logger.info('DEVICE', `下发候选端点: ${endpoints.map((e) => `${e.host}:${e.port}`).join(', ')}`)
        send(ws, {
          type: 'device_registered',
          deviceId: rec.deviceId,
          deviceToken: rec.token,
          serverId,
          hostname: host,
          endpoints,
        })
        break
      }
      case 'revoke_device': {
        const auth = wsAuth.get(ws) ?? { kind: 'open' as AuthKind }
        const mayRevoke =
          auth.kind === 'env' || auth.kind === 'pair' || auth.kind === 'open' || auth.deviceId === cmd.deviceId
        if (!mayRevoke) {
          send(ws, { type: 'error', code: 'forbidden', message: 'not authorized to revoke this device' })
          break
        }
        devices = devices.filter((d) => d.deviceId !== cmd.deviceId)
        saveDevices(devices)
        logger.info('DEVICE', `设备撤销 device=${cmd.deviceId.slice(0, 8)}`)
        send(ws, { type: 'device_revoked', deviceId: cmd.deviceId })
        break
      }
      default: {
        send(ws, { type: 'error', code: 'unknown_command', message: `unknown command: ${(cmd as { type?: string }).type}` })
      }
    }
  }

  // ---- WebSocket upgrade ----
  const wss = new WebSocketServer({ noServer: true })
  // 心跳判活：每 30s 主动 ping，未收到 pong 的连接判定为死连接并终止。
  // 修复「隧道消失后服务端残留僵尸连接，/remote/connected 一直显示在线」。
  const HEARTBEAT_MS = 30_000
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      const state = wsState(ws)
      if (state.alive === false) {
        logger.warn('WS', '心跳超时：终止死连接')
        ws.terminate()
        clients.delete(ws)
        continue
      }
      state.alive = false
      ws.ping()
    }
  }, HEARTBEAT_MS)
  heartbeat.unref?.()
  wss.on('connection', (ws, req) => {
    clients.add(ws)
    wsState(ws).alive = true
    const auth = wsAuth.get(ws)
    // remoteAddress 区分路由来源：USB reverse/Tailscale serve = 127.0.0.1，
    // 局域网直连 = 手机局域网 IP——多路由排查的关键线索
    const remote = req?.socket?.remoteAddress ?? 'unknown'
    logger.info('WS', `客户端连接 established (auth=${auth?.kind ?? 'unknown'}, device=${auth?.deviceId ?? '-'}, remote=${remote}, 当前 ${clients.size} 个客户端)`)
    void snapshot().then((snap) => {
      send(ws, snap)
      logger.debug('WS', `已推送 hello 快照 (sessions=${snap.sessions.length})`)
      // 重启通知：客户端重连即告知「服务端已重启 + 版本 + 新增功能」，免去客户端来问
      const work = loadWorkState(WORK_FILE)
      send(ws, {
        type: 'server_boot',
        version: BRIDGE_VERSION,
        bootedAt,
        notes: work?.notes ?? [],
      })
    })
    ws.on('pong', () => {
      wsState(ws).alive = true
    })
    ws.on('message', (data) => void handleCommand(ws, data as Buffer))
    ws.on('close', () => {
      clients.delete(ws)
      logger.info('WS', `客户端断开 (remote=${remote}, 剩余 ${clients.size} 个客户端)`)
    })
    ws.on('error', (e) => {
      clients.delete(ws)
      logger.warn('WS', `客户端连接错误 (remote=${remote}): ${e.message}`)
    })
  })

  const upgrade: WebUpgradeRoute = {
    path: '/remote/ws',
    handler: (req, socket, head) => {
      const auth = authenticate(req)
      if (auth.kind === 'none') {
        logger.warn('AUTH', `握手拒绝 (401) remote=${req.socket.remoteAddress} url=${req.url ?? ''}`)
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
        socket.destroy()
        return
      }
      logger.debug('AUTH', `握手通过 auth=${auth.kind} device=${auth.deviceId ?? '-'}`)
      wss.handleUpgrade(req, socket, head, (ws) => {
        wsAuth.set(ws, auth)
        wss.emit('connection', ws, req)
      })
    },
  }

  // ---- LAN 接口二级 WS 监听（局域网/Tailscale 直连，摆脱 USB/Tailscale serve 单点）----
  // 复用同一 wss + authenticate + handleCommand：LAN 监听只是「第二条 upgrade 入口」，
  // 鉴权语义与回环入口完全一致——匿名（无 token）且来源非回环的连接一律拒绝（authenticate 的
  // isLoopback 检查），故安全面扩大仅指「监听面」，不扩大「授权面」。
  // 端口可配：DSH_REMOTE_LAN_PORT（默认 3081）；DSH_REMOTE_LAN=0 关闭（默认开启）。
  // 为何独立端口而非复用 3080 双 listen：dsh web 已占 127.0.0.1:3080，绑 0.0.0.0:3080 会与
  // 回环监听冲突（无 SO_REUSEPORT 保证），独立端口零冲突、回环/LAN 职责清晰。
  const lanEnabled = process.env.DSH_REMOTE_LAN !== '0'
  const lanPortRaw = Number(process.env.DSH_REMOTE_LAN_PORT ?? 3081)
  const lanPort = Number.isInteger(lanPortRaw) && lanPortRaw > 0 && lanPortRaw < 65536 ? lanPortRaw : 3081
  const lanServer: ReturnType<typeof createServer> | null = lanEnabled
    ? createServer((_req, res) => {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('not found')
      })
    : null
  if (lanServer !== null) {
    lanServer.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url ?? '', 'http://localhost')
      if (url.pathname !== '/remote/ws') {
        socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n')
        socket.destroy()
        return
      }
      const auth = authenticate(req)
      if (auth.kind === 'none') {
        logger.warn('AUTH', `LAN 握手拒绝 (401) remote=${req.socket.remoteAddress} url=${req.url ?? ''}`)
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
        socket.destroy()
        return
      }
      logger.debug('AUTH', `LAN 握手通过 auth=${auth.kind} device=${auth.deviceId ?? '-'}`)
      wss.handleUpgrade(req, socket, head, (ws) => {
        wsAuth.set(ws, auth)
        wss.emit('connection', ws, req)
      })
    })
    lanServer.on('error', (e) => {
      logger.warn('WS', `LAN 二级监听异常 (0.0.0.0:${lanPort}): ${e.message}`)
    })
    lanServer.listen(lanPort, '0.0.0.0')
    logger.info('BOOT', `LAN 二级 WS 监听已启动 0.0.0.0:${lanPort}（局域网/Tailscale 直连入口，鉴权同回环）`)
  }

  // ---- REST surface ----

  const ping: WebRoute = {
    kind: 'exact',
    path: '/remote/ping',
    handler: async (_req, res) =>
      json(res, { ok: true, version: BRIDGE_VERSION, serverId, hostname: host, sessions: (await listSessions()).length }),
  }

  const health: WebRoute = {
    kind: 'exact',
    path: '/remote/health',
    handler: async (_req, res) => {
      const work = loadWorkState(WORK_FILE)
      json(res, {
        ok: true,
        version: BRIDGE_VERSION,
        sessions: (await listSessions()).length,
        work: work === null
          ? { activity: null, pending: 0 }
          : { activity: work.activity, pending: work.pending.length },
      })
    },
  }

  // 持久化工作状态（重启后自动续跑）：GET 读取 / PUT 更新（Agent 重启前写入用）
  const workRoute: WebRoute = {
    kind: 'exact',
    path: '/remote/work',
    handler: async (req, res) => {
      if (!allowLocalOrEnvToken(req, res, envToken)) return denied(res)
      if (req.method === 'PUT' || req.method === 'POST') {
        let body = ''
        for await (const chunk of req) body += typeof chunk === 'string' ? chunk : chunk.toString()
        let parsed: { activity?: string | null; pending?: string[]; notes?: string[] }
        try {
          parsed = JSON.parse(body) as typeof parsed
        } catch {
          json(res, { error: 'bad json' }, 400)
          return
        }
        const state = writeWorkState(WORK_FILE, {
          ...(parsed.activity !== undefined ? { activity: parsed.activity } : {}),
          ...(parsed.pending !== undefined ? { pending: parsed.pending } : {}),
          ...(parsed.notes !== undefined ? { notes: parsed.notes } : {}),
        })
        logger.info('WORK', `工作状态更新：activity="${state.activity ?? '-'}" pending=${state.pending.length}`)
        json(res, state)
        return
      }
      json(res, loadWorkState(WORK_FILE) ?? { activity: null, pending: [], updatedAt: 0 })
    },
  }

  const sessionsRoute: WebRoute = {
    kind: 'exact',
    path: '/remote/sessions',
    handler: async (_req, res) => json(res, { sessions: await listSessions(), agents: listAgents() }),
  }

  const pairInfo: WebRoute = {
    kind: 'exact',
    path: '/remote/pair-info',
    handler: (req, res) => {
      if (!allowLocalOrEnvToken(req, res, envToken)) return denied(res)
      const pairToken = randomBytes(16).toString('hex')
      pairTokens.set(pairToken, Date.now() + PAIR_TTL_MS)
      const info = buildPairInfo(req, pairToken, ctx.webServer.port, ctx.webServer.host, lanServer !== null ? lanPort : undefined)
      json(res, info)
    },
  }

  const pairPage: WebRoute = {
    kind: 'exact',
    path: '/remote/pair',
    handler: async (req, res) => {
      if (!allowLocalOrEnvToken(req, res, envToken)) return denied(res)
      const pairToken = randomBytes(16).toString('hex')
      pairTokens.set(pairToken, Date.now() + PAIR_TTL_MS)
      const info = buildPairInfo(req, pairToken, ctx.webServer.port, ctx.webServer.host, lanServer !== null ? lanPort : undefined)
      const payload = JSON.stringify({
        v: 1,
        t: 'dsh-remote',
        serverId: info.serverId,
        hostname: info.hostname,
        expiresAt: info.expiresAt,
        urls: info.urls,
      })
      let svg = ''
      try {
        svg = await QRCode.toString(payload, { type: 'svg', width: 280, margin: 2 })
      } catch (e) {
        console.error(`[dsh-remote-control-bridge] qr render failed: ${e}`)
      }
      const loopbackOnly = info.bindHost === '127.0.0.1'
      const html = renderPairPage(info, svg, loopbackOnly)
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-length': Buffer.byteLength(html),
        'cache-control': 'no-store',
      })
      res.end(html)
    },
  }

  const devicesRoute: WebRoute = {
    kind: 'exact',
    path: '/remote/devices',
    handler: (req, res) => {
      if (!allowLocalOrEnvToken(req, res, envToken)) return denied(res)
      json(
        res,
        devices.map((d) => ({
          deviceId: d.deviceId,
          name: d.name,
          model: d.model,
          createdAt: d.createdAt,
          lastSeenAt: d.lastSeenAt,
          token: `${d.token.slice(0, 4)}…`,
        })),
      )
    },
  }

  /** 当前活跃连接的手机（供 Web UI 配对弹窗展示连接状态）。 */
  const connectedRoute: WebRoute = {
    kind: 'exact',
    path: '/remote/connected',
    handler: (req, res) => {
      if (!allowLocalOrEnvToken(req, res, envToken)) return denied(res)
      const seen = new Map<string, { deviceId: string; name: string; model?: string; connectedAt: number }>()
      for (const ws of clients) {
        if (ws.readyState !== WebSocket.OPEN) continue
        const auth = wsAuth.get(ws)
        if (!auth?.deviceId) continue
        const dev = devices.find((d) => d.deviceId === auth.deviceId)
        if (dev && !seen.has(dev.deviceId)) {
          seen.set(dev.deviceId, {
            deviceId: dev.deviceId,
            name: dev.name,
            model: dev.model,
            connectedAt: dev.lastSeenAt,
          })
        }
      }
      json(res, [...seen.values()])
    },
  }

  /** 测试用：在当前会话内直接发起一次真实审批（loopback only）。 */
  const approvalTestRoute: WebRoute = {
    kind: 'exact',
    path: '/remote/debug/approval-test',
    handler: async (req, res) => {
      if (!isLoopback(req)) return denied(res)
      if (req.method !== 'POST') {
        json(res, { error: 'POST only' }, 405)
        return
      }
      let body = ''
      for await (const chunk of req) body += typeof chunk === 'string' ? chunk : chunk.toString()
      let parsed: { sessionId?: string; toolName?: string; reason?: string }
      try {
        parsed = JSON.parse(body) as typeof parsed
      } catch {
        json(res, { error: 'bad json' }, 400)
        return
      }
      const approvalService = ctx.get('approval') as { request?: (r: unknown) => Promise<string> } | undefined
      if (!approvalService || typeof approvalService.request !== 'function') {
        json(res, { error: 'approval service unavailable' }, 404)
        return
      }
      const agent = parsed.sessionId
        ? agentOf(String(parsed.sessionId))
        : allAgents().find((a) => a.status === 'running')
      if (!agent) {
        json(res, { error: 'no live agent' }, 404)
        return
      }
      // 会话策略可能被切到 never（会静默拒绝、不派发 answerer）：先切回 ask
      setApprovalPolicy(agent.session, 'ask')
      logger.info('DEBUG', `调试端点发起审批 session=${String(agent.id).slice(0, 12)} tool=${parsed.toolName ?? 'bash'}`)
      const outcome = await approvalService.request({
        agent,
        toolName: parsed.toolName ?? 'bash',
        reason: parsed.reason ?? '调试测试审批：验证手机端审批透传链路',
      })
      json(res, { ok: true, outcome })
    },
  }

  /** 结构化连接日志查询（loopback only，供手机日志页 / curl 排查）。 */
  const logsRoute: WebRoute = {
    kind: 'exact',
    path: '/remote/logs',
    handler: (req, res) => {
      if (!isLoopback(req)) return denied(res)
      const url = new URL(req.url ?? '', 'http://localhost')
      const level = (url.searchParams.get('level') ?? undefined) as 'debug' | 'info' | 'warn' | 'error' | undefined
      const limitRaw = Number(url.searchParams.get('limit') ?? 300)
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 1000) : 300
      json(res, { version: BRIDGE_VERSION, entries: logger.entries(level, limit) })
    },
  }

  /**
   * 桌面端拉取手机端日志：广播 logs_request 给所有已连接手机，
   * 等最多 waitMs（默认 3000）收集手机回传，一次性返回。
   */
  const phoneLogsRoute: WebRoute = {
    kind: 'exact',
    path: '/remote/phone-logs',
    handler: async (req, res) => {
      if (!isLoopback(req)) return denied(res)
      const url = new URL(req.url ?? '', 'http://localhost')
      const waitRaw = Number(url.searchParams.get('wait') ?? 8000)
      const wait = Number.isFinite(waitRaw) ? Math.min(Math.max(waitRaw, 500), 20_000) : 8000
      const requestId = randomUUID()
      const before = phoneLogBuffer.length
      broadcast({ type: 'logs_request', requestId })
      logger.info('PHONE', `请求手机回传日志 request=${requestId.slice(0, 8)}（在线客户端 ${clients.size} 个）`)
      const deadline = Date.now() + wait
      while (Date.now() < deadline && phoneLogBuffer.length === before) {
        await new Promise((r) => setTimeout(r, 100))
      }
      const entries = phoneLogBuffer.slice(before)
      // 手机恰在重连中时响应可能晚于等待窗口：无新回传时退回最近的缓冲尾部
      const fallback = entries.length > 0 ? [] : phoneLogBuffer.slice(-300)
      const out = entries.length > 0 ? entries : fallback
      json(res, { ok: true, requestId, count: out.length, fresh: entries.length > 0, entries: out })
    },
  }

  /**
   * Agent（桌面端）启动受控调试进程：POST /remote/debug/start
   * body: { sessionId, program, cwd?, breakpoints?: [{ path, line }] }
   * 返回初始状态快照；后续状态经 WS 广播（debug_state/debug_output/debug_variables）。
   */
  const debugStartRoute: WebRoute = {
    kind: 'exact',
    path: '/remote/debug/start',
    handler: async (req, res) => {
      if (!allowLocalOrEnvToken(req, res, envToken)) return denied(res)
      if (req.method !== 'POST') return json(res, { error: 'use POST' }, 405)
      let body = ''
      for await (const chunk of req) body += typeof chunk === 'string' ? chunk : chunk.toString()
      let parsed: { sessionId?: string; program?: string; cwd?: string; breakpoints?: DebugBreakpointWire[] }
      try {
        parsed = JSON.parse(body) as typeof parsed
      } catch {
        return json(res, { error: 'bad json' }, 400)
      }
      if (parsed.sessionId === undefined || parsed.program === undefined || parsed.program.trim() === '') {
        return json(res, { error: 'sessionId 与 program 必填' }, 400)
      }
      try {
        const snap = debug.start(parsed.sessionId, {
          program: parsed.program,
          ...(parsed.cwd !== undefined && parsed.cwd !== '' ? { cwd: parsed.cwd } : {}),
          ...(parsed.breakpoints !== undefined ? { breakpoints: parsed.breakpoints } : {}),
        })
        return json(res, { ok: true, debug: snap })
      } catch (e: unknown) {
        return json(res, { ok: false, error: String(e) }, 409)
      }
    },
  }

  /** Agent（桌面端）停止受控调试进程：POST /remote/debug/stop { sessionId }。 */
  const debugStopRoute: WebRoute = {
    kind: 'exact',
    path: '/remote/debug/stop',
    handler: async (req, res) => {
      if (!allowLocalOrEnvToken(req, res, envToken)) return denied(res)
      if (req.method !== 'POST') return json(res, { error: 'use POST' }, 405)
      let body = ''
      for await (const chunk of req) body += typeof chunk === 'string' ? chunk : chunk.toString()
      let parsed: { sessionId?: string }
      try {
        parsed = JSON.parse(body) as typeof parsed
      } catch {
        return json(res, { error: 'bad json' }, 400)
      }
      if (parsed.sessionId === undefined) return json(res, { error: 'sessionId 必填' }, 400)
      await debug.stop(parsed.sessionId)
      json(res, { ok: true })
    },
  }

  // 收集全部路由/升级路由的 disposer：host-webserver 对重复 (kind, path) 直接 throw，
  // 卸载时必须移除路由，否则残留路由指向旧闭包 → 二次 apply（热重载）必崩。
  const routeDisposers: Array<() => void> = []
  routeDisposers.push(ctx.webServer.registerUpgrade(upgrade))
  routeDisposers.push(ctx.webServer.register(ping))
  routeDisposers.push(ctx.webServer.register(health))
  routeDisposers.push(ctx.webServer.register(workRoute))
  routeDisposers.push(ctx.webServer.register(sessionsRoute))
  routeDisposers.push(ctx.webServer.register(pairInfo))
  routeDisposers.push(ctx.webServer.register(pairPage))
  routeDisposers.push(ctx.webServer.register(devicesRoute))
  routeDisposers.push(ctx.webServer.register(connectedRoute))
  routeDisposers.push(ctx.webServer.register(approvalTestRoute))
  routeDisposers.push(ctx.webServer.register(logsRoute))
  routeDisposers.push(ctx.webServer.register(phoneLogsRoute))
  routeDisposers.push(ctx.webServer.register(debugStartRoute))
  routeDisposers.push(ctx.webServer.register(debugStopRoute))

  void runMuxClient()

  ctx.effect(() => () => {
    // 逆序释放全部路由（升级路由 + REST）：先断新请求入口，再清资源
    for (let i = routeDisposers.length - 1; i >= 0; i -= 1) routeDisposers[i]()
    muxStopped = true
    muxWs?.close()
    for (const ws of clients) ws.close()
    clients.clear()
    wss.close()
    lanServer?.close()
    clearInterval(pairPrune)
    clearInterval(divingTicker)
    clearInterval(resumeInterval)
    clearInterval(broadcastStatTimer)
    clearTimeout(resumeBootTimer)
    for (const st of thinkStreams.values()) if (st.timer !== undefined) clearTimeout(st.timer)
    thinkStreams.clear()
    lspFeedback.dispose()
    lsp.dispose()
    debug.dispose()
    for (const t of queueSnapTimers.values()) clearTimeout(t.timer)
    queueSnapTimers.clear()
    clearInterval(heartbeat)
    for (const entry of pendingApprovals.values()) {
      clearTimeout(entry.timer)
      entry.resolve('cancelled')
    }
  })
}

// ---- pairing helpers ----

function buildPairInfo(
  req: IncomingMessage,
  pairToken: string,
  port: number,
  bindHost: '127.0.0.1' | '0.0.0.0',
  lanPort?: number,
): PairInfo {
  const ips = lanIpv4s()
  const headerHost = headerHostIp(req.headers.host)
  // 非回环地址的端口：LAN 二级监听（lanPort）优先；未启用时回退 port（tailscale serve 旧路径）
  const nonLoopbackPort = lanPort ?? port
  const urls: string[] = []
  const add = (host: string): void => {
    const p = host === '127.0.0.1' ? port : nonLoopbackPort
    const u = `ws://${host}:${p}/remote/ws?pair=${pairToken}`
    if (!urls.includes(u)) urls.push(u)
  }
  if (bindHost === '0.0.0.0') {
    for (const ip of ips) add(ip)
    if (headerHost) add(headerHost)
    add('127.0.0.1')
  } else {
    // loopback-only: adb reverse / usb tunneling keeps 127.0.0.1 usable
    add('127.0.0.1')
    if (headerHost) add(headerHost)
    for (const ip of ips) add(ip)
  }
  return {
    v: 1,
    t: 'dsh-remote',
    serverId,
    hostname: host,
    bindHost,
    port,
    expiresAt: Date.now() + PAIR_TTL_MS,
    urls,
  }
}

function lanIpv4s(): string[] {
  const out: string[] = []
  for (const infos of Object.values(networkInterfaces())) {
    for (const info of infos ?? []) {
      if (info.family === 'IPv4' && !info.internal) out.push(info.address)
    }
  }
  return out
}

function headerHostIp(hostHeader: string | undefined): string | null {
  if (!hostHeader) return null
  const h = hostHeader.split(':')[0]
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return h
  return null
}

function renderPairPage(info: PairInfo, svg: string, loopbackOnly: boolean): string {
  const esc = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const urls = info.urls.map((u) => `<div class="url">${esc(u)}</div>`).join('')
  const warning = loopbackOnly
    ? `<div class="warn">⚠️ DeepSeek Harness 的 Web 服务仅监听本机（127.0.0.1，出于安全不支持 --host 0.0.0.0），手机无法通过局域网直连。<br/>
       USB 连接时先执行 <code>adb reverse tcp:${info.port} tcp:${info.port}</code>（二维码里已包含 127.0.0.1 地址）；<br/>
       远程访问可改用 SSH 隧道：<code>ssh -L ${info.port}:127.0.0.1:${info.port} user@host</code>。</div>`
    : ''
  return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>DSH 远程配对</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#0b0f1a; color:#e6e9f2; font-family: system-ui, -apple-system, "PingFang SC", sans-serif; }
  .card { width: min(92vw, 420px); padding: 28px 24px; background:#151b2c; border-radius: 20px;
          box-shadow: 0 12px 40px rgba(0,0,0,.45); text-align:center; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color:#8b93a7; font-size: 13px; margin-bottom: 20px; }
  .qr { background:#fff; border-radius: 16px; padding: 16px; display:inline-block; line-height: 0; }
  .qr svg { display:block; }
  .hint { margin-top: 14px; font-size: 13px; color:#8b93a7; }
  .warn { margin-top: 16px; padding: 10px 12px; border-radius: 10px; background:#3a2c12;
          color:#f2c14e; font-size: 13px; line-height: 1.6; text-align:left; }
  .warn code { color:#ffd97a; }
  .urls { margin-top: 16px; text-align:left; font-size: 11px; color:#5f6880; }
  .url { font-family: ui-monospace, Menlo, monospace; word-break: break-all; margin: 3px 0; }
  .timer { color:#f2c14e; }
</style>
</head>
<body>
  <div class="card">
    <h1>📱 DSH 远程配对</h1>
    <div class="sub">${esc(info.hostname)} · ${esc(info.serverId.slice(0, 8))} · 有效期 <span class="timer" id="t">--:--</span></div>
    <div class="qr">${svg}</div>
    <div class="hint">用手机 dsh Remote App 的「扫码连接」扫描二维码</div>
    ${warning}
    <div class="urls">${urls}</div>
  </div>
  <script>
    const exp = ${info.expiresAt};
    const el = document.getElementById('t');
    const tick = () => {
      const left = Math.max(0, Math.floor((exp - Date.now()) / 1000));
      el.textContent = String(Math.floor(left / 60)).padStart(2, '0') + ':' + String(left % 60).padStart(2, '0');
      if (left <= 0) { el.textContent = '已过期，请刷新页面'; }
    };
    tick();
    setInterval(tick, 1000);
  </script>
</body>
</html>`
}

// ---- pure helpers ----

function isSubagent(a: Agent): boolean {
  const h = a.session.header
  return (h.delegationDepth ?? 0) > 0 || h.origin === 'subagent'
}

/** 结果交付（完成）正文：与 App NotificationController.deliveryCompleteBody 同语义，改由服务端生成。 */
function deliveryCompleteBody(sessionTitle: string, isSubagent: boolean): string {
  const name = sessionTitle.trim()
  if (isSubagent) return name ? `「${name}」已完成` : '子代理已完成'
  return name ? `「${name}」本轮已完成` : '本轮已完成'
}

function lastEventTime(s: Session): number {
  const evs = s.events
  return evs.length > 0 ? evs[evs.length - 1].time : s.header.createdAt
}

function extractText(content: readonly ContentBlock[] | undefined): string {
  if (!content) return ''
  let out = ''
  for (const b of content) {
    if (b.type === 'text') out += b.text
    else {
      // 容器块（tool-result 等）：真实结果嵌套在内层 content[]，递归提取
      const nested = (b as { content?: readonly ContentBlock[] }).content
      if (Array.isArray(nested)) {
        const inner = extractText(nested)
        if (inner) out += (out ? '\n' : '') + inner
      }
    }
  }
  return out
}

/** 工具结果上限：长输出截断（手机展示用，桌面端保留全量）。 */
const TOOL_RESULT_MAX_CHARS = 4000
function truncateResult(text: string): string {
  if (text.length <= TOOL_RESULT_MAX_CHARS) return text
  return `${text.slice(0, TOOL_RESULT_MAX_CHARS)}\n…(已截断，共 ${text.length} 字符)`
}

/** 从编辑/写入类工具的参数里提取被修改的绝对文件路径（LSP 诊断触发用）。 */
function toolFilePaths(data: { name?: unknown; arguments?: unknown }): string[] {
  if (data.name !== 'edit' && data.name !== 'write' && data.name !== 'str_replace_editor') return []
  const raw = data.arguments
  let args: unknown
  try {
    args = typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch {
    return []
  }
  if (args === null || typeof args !== 'object') return []
  const out: string[] = []
  for (const k of ['file_path', 'path']) {
    const v = (args as Record<string, unknown>)[k]
    if (typeof v === 'string' && v.startsWith('/')) out.push(v)
  }
  return out
}

/**
 * 按"投影后的可见行"取窗口：从 seq < beforeSeq（undefined = 最尾部）向前扫描原始事件，
 * 逐条投影、攒满 limit 行或扫到最开头。单个原始事件的多行投影原子收集（think+正文同 seq）。
 * 返回 **旧→新** 顺序（客户端 events 约定旧在前新在后，live 事件追加在末尾）。
 * hasMore：攒满 limit 且仍有未扫描的原始事件时为 true（剩余可能全不可投影，
 * 下一请求会空页返回并置 false，不会死循环）。
 */
function projectWindowBack(
  ctx: Context,
  all: readonly SessionEvent[],
  beforeSeq: number | undefined,
  limit: number,
  scope?: unknown,
): { events: EventProjection[]; hasMore: boolean } {
  const events: EventProjection[] = []
  let idx = all.length - 1
  if (beforeSeq !== undefined) {
    while (idx >= 0 && all[idx].seq >= beforeSeq) idx--
  }
  while (idx >= 0) {
    events.push(...projectEvent(ctx, all[idx], scope))
    idx--
    if (events.length >= limit) break
  }
  events.reverse() // 逆序扫描收集的，翻回旧→新
  return { events, hasMore: events.length >= limit && idx >= 0 }
}

// eslint-disable-next-line complexity -- P0 存量豁免（事件投影分派圈复杂度高，TODO 拆分），见 docs/lint-rules.md
function projectEvent(ctx: Context, event: SessionEvent, scope?: unknown): EventProjection[] {
  const base = { seq: event.seq, timestamp: event.time }
  // command/run 与 command/done 不在 dsh-session 的闭包联合类型里（commands 服务直接
  // session.append），先分流处理，不干扰下面 switch 对标准事件类型的收窄。
  const rawType = event.type as string
  if (rawType === 'command/run') {
    // 斜杠命令进入 handler：记下命令名/参数，投影为 running 行（客户端与 done 行合并渲染）
    const d = (event as { data?: unknown }).data as { commandId?: unknown; name?: unknown; args?: unknown } | undefined
    if (d === undefined || typeof d.commandId !== 'string') return []
    const name = typeof d.name === 'string' ? d.name : undefined
    const args = typeof d.args === 'string' ? d.args.trim() : ''
    if (name !== undefined) {
      if (commandMeta.size >= 200) {
        const first = commandMeta.keys().next()
        if (!first.done) commandMeta.delete(first.value)
      }
      commandMeta.set(d.commandId, { name, args })
    }
    return [{
      ...base,
      type: 'command',
      commandId: d.commandId,
      commandName: name,
      commandArgs: args,
      commandStatus: 'running',
    }]
  }
  if (rawType === 'command/done') {
    // 命令完结（成功/失败/取消）：结果文本 + 从 command/run 元数据补命令名
    const d = (event as { data?: unknown }).data as { commandId?: unknown; kind?: unknown; text?: unknown } | undefined
    if (d === undefined || typeof d.commandId !== 'string') return []
    const meta = commandMeta.get(d.commandId)
    const out: EventProjection = {
      ...base,
      type: 'command',
      commandId: d.commandId,
      commandStatus: 'done',
      commandOk: d.kind === 'success',
    }
    if (typeof d.text === 'string' && d.text.trim() !== '') out.text = d.text
    if (meta !== undefined) {
      out.commandName = meta.name
      out.commandArgs = meta.args
    }
    return [out]
  }
  switch (event.type) {
    case 'user/message': {
      const text = extractText(event.data.content)
      if (!text) return []
      // 权威分类（铁律 6：以服务端投影为准，分类在桥侧完成，客户端只渲染）：
      // DSH `user/message` 节点携带的 `source.kind` 是唯一权威判别元数据——
      //   - kind === 'user'          → 真实用户输入（排队消息被本轮认领）。
      //   - kind === 'coordinator'   → 父 agent relay（子代理会话里父代理替用户派活，
      //     对子代理而言就是「用户消息」），与 user 同判为用户角色，手机转盘据此定位。
      //   - kind === 'plugin'/其它    → 注入的上下文/系统消息（agent.inject() 的
      //     AGENTS.md <system-reminder>、LSP 编译错误反馈、文件变更通知、cron、
      //     技能内容、压缩检查点、session 起始提醒、目标续跑轮次等），source.form
      //     可细分 instructions/catalog/snapshot/notice/recall，但都不得落回 user。
      // `MessageSource` 是 merge-extensible sum type：任何未知/缺失的 source 都按
      // 注入处理（与 Web 端 contextProvenance 的降级语义一致），绝不误判为用户。
      const src = (event.data.source as { kind?: unknown } | undefined)?.kind
      const source: EventSource = (src === 'user' || src === 'coordinator') ? 'user' : 'inject'
      return [{ ...base, type: 'user_message', text, source }]
    }
    case 'assistant/message': {
      // Think（reasoning）步骤单独投影为一行，与桌面端一致；正文照常
      const blocks = event.data.message.content as readonly ContentBlock[]
      const out: EventProjection[] = []
      for (const block of blocks) {
        if (block.type !== 'reasoning') continue
        const reasoning = (block as { text?: string }).text ?? ''
        if (reasoning.trim() === '') continue
        out.push({
          ...base,
          type: 'think',
          // 一行浓缩：客户端单行展示，服务端裁剪到 240 字符
          text: reasoning.length > 240 ? `${reasoning.slice(0, 240)}…` : reasoning,
        })
      }
      const text = extractText(blocks)
      if (text) out.push({ ...base, type: 'assistant_message', text })
      return out
    }
    case 'tool/call': {
      const callId = (event.data as { callId?: unknown }).callId
      // 桌面端同款描述：presentCall 的 ToolCallView.title（Bash 即命令文本）
      let toolCard: string | undefined
      let toolDesc: string | undefined
      let toolKind: string | undefined
      let toolDiffs: DiffWire[] | undefined
      try {
        const raw = (event.data as { arguments?: unknown }).arguments
        const args = typeof raw === 'string' ? JSON.parse(raw) : raw
        const view = ctx.tools.get(String(event.data.name), scope as never)?.presentCall?.(args)
        if (view !== undefined) {
          toolCard = view.card
          // 用户要求：优先展示 description（命令的一句话总结）；TerminalCallView 的
          // title 是命令本身，description 才是人话总结。没有 description 时退回 title。
          const desc = (view as { description?: unknown }).description
          toolDesc = typeof desc === 'string' && desc.trim() !== '' ? desc : view.title
          if ('kind' in view && view.kind !== undefined) toolKind = view.kind
          // DiffCallView（edit/write 等）：把 diffs 一并下发，客户端展开工具卡渲染红删绿增
          const rawDiffs = (view as { diffs?: unknown }).diffs
          if (Array.isArray(rawDiffs)) {
            toolDiffs = rawDiffs
              .map((d): DiffWire | null => {
                const o = d as { path?: unknown; oldText?: unknown; newText?: unknown }
                if (o === null || typeof o !== 'object') return null
                if (typeof o.newText !== 'string') return null
                return {
                  path: typeof o.path === 'string' ? o.path : '',
                  oldText: typeof o.oldText === 'string' ? o.oldText : null,
                  newText: o.newText,
                }
              })
              .filter((d): d is DiffWire => d !== null)
              .slice(0, 20) // 单条工具卡 diff 上限保护
          }
        }
      } catch {
        // presenter 失败：退回无描述（客户端用默认卡片）
      }
      // 兜底：没有 presenter 的 bash 类工具用命令文本当描述
      if (toolDesc === undefined) {
        try {
          const raw = (event.data as { arguments?: unknown }).arguments
          const args = typeof raw === 'string' ? JSON.parse(raw) : raw
          const command = (args as { command?: unknown } | undefined)?.command
          if (typeof command === 'string' && command.trim() !== '') {
            toolDesc = command.trim()
            toolCard = 'terminal'
          }
        } catch {
          // 忽略
        }
      }
      return [{
        ...base,
        type: 'tool_call',
        toolName: event.data.name,
        toolArgs: event.data.arguments,
        ...(callId !== undefined ? { callId: String(callId) } : {}),
        ...(toolCard !== undefined ? { toolCard } : {}),
        ...(toolDesc !== undefined ? { toolDesc } : {}),
        ...(toolKind !== undefined ? { toolKind } : {}),
        ...(toolDiffs !== undefined ? { diffs: toolDiffs } : {}),
      }]
    }
    case 'tool/result': {
      const data = event.data as { message?: { content?: readonly ContentBlock[] }; error?: unknown }
      const cid = (data.message?.content as readonly ({ toolCallId?: unknown } | null)[] | undefined)
        ?.find((b) => (b as { toolCallId?: unknown } | null)?.toolCallId !== undefined)
        ?.toolCallId
      return [{
        ...base,
        type: 'tool_result',
        toolResult: truncateResult(extractText(data.message?.content)),
        toolError: data.error !== undefined,
        ...(cid !== undefined ? { callId: String(cid) } : {}),
      }]
    }
    default:
      return []
  }
}
