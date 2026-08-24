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
import { createUserMessage, type ContentBlock } from '@deepseek-ai/dsh-llm'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { WebRoute, WebUpgradeRoute } from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-user-approval'
import type {} from '@deepseek-ai/dsh-session-title'
import type {} from '@deepseek-ai/dsh-workspace'

import {
  BRIDGE_VERSION,
  type AgentSummary,
  type ApprovalRequestWire,
  type ClientCommand,
  type DeviceRecord,
  type EventProjection,
  type PairInfo,
  type ServerEvent,
  type SessionSummary,
  type WorkspaceSummary,
} from './protocol.js'

export const name = 'dsh-remote-control-bridge'
export const inject = ['webServer', 'sessions', 'agents', 'workspaceRegistry', 'sessionTitle']

const APPROVAL_TIMEOUT_MS = 30_000
const PAIR_TTL_MS = 10 * 60_000

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

  const listSessions = (): SessionSummary[] =>
    ctx.sessions.list().map((s) => {
      const a = agentOf(String(s.id))
      return {
        id: String(s.id),
        name: displayTitleOf(s),
        cwd: s.header.cwd ?? '',
        workspaceId: workspaceIdOf(String(s.id)),
        status: a?.status ?? 'idle',
        agentCount: 1,
        subagentCount: allAgents().filter(
          (x) => String(x.session.header.parentSession) === String(s.id) && isSubagent(x),
        ).length,
        updatedAt: lastEventTime(s),
      }
    })

  const listAgents = (): AgentSummary[] =>
    allAgents().map((a) => ({
      sessionId: String(a.id),
      role: isSubagent(a) ? 'subagent' : 'primary',
      status: a.status,
      depth: a.session.header.delegationDepth ?? 0,
    }))

  const snapshot = (): ServerEvent => ({
    type: 'hello',
    version: BRIDGE_VERSION,
    serverId,
    hostname: host,
    sessions: listSessions(),
    agents: listAgents(),
    workspaces: listWorkspaces(),
  })

  const broadcast = (ev: ServerEvent): void => {
    const payload = JSON.stringify(ev)
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload)
    }
  }

  const send = (ws: WebSocket, ev: ServerEvent): void => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(ev))
  }

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
    const proj = projectEvent(event)
    if (!proj) return
    broadcast({ type: 'event', sessionId: String(session.id), event: proj })
  })

  ctx.on('agent/status', ({ agent, status }) => {
    broadcast({ type: 'agent_status', sessionId: String(agent.id), status })
  })

  // ---- approval answerer (mobile decides) ----
  const pending = new Map<string, (outcome: 'allowed-once' | 'rejected') => void>()
  ctx.on('approval/request', async (req, next) => {
    const approvalId = randomUUID()
    const approval: ApprovalRequestWire = {
      approvalId,
      sessionId: String(req.agent.id),
      toolName: req.toolName,
      reason: req.reason,
    }
    broadcast({ type: 'approval_request', approval })

    const outcome = await new Promise<'allowed-once' | 'rejected' | undefined>((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(approvalId)
        resolve(undefined)
      }, APPROVAL_TIMEOUT_MS)
      pending.set(approvalId, (o) => {
        clearTimeout(timer)
        resolve(o)
      })
    })

    if (outcome) {
      broadcast({ type: 'approval_settled', approvalId, outcome })
      return outcome
    }
    // Timed out with no connected decision-maker — fall through to other answerers.
    return next()
  })

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

  const handleCommand = (ws: WebSocket, raw: Buffer): void => {
    let cmd: ClientCommand
    try {
      cmd = JSON.parse(raw.toString()) as ClientCommand
    } catch {
      send(ws, { type: 'error', code: 'bad_json', message: 'invalid JSON' })
      return
    }

    switch (cmd.type) {
      case 'list': {
        send(ws, snapshot())
        break
      }
      case 'subscribe': {
        const s = cmd.sessionId ? ctx.sessions.list().find((x) => String(x.id) === cmd.sessionId) : undefined
        if (!s) {
          send(ws, { type: 'error', code: 'not_found', message: `session not found: ${cmd.sessionId}` })
          break
        }
        const history = s.events
          .map(projectEvent)
          .filter((e): e is EventProjection => e !== null)
        send(ws, { type: 'history', sessionId: String(s.id), events: history })
        break
      }
      case 'send_message': {
        const a = agentOf(cmd.sessionId)
        if (!a) {
          send(ws, { type: 'error', code: 'not_found', message: `agent not found: ${cmd.sessionId}` })
          break
        }
        a.followup(createUserMessage({ content: [{ type: 'text', text: cmd.text }], source: { kind: 'user' } }))
        break
      }
      case 'interrupt': {
        const a = agentOf(cmd.sessionId)
        if (!a) {
          send(ws, { type: 'error', code: 'not_found', message: `agent not found: ${cmd.sessionId}` })
          break
        }
        a.cancel({ kind: 'user' })
        break
      }
      case 'approve': {
        const resolve = pending.get(cmd.approvalId)
        if (!resolve) {
          send(ws, { type: 'error', code: 'not_found', message: `approval not found: ${cmd.approvalId}` })
          break
        }
        pending.delete(cmd.approvalId)
        resolve(cmd.decision)
        break
      }
      case 'register_device': {
        if (!cmd.deviceId || !cmd.name) {
          send(ws, { type: 'error', code: 'bad_request', message: 'deviceId and name are required' })
          break
        }
        const rec = upsertDevice(cmd.deviceId, cmd.name, cmd.model)
        wsAuth.set(ws, { kind: 'device', deviceId: rec.deviceId })
        send(ws, {
          type: 'device_registered',
          deviceId: rec.deviceId,
          deviceToken: rec.token,
          serverId,
          hostname: host,
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
  wss.on('connection', (ws) => {
    clients.add(ws)
    send(ws, snapshot())
    ws.on('message', (data) => handleCommand(ws, data as Buffer))
    ws.on('close', () => clients.delete(ws))
    ws.on('error', () => clients.delete(ws))
  })

  const upgrade: WebUpgradeRoute = {
    path: '/remote/ws',
    handler: (req, socket, head) => {
      const auth = authenticate(req)
      if (auth.kind === 'none') {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
        socket.destroy()
        return
      }
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
    handler: (_req, res) =>
      json(res, { ok: true, version: BRIDGE_VERSION, serverId, hostname: host, sessions: listSessions().length }),
  }

  const health: WebRoute = {
    kind: 'exact',
    path: '/remote/health',
    handler: (_req, res) => json(res, { ok: true, version: BRIDGE_VERSION, sessions: listSessions().length }),
  }

  const sessionsRoute: WebRoute = {
    kind: 'exact',
    path: '/remote/sessions',
    handler: (_req, res) => json(res, { sessions: listSessions(), agents: listAgents() }),
  }

  const pairInfo: WebRoute = {
    kind: 'exact',
    path: '/remote/pair-info',
    handler: (req, res) => {
      if (!isLoopback(req)) return denied(res)
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
      if (!isLoopback(req)) return denied(res)
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
      if (!isLoopback(req)) return denied(res)
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
      if (!isLoopback(req)) return denied(res)
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

  ctx.webServer.registerUpgrade(upgrade)
  ctx.webServer.register(ping)
  ctx.webServer.register(health)
  ctx.webServer.register(sessionsRoute)
  ctx.webServer.register(pairInfo)
  ctx.webServer.register(pairPage)
  ctx.webServer.register(devicesRoute)
  ctx.webServer.register(connectedRoute)

  ctx.effect(() => () => {
    for (const ws of clients) ws.close()
    clients.clear()
    wss.close()
    clearInterval(pairPrune)
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
  }
  return out
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
      return { ...base, type: 'tool_call', toolName: event.data.name, toolArgs: event.data.arguments }
    }
    case 'tool/result': {
      return {
        ...base,
        type: 'tool_result',
        toolResult: extractText(event.data.message.content),
        toolError: event.data.error !== undefined,
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
