import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { hostname, homedir, networkInterfaces } from 'node:os'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocket, WebSocketServer } from 'ws'
import QRCode from 'qrcode'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage, MessageId, type ContentBlock } from '@deepseek-ai/dsh-llm'
import { SessionId, type Session, type SessionEvent, type SessionHeader } from '@deepseek-ai/dsh-session'
import type { WebRoute, WebUpgradeRoute } from '@deepseek-ai/dsh-host-webserver'
import { setApprovalPolicy } from '@deepseek-ai/dsh-user-approval'
import type { SessionProjectionCache } from '@deepseek-ai/dsh-session-projection-cache'
import type {} from '@deepseek-ai/dsh-session-title'
import type {} from '@deepseek-ai/dsh-workspace'
import type {} from '@deepseek-ai/dsh-session-persistence'

import {
  BRIDGE_VERSION,
  type AgentSummary,
  type ApprovalRequestWire,
  type ClientCommand,
  type DeviceRecord,
  type EventProjection,
  type EvHello,
  type LogEntryWire,
  type PairInfo,
  type QuestionRequestWire,
  type QueueItemWire,
  type ServerEvent,
  type SessionSummary,
  type WorkspaceSummary,
} from './protocol.js'
import { ConnLogger } from './logger.js'

export const name = 'dsh-remote-control-bridge'
export const inject = ['webServer', 'sessions', 'agents', 'workspaceRegistry', 'sessionTitle', 'sessionPersistence']

const PAIR_TTL_MS = 10 * 60_000

/** 连接层结构化日志（基础组件；/remote/logs 可查）。 */
const logger = new ConnLogger('dsh-remote-control-bridge')

// ---- persisted per-machine fingerprint + paired devices (under $DSH_HOME) ----

const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const serverId = loadOrCreateServerId()
const host = hostname()

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
  const pairPrune = setInterval(() => {
    const now = Date.now()
    for (const [t, exp] of pairTokens) if (exp < now) pairTokens.delete(t)
  }, 60_000)
  pairPrune.unref?.()

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

  /** 投影缓存服务（软依赖：headless 部署可缺省，降级 header 信息）。 */
  const projectionCache = (): SessionProjectionCache | undefined =>
    ctx.get('sessionProjectionCache') as SessionProjectionCache | undefined

  /** Desktop display title: durable title, cwd basename, then id. */
  const displayTitleOf = (s: Session): string => {
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
      updatedAt: lastEventTime(s),
      // 子代理会话：挂在主会话下，客户端不列入顶层会话列表
      ...(s.header.parentSession !== undefined ? { parentSessionId: String(s.header.parentSession) } : {}),
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
    try {
      const snap = projectionCache()?.cachedSnapshot(h)
      const values = snap?.values as Record<string, unknown> | undefined
      const titleVal = values?.['title']
      if (typeof titleVal === 'string' && titleVal.length > 0) title = titleVal
      const meta = values?.['sessionListMetadata'] as { blank?: boolean; lastPromptAt?: number | null } | undefined
      if (typeof meta?.lastPromptAt === 'number') lastPromptAt = meta.lastPromptAt
    } catch (e: unknown) {
      logger.warn('SESSION', `冷会话 ${String(h.id)} 投影缓存读取失败（降级 header）: ${String(e)}`)
    }
    return {
      id: String(h.id),
      name: title ?? coldFallbackTitle(h),
      cwd: h.cwd ?? '',
      workspaceId: workspaceIdOf(String(h.id)),
      status: 'idle',
      agentCount: 0,
      subagentCount: 0,
      updatedAt: Math.max(h.createdAt, lastPromptAt ?? 0),
      // 子代理会话：挂在主会话下，客户端不列入顶层会话列表
      ...(h.parentSession !== undefined ? { parentSessionId: String(h.parentSession) } : {}),
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

  // ---- 历史分页（尾部优先 + 按 seq 翻页）----

  /** 订阅时下发的尾部条数：秒开的关键，历史翻页经 history_page 命令补。 */
  const HISTORY_TAIL = 300

  /** 事件投影（批量）：null 投影（无关事件类型）丢弃。 */
  const projectEvents = (events: readonly SessionEvent[]): EventProjection[] =>
    events.map(projectEvent).filter((e): e is EventProjection => e !== null)

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

  // ---- live event fan-out ----
  ctx.on('session/event', (session, event) => {
    if (event.type === 'session/title') {
      broadcast({
        type: 'session_title',
        sessionId: String(session.id),
        title: event.data.title,
      })
      return
    }
    // 排队队列变化（inbox splice）→ 推给手机
    if (event.type === 'agent/inbox/spliced') {
      try {
        const agent = ctx.agents.get(session.id)
        const identity = agent?.session === session
        logger.debug('QUEUE', `inbox/spliced session=${String(session.id).slice(0, 12)} agent=${agent === undefined ? 'no' : 'yes'} identity=${identity}`)
        if (identity && agent !== undefined) {
          const items = queueItemsOf(agent)
          logger.debug('QUEUE', `session_queue 广播 session=${String(session.id).slice(0, 12)} items=${items.length}`)
          broadcast({ type: 'session_queue', sessionId: String(session.id), items })
        }
      } catch (e: unknown) {
        // 队列投影失败绝不能吞掉后续事件处理
        logger.warn('QUEUE', `inbox/spliced 处理失败: ${String(e)}`)
      }
      return
    }
    const proj = projectEvent(event)
    if (!proj) return
    broadcast({ type: 'event', sessionId: String(session.id), event: proj })
  })

  ctx.on('agent/status', ({ agent, status }) => {
    broadcast({ type: 'agent_status', sessionId: String(agent.id), status })
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
      return { kind: 'open' }
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
          send(ws, { type: 'error', code: 'queue-item-not-found', message: '排队消息已不在队列中' })
          break
        }
        const message = (target === 'next-turn' ? agent.inbox.nextTurn : agent.inbox.nextStep)
          .find((m) => m.id === cmd.itemId)
        if (message === undefined) {
          send(ws, { type: 'error', code: 'queue-item-not-found', message: '排队消息已不在队列中' })
          break
        }
        if (cmd.action === 'steer') {
          if (target !== 'next-turn' || agent.status !== 'running') {
            send(ws, { type: 'error', code: 'steer-unavailable', message: '当前轮次不接受插队' })
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
      case 'subscribe': {
        if (!cmd.sessionId) {
          send(ws, { type: 'error', code: 'not_found', message: 'subscribe 需要 sessionId' })
          break
        }
        const liveSession = ctx.sessions.list().find((x) => String(x.id) === cmd.sessionId)
        if (liveSession) {
          const all = liveSession.events
          const history = projectEvents(all.slice(-HISTORY_TAIL))
          const agent = ctx.agents.get(liveSession.id)
          send(ws, {
            type: 'history',
            sessionId: String(liveSession.id),
            events: history,
            hasMore: all.length > HISTORY_TAIL,
            total: all.length,
            ...(agent?.session === liveSession ? { queue: queueItemsOf(agent) } : {}),
          })
          break
        }
        // 冷会话：从持久化层读历史（只读，不拉起 agent）；原始事件缓存复用给翻页
        try {
          if (!ctx.sessionPersistence) throw new Error('no sessionPersistence service')
          const all = await coldSessionEvents(cmd.sessionId)
          const history = projectEvents(all.slice(-HISTORY_TAIL))
          logger.info('WS', `冷会话历史 session=${cmd.sessionId.slice(0, 12)} events=${all.length}（下发尾部 ${history.length}）`)
          send(ws, {
            type: 'history',
            sessionId: cmd.sessionId,
            events: history,
            hasMore: all.length > HISTORY_TAIL,
            total: all.length,
          })
        } catch (e) {
          send(ws, { type: 'error', code: 'not_found', message: `session not found: ${cmd.sessionId}` })
        }
        break
      }
      case 'history_page': {
        // 历史分页：seq < beforeSeq 的最近一页（limit 默认 300，上限 500）
        const sid = cmd.sessionId
        const limit = Math.min(Math.max(cmd.limit ?? 300, 10), 500)
        const liveSession = ctx.sessions.list().find((x) => String(x.id) === sid)
        const all = liveSession !== undefined
          ? liveSession.events
          : await coldSessionEvents(sid).catch(() => [])
        const page = all.filter((ev) => ev.seq < cmd.beforeSeq).slice(-limit)
        send(ws, {
          type: 'history',
          sessionId: sid,
          events: projectEvents(page),
          hasMore: all.some((ev) => ev.seq < (page[0]?.seq ?? cmd.beforeSeq)),
          total: all.length,
        })
        break
      }
      case 'send_message': {
        const a = agentOf(cmd.sessionId)
        if (!a) {
          send(ws, {
            type: 'error',
            code: 'not_running',
            message: '该会话当前未在桌面端打开：请先在桌面端打开它，再回来发指令',
          })
          break
        }
        a.followup(createUserMessage({ content: [{ type: 'text', text: cmd.text }], source: { kind: 'user' } }))
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
        a.cancel({ kind: 'user' })
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
        // 多路由候选端点：127.0.0.1（USB adb reverse）+ 全部局域网/Tailscale IPv4
        const endpoints = (() => {
          const seen = new Set<string>()
          const list: { host: string; port: number }[] = []
          const add = (h: string) => {
            const key = `${h}:${ctx.webServer.port}`
            if (seen.has(key)) return
            seen.add(key)
            list.push({ host: h, port: ctx.webServer.port })
          }
          add('127.0.0.1')
          for (const ip of lanIpv4s()) add(ip)
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
    handler: async (_req, res) => json(res, { ok: true, version: BRIDGE_VERSION, sessions: (await listSessions()).length }),
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
      const info = buildPairInfo(req, pairToken, ctx.webServer.port, ctx.webServer.host)
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
      const info = buildPairInfo(req, pairToken, ctx.webServer.port, ctx.webServer.host)
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

  ctx.webServer.registerUpgrade(upgrade)
  ctx.webServer.register(ping)
  ctx.webServer.register(health)
  ctx.webServer.register(sessionsRoute)
  ctx.webServer.register(pairInfo)
  ctx.webServer.register(pairPage)
  ctx.webServer.register(devicesRoute)
  ctx.webServer.register(connectedRoute)
  ctx.webServer.register(approvalTestRoute)
  ctx.webServer.register(logsRoute)
  ctx.webServer.register(phoneLogsRoute)

  void runMuxClient()

  ctx.effect(() => () => {
    muxStopped = true
    muxWs?.close()
    for (const ws of clients) ws.close()
    clients.clear()
    wss.close()
    clearInterval(pairPrune)
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
): PairInfo {
  const ips = lanIpv4s()
  const headerHost = headerHostIp(req.headers.host)
  const candidates: string[] = []
  if (bindHost === '0.0.0.0') {
    for (const ip of ips) candidates.push(ip)
    if (headerHost && !candidates.includes(headerHost)) candidates.push(headerHost)
  } else {
    // loopback-only: adb reverse / usb tunneling keeps 127.0.0.1 usable
    candidates.push('127.0.0.1')
    if (headerHost && !candidates.includes(headerHost)) candidates.push(headerHost)
    for (const ip of ips) if (!candidates.includes(ip)) candidates.push(ip)
  }
  return {
    v: 1,
    t: 'dsh-remote',
    serverId,
    hostname: host,
    bindHost,
    port,
    expiresAt: Date.now() + PAIR_TTL_MS,
    urls: candidates.map((ip) => `ws://${ip}:${port}/remote/ws?pair=${pairToken}`),
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

function isLoopback(req: IncomingMessage): boolean {
  const addr = req.socket.remoteAddress ?? ''
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
}

function isLoopbackHostHeader(req: IncomingMessage): boolean {
  const host = (req.headers.host ?? '').split(':')[0].toLowerCase().replace(/^\[|\]$/g, '')
  return host === '127.0.0.1' || host === 'localhost' || host === '::1'
}

/**
 * Local-only surfaces: allow genuine loopback requests (Host header must also be
 * loopback, so traffic arriving via a local reverse tunnel is NOT trusted), or
 * non-loopback requests that present the env token.
 */
function allowLocalOrEnvToken(req: IncomingMessage, res: ServerResponse, envToken: string): boolean {
  if (isLoopback(req) && isLoopbackHostHeader(req)) return true
  if (envToken && bearerToken(req.headers.authorization) === envToken) return true
  return false
}

function bearerToken(header: string | undefined): string | null {
  if (!header || !header.startsWith('Bearer ')) return null
  return header.slice(7)
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

function projectEvent(event: SessionEvent): EventProjection | null {
  const base = { seq: event.seq, timestamp: event.time }
  switch (event.type) {
    case 'user/message': {
      const text = extractText(event.data.content)
      if (!text) return null
      return { ...base, type: 'user_message', text }
    }
    case 'assistant/message': {
      const text = extractText(event.data.message.content)
      if (!text) return null
      return { ...base, type: 'assistant_message', text }
    }
    case 'tool/call': {
      const callId = (event.data as { callId?: unknown }).callId
      return {
        ...base,
        type: 'tool_call',
        toolName: event.data.name,
        toolArgs: event.data.arguments,
        ...(callId !== undefined ? { callId: String(callId) } : {}),
      }
    }
    case 'tool/result': {
      const data = event.data as { message?: { content?: readonly ContentBlock[] }; error?: unknown }
      const cid = (data.message?.content as readonly ({ toolCallId?: unknown } | null)[] | undefined)
        ?.find((b) => (b as { toolCallId?: unknown } | null)?.toolCallId !== undefined)
        ?.toolCallId
      return {
        ...base,
        type: 'tool_result',
        toolResult: truncateResult(extractText(data.message?.content)),
        toolError: data.error !== undefined,
        ...(cid !== undefined ? { callId: String(cid) } : {}),
      }
    }
    default:
      return null
  }
}

function json(res: ServerResponse, body: unknown, status = 200): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  })
  res.end(payload)
}

function denied(res: ServerResponse): void {
  json(res, { error: 'loopback_only' }, 403)
}
