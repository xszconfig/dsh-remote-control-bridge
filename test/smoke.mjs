// dsh-remote-control-bridge 端到端冒烟测试（隔离 DSH_HOME；含 mux WebSocket 旁路）
// 运行：pnpm test（或 node test/smoke.mjs）。测试资产随仓库迭代累积，勿放临时目录。
import { createRequire } from 'node:module'
import http from 'node:http'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
// 隔离的 DSH_HOME 与测试临时文件目录（每次运行全新，可并行）
process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'dsh-smoke-'))
const TMP = process.env.DSH_HOME

// 自动续跑测试：低延迟 + 预写待办
process.env.DSH_REMOTE_RESUME_DELAY_MS = '300'
{
  const fsInit = await import('node:fs')
  const workHome = process.env.DSH_HOME ?? (process.env.HOME + '/.dsh')
  fsInit.mkdirSync(workHome, { recursive: true })
  fsInit.writeFileSync(workHome + '/remote-control-work.json', JSON.stringify({ activity: '冒烟自测', pending: ['冒烟待办A', '冒烟待办B'], notes: [], queues: { 'session-1': { items: [{ id: 'gone-1', placement: 'queued', text: '重启前丢失的排队消息' }], at: Date.now() } }, updatedAt: Date.now() }))
}
const { apply, name, inject } = await import(
  new URL('../lib/index.js', import.meta.url).href
)
const { WebSocket, WebSocketServer } = require('ws')

const results = []
const check = (label, cond, detail = '') => {
  results.push({ label, pass: !!cond })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
}

// ---- mock ctx ----
const routes = new Map()
const upgrades = new Map()
const listeners = new Map()
const approvalRequestCalls = []
const sessionAppendLog = []

const inboxRemoved = []
const followupCalls = []
const injectCalls = []          // LSP 诊断反馈：运行中会话 agent.inject（next-step）记录
const inboxSteered = []
const commandExecuteCalls = []
const resumeCalls = []          // ctx.agents.resume 调用记录（休眠会话自动打开）
const resumedFollowupCalls = [] // 顶层休眠会话恢复后 followup 投递的消息
const subagentFollowupCalls = [] // ctx.subagents.followup 调用记录（子代理冷恢复）
const presetMountCalls = []     // agentPresets.mount 调用记录（resume setup 挂 preset）
const eventsListeners = new Map()
const inboxMessages = [
  { id: 'm1', source: { kind: 'user' }, content: [{ type: 'text', text: '排队的消息1' }] },
  { id: 'm2', source: { kind: 'user' }, content: [{ type: 'text', text: '排队的消息2' }] },
]
const inbox = {
  nextTurn: inboxMessages,
  nextStep: [],
  remove: (id) => { inboxRemoved.push(String(id)) },
  steer: (m) => { inboxSteered.push(m) },
}

const mockSession = {
  id: 'session-1',
  header: { delegationDepth: 0, cwd: '/mock', createdAt: 500 },
  append(type, data) {
    sessionAppendLog.push({ type, data })
  },
  events: [
    { seq: 1, time: 1000, type: 'user/message', data: { content: [{ type: 'text', text: '第一句' }] } },
    { seq: 2, time: 1100, type: 'llm/delta', data: { delta: '内部噪声' } },
    { seq: 3, time: 1200, type: 'assistant/message', data: { message: { content: [{ type: 'reasoning', text: '思考中' }, { type: 'text', text: '第一答' }] } } },
    { seq: 4, time: 1300, type: 'llm/delta', data: { delta: '内部噪声2' } },
    { seq: 5, time: 1400, type: 'user/message', data: { content: [{ type: 'text', text: '第二句' }] } },
  ],
}

// 活子代理会话：header 带 parentSession，subagent 投影提供创建时的 description
const mockSubSession = {
  id: 'session-sub',
  header: { parentSession: 'session-1', delegationDepth: 1, origin: 'subagent', cwd: '/mock', createdAt: 600 },
  events: [],
}

// 冷会话（已持久化、未加载）：list/readFrom 模拟持久化层
const coldSessions = {
  'cold-1': {
    meta: { id: 'cold-1', createdAt: 1000, cwd: '/proj-a' },
    events: [
      { seq: 1, time: 1000, type: 'user/message', data: { content: [{ type: 'text', text: '你好' }] } },
      { seq: 2, time: 2000, type: 'session/title', data: { title: '冷会话标题A', messageSeqs: [1], source: { kind: 'user' } } },
    ],
  },
  'cold-2': {
    meta: { id: 'cold-2', createdAt: 3000, cwd: '/proj-b' },
    events: [],
  },
  // 子代理会话：header 带 parentSession，客户端应挂在主会话下
  'cold-3': {
    meta: { id: 'cold-3', createdAt: 1500, cwd: '/proj-a', parentSession: 'cold-1' },
    events: [],
  },
  // 创建子代理的父会话：tool/call 带 description（主 agent 派发子代理时写的凝练描述）
  'cold-parent': {
    meta: { id: 'cold-parent', createdAt: 500, cwd: '/proj-a' },
    events: [
      { seq: 1, time: 500, type: 'tool/call', data: { callId: 'sub-call-1', name: 'subagent', arguments: JSON.stringify({ description: '自动续跑根因排查修复', prompt: '排查自动续跑失败的根因并修复', run_in_background: true }) } },
    ],
  },
  // 子代理会话：投影缓存里带 subagent.label（= tool/call 的 description）+ 长首个 Prompt
  'cold-sub': {
    meta: { id: 'cold-sub', createdAt: 400, cwd: '/proj-a', parentSession: 'cold-parent' },
    events: [],
  },
  // 子代理会话：无 description，回退原投影标题
  'cold-sub-nodesc': {
    meta: { id: 'cold-sub-nodesc', createdAt: 300, cwd: '/proj-a', parentSession: 'cold-parent' },
    events: [],
  },
}

// agent 状态可变：模拟真实 harness 的 idle→running 唤醒（followup 同步触发 agent/status running，构成重入）。
// 修复前 tryResumeIfPending 在指纹写盘前被 followup 的重入再次调用 → 同批待办连发两条续跑指令。
let agentStatus = 'running'
const mockAgent = () => ({
  id: 'session-1',
  status: agentStatus,
  session: mockSession,
  inbox,
  steer: (m) => { inboxSteered.push(m) },
  inject: (m) => { injectCalls.push(m) },
  followup: (m) => {
    followupCalls.push(m)
    if (agentStatus === 'idle') {
      agentStatus = 'running'
      const l = listeners.get('agent/status')
      if (l) l({ agent: mockAgent(), status: 'running' })
    }
  },
})

const mockCtx = {
  webServer: {
    port: 0, // 稍后由测试服务器实际端口覆盖
    host: '0.0.0.0',
    register(r) { routes.set(`${r.kind}:${r.path}`, r.handler) },
    registerUpgrade(r) { upgrades.set(r.path, r.handler) },
  },
  sessions: { list: () => [mockSession, mockSubSession] },
  agents: {
    list: () => [mockAgent()],
    get: (id) => (String(id) === 'session-1' ? mockAgent() : undefined),
    // 休眠会话自动打开：DSH Web 同款 ctx.agents.resume。cold-1 恢复成功，其余抛错模拟失败。
    resume: async (options) => {
      resumeCalls.push(options)
      const sid = String(options.resumeSessionId)
      if (sid === 'cold-1') {
        const resumed = {
          id: sid,
          status: 'idle',
          session: {
            id: sid,
            header: { cwd: '/proj-a', agentPreset: 'smoke-preset' },
            events: [],
            requestHeader: () => undefined,
          },
          inbox: { nextTurn: [], nextStep: [] },
          followup: (m) => { resumedFollowupCalls.push(m) },
        }
        if (options.setup) {
          // setup 会装模型选择 + 挂 preset（installModelSelection 是真实实现，走 ctx.on 注册）
          const agentCtx = { agent: resumed, on: () => () => {} }
          await options.setup(agentCtx)
        }
        return { agent: resumed }
      }
      throw new Error('resume failed: session not found')
    },
  },
  workspaceRegistry: {
    list: () => [{ id: 'ws-1', title: '项目A', path: '/a', sessionIds: ['session-1', 'cold-1'] }],
    archivedSessionIds: [],
  },
  sessionTitle: { get: () => undefined },
  // todos 投影 mock（任务列表会话隔离用）+ subagent 投影 mock（子代理标题 description）
  sessionProjections: {
    snapshot: (session) => {
      const values = { todos: [{ content: '写协议字段', status: 'in_progress' }, { content: '跑冒烟', status: 'pending' }] }
      if (session && String(session.id) === 'session-sub') {
        values.subagent = { mode: 'one-shot', label: 'Deep Diving 计时闪烁修复', seq: 0 }
      }
      return { values }
    },
    onChanged: () => () => {},
  },
  // dsh-goal 软依赖 mock：活会话读 GoalView
  goals: {
    get: (agent) => (agent
      ? { objective: '完成 LSP 与调试器集成', phase: 'active', maxGoalRounds: 8, roundsStarted: 1, updatedAt: 1000 }
      : undefined),
  },
  sessionPersistence: {
    list: async () => Object.values(coldSessions).map((c) => c.meta),
    readFrom: async (id) => coldSessions[String(id)] ?? { meta: { id: String(id), createdAt: 0 }, events: [] },
  },
  tools: {
    get: (name) => (name === 'bash'
      ? { presentCall: (args) => ({ card: 'terminal', title: args.command, description: '执行 shell 命令' }) }
      : name === 'edit'
        ? { presentCall: (args) => ({ card: 'diff', title: `Edit ${args.file_path}`, diffs: [{ path: args.file_path, oldText: 'a\nb', newText: 'a\nc' }] }) }
        : undefined),
  },
  get(name) {
    if (name === 'goals') return this.goals
    if (name === 'sessionProjections') return this.sessionProjections
    if (name === 'commands') {
      // DSH commands 服务 mock：execute(agent, line, images, signal) →
      // undefined=未注册/语法不符；对象=已执行。斜杠命令路由走这里（与 Web composer 同链）。
      return {
        list: (agent) => [
          { name: 'compact', description: 'Compact older conversation history' },
          { name: 'plan', description: 'Enter or leave plan mode', input: { hint: 'off|message' } },
        ],
        execute: async (agent, line, images, signal) => {
          commandExecuteCalls.push({ agent, line, images, signal })
          if (line === '/compact') {
            return { commandId: 'cmd-smoke-1', result: { kind: 'success', text: 'Compacted 3 history items' } }
          }
          if (line === '/compact extra') {
            return { commandId: 'cmd-smoke-2', result: { kind: 'error', text: 'Usage: /compact (no arguments)' } }
          }
          return undefined
        },
      }
    }
    if (name === 'approval') {
      return {
        request: async (req) => {
          approvalRequestCalls.push(req)
          return 'allowed-once'
        },
      }
    }
    if (name === 'sessionProjectionCache') {
      return {
        cachedSnapshot(meta) {
          if (String(meta.id) === 'cold-1') {
            return { values: { title: '冷会话标题A', sessionListMetadata: { blank: false, lastPromptAt: 2000 } } }
          }
          if (String(meta.id) === 'cold-sub') {
            return { values: { title: '排查自动续跑失败的根因并修复（很长的首个 Prompt 无法在一行内展示核心信息）', subagent: { mode: 'one-shot', label: '自动续跑根因排查修复', seq: 0 } } }
          }
          if (String(meta.id) === 'cold-sub-nodesc') {
            return { values: { title: '回退原标题测试' } }
          }
          return undefined
        },
        coldSnapshot: async (id) => {
          if (String(id) === 'cold-1') {
            return {
              values: {
                goal: {
                  goal: { objective: '冷会话目标：重构完成', phase: 'blocked', blockedReason: { code: 'blocked', message: '等待用户确认' }, maxGoalRounds: 5 },
                  roundsStarted: 2,
                  updatedAt: 111,
                },
              },
            }
          }
          return { values: {} }
        },
      }
    }
    if (name === 'agentDefaultModel') {
      return { currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-chat' }) }
    }
    if (name === 'agentPresets') {
      return {
        mount: async (agentCtx, presetId) => { presetMountCalls.push({ presetId }) },
      }
    }
    if (name === 'subagents') {
      // 子代理续跑：cold-3 是其父 cold-1 的子代理（header.parentSession='cold-1'）
      return {
        followup: async (parent, childId, content, options) => {
          subagentFollowupCalls.push({ parentId: String(parent.id), childId: String(childId), content, options })
          return 'msg-sub-1'
        },
      }
    }
    return undefined
  },
  on(ev, cb) { listeners.set(ev, cb) },
  events: { on: (ev, cb) => { eventsListeners.set(ev, cb) } },
  effect() {},
}

// ---- 测试服务器（bridge WS + 伪 mux WS + /api/respond）----
const fakeResponds = []
const muxSockets = new Set()
const httpServer = http.createServer((req, res) => {
  const pathname = new URL(req.url ?? '/', 'http://x').pathname
  const h = routes.get(`exact:${pathname}`)
  if (h) return h(req, res)
  if (pathname === '/api/respond' && req.method === 'POST') {
    let body = ''
    req.on('data', (c) => { body += c.toString() })
    req.on('end', () => {
      let parsed = null
      try { parsed = JSON.parse(body) } catch {}
      fakeResponds.push(parsed)
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ accepted: true }))
    })
    return
  }
  res.writeHead(404)
  res.end('nf')
})
const muxWss = new WebSocketServer({ noServer: true })
muxWss.on('connection', (ws) => {
  muxSockets.add(ws)
  ws.on('close', () => muxSockets.delete(ws))
})
httpServer.on('upgrade', (req, socket, head) => {
  const pathname = new URL(req.url ?? '/', 'http://x').pathname
  if (pathname === '/api/events.mux') return muxWss.handleUpgrade(req, socket, head, (ws) => muxWss.emit('connection', ws))
  const h = upgrades.get('/remote/ws')
  if (h) return h(req, socket, head)
  socket.destroy()
})
await new Promise((r) => httpServer.listen(0, '127.0.0.1', r))
const port = httpServer.address().port
mockCtx.webServer.port = port

apply(mockCtx)
check('exports', name === 'dsh-remote-control-bridge' && Array.isArray(inject) && inject.includes('webServer') && inject.includes('sessionPersistence'))

// boot 立即注入：agent 已在 boot 时挂载（本例 mock 里 list() 直接返回 running agent），
// 续跑指令应同步注入，而不是等 20s 兜底定时器（这是「重启后要等好久才续上」的延迟来源之一）。
{
  const bootResume = followupCalls.find((f) => f.content?.[0]?.text?.includes('自动续跑'))?.content?.[0]?.text ?? ''
  check('boot 立即注入续跑指令（同步、不等定时器）', bootResume.includes('冒烟待办A') && bootResume.includes('冒烟待办B'), JSON.stringify({ n: followupCalls.length, txt: bootResume.slice(0, 80) }))
}

// 等待 bridge 的 mux 客户端连上伪 mux
let muxReady = false
for (let i = 0; i < 50 && !muxReady; i++) {
  await new Promise((r) => setTimeout(r, 100))
  muxReady = muxSockets.size > 0
}
check('bridge 已连接 mux WebSocket', muxReady)

// REST 基础
{
  const res = { status: 200, body: '', writeHead(s, h) { this.status = s }, end(b) { this.body = b.toString() } }
  const req = { url: '/remote/ping', headers: { host: '127.0.0.1' }, socket: { remoteAddress: '127.0.0.1' } }
  await routes.get('exact:/remote/ping')(req, res)
  const j = JSON.parse(res.body)
  check('ping 0.12.0', j.ok === true && j.version === '0.12.0', j.version)
}

// 手机客户端
const openPhone = () => new Promise((resolve, reject) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/remote/ws`)
  const msgs = []
  const timer = setTimeout(() => reject(new Error('phone connect timeout')), 3000)
  ws.on('message', (d) => msgs.push(JSON.parse(d.toString())))
  ws.on('open', () => { clearTimeout(timer); resolve({ ws, msgs }) })
  ws.on('error', reject)
})
const awaitMsg = async (msgs, pred, label, tries = 40) => {
  for (let i = 0; i < tries; i++) {
    const found = msgs.find(pred)
    if (found) return found
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`awaitMsg timeout: ${label}`)
}

let phone2
// 设备注册：下发多路由候选端点
{
  phone2 = await openPhone()
  phone2.ws.send(JSON.stringify({ type: 'register_device', deviceId: 'phone-abc', name: '测试手机', model: 'Pixel' }))
  const reg = await awaitMsg(phone2.msgs, (m) => m.type === 'device_registered', 'device_registered')
  check('device_registered 下发候选端点', Array.isArray(reg.endpoints) && reg.endpoints.length > 0 && reg.endpoints[0].host === '127.0.0.1' && reg.endpoints.every((e) => typeof e.port === 'number'), JSON.stringify(reg.endpoints))
  phone2.ws.close()
}

// /remote/logs 接口
{
  const res = { status: 200, body: '', writeHead(s, h) { this.status = s }, end(b) { this.body = b.toString() } }
  const req = { url: '/remote/logs?limit=50', headers: { host: '127.0.0.1' }, socket: { remoteAddress: '127.0.0.1' } }
  await routes.get('exact:/remote/logs')(req, res)
  const j = JSON.parse(res.body)
  check('/remote/logs 返回结构化日志', Array.isArray(j.entries) && j.entries.length > 0 && typeof j.entries[0].seq === 'number' && typeof j.entries[0].tag === 'string', JSON.stringify(j.entries.slice(-2)))
}

const phone = await openPhone()
// 工具结果嵌套提取：真实结果在 message.content[0].content[] 内
{
  const evListener = listeners.get('session/event')
  if (evListener) {
    evListener({ id: 'session-1' }, { seq: 1, time: Date.now(), type: 'tool/result', data: { message: { content: [{ type: 'tool-result', toolCallId: 'c1', content: [{ type: 'text', text: 'total 64\n-rw-r--r-- build.gradle.kts' }] }] } } })
    const proj = await awaitMsg(phone.msgs, (m) => m.type === 'event' && m.event.type === 'tool_result', 'tool_result 事件')
    check('工具结果嵌套提取', proj.event.toolResult?.includes('build.gradle.kts') === true, JSON.stringify(proj.event.toolResult))
    check('工具结果携带 callId（失败标红关联）', proj.event.callId === 'c1', JSON.stringify(proj.event.callId))
  }
}
// 工具调用携带 callId
{
  const evListener = listeners.get('session/event')
  if (evListener) {
    evListener({ id: 'session-1' }, { seq: 2, time: Date.now(), type: 'tool/call', data: { callId: 'c1', name: 'bash', arguments: JSON.stringify({ command: 'ls' }) } })
    const proj = await awaitMsg(phone.msgs, (m) => m.type === 'event' && m.event.type === 'tool_call' && m.event.callId === 'c1', 'tool_call callId')
    check('工具调用携带 callId', proj.event.callId === 'c1' && proj.event.toolName === 'bash', JSON.stringify(proj.event))
    check('工具调用带桌面端描述（优先 description 而非命令 title）', proj.event.toolCard === 'terminal' && proj.event.toolDesc === '执行 shell 命令', JSON.stringify(proj.event.toolDesc))
  }
}
// Edit 工具调用携带 diffs（DiffCallView → 客户端红删绿增）
{
  const evListener5 = listeners.get('session/event')
  if (evListener5) {
    evListener5({ id: 'session-1' }, { seq: 30, time: Date.now(), type: 'tool/call', data: { callId: 'c2', name: 'edit', arguments: JSON.stringify({ file_path: '/tmp/x.txt', old_str: 'a\nb', new_str: 'a\nc' }) } })
    const proj = await awaitMsg(phone.msgs, (m) => m.type === 'event' && m.event.type === 'tool_call' && m.event.callId === 'c2', 'edit tool_call diff')
    check('Edit 工具调用携带 diffs（oldText/newText）', Array.isArray(proj.event.diffs) && proj.event.diffs.length === 1 && proj.event.diffs[0].path === '/tmp/x.txt' && proj.event.diffs[0].oldText === 'a\nb' && proj.event.diffs[0].newText === 'a\nc', JSON.stringify(proj.event.diffs))
  }
}
// Think 步骤投影 + 正文
{
  const evListener = listeners.get('session/event')
  if (evListener) {
    evListener(mockSession, { seq: 3, time: Date.now(), type: 'assistant/message', data: { message: { content: [
      { type: 'reasoning', text: '先思考一下这个问题的结构' },
      { type: 'text', text: '这是正文回答' },
    ] } } })
    const think = await awaitMsg(phone.msgs, (m) => m.type === 'event' && m.event.type === 'think', 'think 投影')
    const msg = await awaitMsg(phone.msgs, (m) => m.type === 'event' && m.event.type === 'assistant_message', 'assistant 投影')
    check('Think 步骤单独投影一行', think.event.text === '先思考一下这个问题的结构', JSON.stringify(think.event.text))
    check('正文照常投影', msg.event.text === '这是正文回答', JSON.stringify(msg.event.text))
  }
}

const hello = phone.msgs.find((m) => m.type === 'hello')

// ---- 启动自动续跑：boot 后向主 agent 注入续跑指令 ----
{
  await new Promise((r) => setTimeout(r, 800))
  const txt = followupCalls.find((f) => f.content?.[0]?.text?.includes('自动续跑'))?.content?.[0]?.text ?? ''
  check('启动自动续跑：向主 agent 注入续跑指令（含待办清单）', txt.includes('自动续跑') && txt.includes('冒烟待办A') && txt.includes('冒烟待办B'), JSON.stringify({ n: followupCalls.length, txt: txt.slice(0, 120) }))
  // 队列快照恢复：boot 预写的 queues 里有一条活队列没有的消息 → 恢复注入 + 快照清理
  const restored = followupCalls.find((f) => f.content?.[0]?.text?.includes('重启前丢失的排队消息'))
  check('排队消息跨重启恢复：丢失消息重新注入', restored !== undefined, JSON.stringify(followupCalls.map((f) => f.content?.[0]?.text?.slice(0, 30))))
  const workAfter = JSON.parse((await import('node:fs')).readFileSync((process.env.DSH_HOME ?? (process.env.HOME + '/.dsh')) + '/remote-control-work.json', 'utf8'))
  check('恢复后清理该会话快照', workAfter.queues === undefined || workAfter.queues['session-1'] === undefined, JSON.stringify(workAfter.queues))
}

// ---- 自动续跑幂等：同批待办只注入一次（重入触发源 + 跨触发源 + agent 挂载即时注入）----
{
  const fs = await import('node:fs')
  const workFile = (process.env.DSH_HOME ?? (process.env.HOME + '/.dsh')) + '/remote-control-work.json'
  const resumeCount = (from) => followupCalls.slice(from).filter((f) => f.content?.[0]?.text?.includes('自动续跑')).length
  const statusListener = listeners.get('agent/status')
  const createdListener = listeners.get('agent/created')

  // 1) 重入触发源：followup 唤醒 idle agent → 同步触发 agent/status running → 重入 tryResumeIfPending。
  //    修复前指纹写盘晚于 followup，重入会再次注入 → 同批连发两条；修复后进程内锁阻断重入 → 恰好一次。
  fs.writeFileSync(workFile, JSON.stringify({ activity: '重入自测', pending: ['重入待办1'], notes: [], updatedAt: Date.now() }))
  agentStatus = 'idle'
  const beforeReentrant = followupCalls.length
  if (statusListener) statusListener({ agent: mockAgent(), status: 'running' })
  check('重入触发源下同批待办只注入一次续跑指令', resumeCount(beforeReentrant) === 1, JSON.stringify({ n: resumeCount(beforeReentrant) }))

  // 2) 跨触发源幂等：同一批待办再次触发（agent/status + agent/created）不得重复注入（磁盘指纹幂等）
  const beforeRepeat = followupCalls.length
  if (statusListener) statusListener({ agent: mockAgent(), status: 'running' })
  if (createdListener) createdListener({ agent: mockAgent() })
  check('跨触发源同批待办不重复注入（磁盘指纹幂等）', resumeCount(beforeRepeat) === 0, JSON.stringify({ n: resumeCount(beforeRepeat) }))
  agentStatus = 'running'

  // 3) agent 挂载（agent/created）即时注入：新挂载的 agent 不必等 20s 兜底定时器
  fs.writeFileSync(workFile, JSON.stringify({ activity: '挂载自测', pending: ['挂载待办1'], notes: [], updatedAt: Date.now() }))
  const beforeCreated = followupCalls.length
  if (createdListener) createdListener({ agent: mockAgent() })
  check('agent 挂载（agent/created）即时注入续跑指令', resumeCount(beforeCreated) === 1, JSON.stringify({ n: resumeCount(beforeCreated) }))

  // 4) 队列恢复重入防护：恢复丢失消息的 followup 唤醒 idle agent → agent/status running →
  //    重入 restoreQueueIfLost。修复前同一条丢失消息会被重复注入；修复后恰好一次。
  fs.writeFileSync(workFile, JSON.stringify({ activity: null, pending: [], notes: [], queues: { 'session-1': { items: [{ id: 'gone-reentrant', placement: 'queued', text: '重入丢失的排队消息' }], at: Date.now() } }, updatedAt: Date.now() }))
  agentStatus = 'idle'
  const beforeQueue = followupCalls.length
  if (statusListener) statusListener({ agent: mockAgent(), status: 'running' })
  const queueRestored = followupCalls.slice(beforeQueue).filter((f) => f.content?.[0]?.text?.includes('重入丢失的排队消息'))
  check('队列恢复重入防护：同一条丢失消息只注入一次', queueRestored.length === 1, JSON.stringify({ n: queueRestored.length }))
  agentStatus = 'running'
}

check('hello 0.12.0 含三挂起队列', hello?.version === '0.12.0' && Array.isArray(hello?.pendingApprovals) && Array.isArray(hello?.pendingRemoteApprovals) && Array.isArray(hello?.pendingQuestions), hello?.version)

// ---- 会话列表合并持久化层（冷会话可见 + 标题/工作区/排序）----
check('hello 合并冷会话', hello?.sessions?.some((s) => s.id === 'cold-1') === true && hello?.sessions?.some((s) => s.id === 'cold-2') === true, JSON.stringify(hello?.sessions?.map((s) => `${s.id}→${s.workspaceId}`)))
check('冷会话标题来自投影缓存 + 工作区归属', hello?.sessions?.find((s) => s.id === 'cold-1')?.name === '冷会话标题A' && hello?.sessions?.find((s) => s.id === 'cold-1')?.workspaceId === 'ws-1', JSON.stringify(hello?.sessions?.find((s) => s.id === 'cold-1')))
check('会话按 updatedAt 倒序', hello?.sessions?.[0]?.id === 'cold-2', `${hello?.sessions?.[0]?.id}`)
check('子代理会话带 parentSessionId', hello?.sessions?.find((s) => s.id === 'cold-3')?.parentSessionId === 'cold-1', JSON.stringify(hello?.sessions?.find((s) => s.id === 'cold-3')))
check('未分组会话 workspaceId=null', hello?.sessions?.find((s) => s.id === 'cold-2')?.workspaceId === null && hello?.sessions?.find((s) => s.id === 'cold-2')?.name === 'proj-b')
// ---- 子代理会话标题：description 覆盖首个 Prompt（活会话 + 冷会话 + 无 description 回退）----
check('子代理会话标题 = 创建时 description（活会话，覆盖首个 Prompt）', hello?.sessions?.find((s) => s.id === 'session-sub')?.name === 'Deep Diving 计时闪烁修复', JSON.stringify(hello?.sessions?.find((s) => s.id === 'session-sub')))
check('子代理会话标题 = 父会话 tool/call 的 description（冷会话）', hello?.sessions?.find((s) => s.id === 'cold-sub')?.name === '自动续跑根因排查修复', JSON.stringify(hello?.sessions?.find((s) => s.id === 'cold-sub')))
check('无 description 的子代理会话回退原投影标题', hello?.sessions?.find((s) => s.id === 'cold-sub-nodesc')?.name === '回退原标题测试', JSON.stringify(hello?.sessions?.find((s) => s.id === 'cold-sub-nodesc')))

// ---- 子代理会话标题：session/title 推送也用 description（覆盖 DSH 首个 Prompt）----
{
  const evListenerSub = listeners.get('session/event')
  if (evListenerSub) {
    phone.msgs.length = 0
    evListenerSub(mockSubSession, { seq: 1, time: Date.now(), type: 'session/title', data: { title: '很长的首个 Prompt（不应作为标题）', messageSeqs: [1], source: { kind: 'fallback' } } })
    const st = await awaitMsg(phone.msgs, (m) => m.type === 'session_title' && m.sessionId === 'session-sub', '子代理 session_title 推送')
    check('session_title 推送子代理标题 = description', st.title === 'Deep Diving 计时闪烁修复', JSON.stringify(st))
  }
}

// ---- 冷会话订阅：从持久化层读历史 ----
{
  phone.ws.send(JSON.stringify({ type: 'subscribe', sessionId: 'cold-1' }))
  const hist = await awaitMsg(phone.msgs, (m) => m.type === 'history' && m.sessionId === 'cold-1', '冷会话历史')
  check('冷会话订阅返回持久化历史', Array.isArray(hist.events) && hist.events.length === 1 && hist.events[0].type === 'user_message' && hist.events[0].text === '你好', JSON.stringify(hist.events))
  check('冷会话订阅带 goal（投影冷读）', hist.goal?.objective === '冷会话目标：重构完成' && hist.goal?.phase === 'blocked' && hist.goal?.blockedMessage === '等待用户确认' && hist.goal?.roundsStarted === 2, JSON.stringify(hist.goal))
}

// ---- 顶层休眠会话发消息：自动打开（agents.resume）→ 消息送达 followup ----
{
  phone.msgs.length = 0
  const beforeFollowup = resumedFollowupCalls.length
  const beforeResume = resumeCalls.length
  phone.ws.send(JSON.stringify({ type: 'send_message', sessionId: 'cold-1', text: 'hi' }))
  await new Promise((r) => setTimeout(r, 400))
  check('顶层休眠会话 send_message 触发 agents.resume',
    resumeCalls.length === beforeResume + 1 && String(resumeCalls[resumeCalls.length - 1].resumeSessionId) === 'cold-1',
    JSON.stringify(resumeCalls.map((c) => String(c.resumeSessionId))))
  check('resume setup 挂 preset（模型选择 + agentPresets.mount）',
    presetMountCalls.length >= 1 && presetMountCalls[presetMountCalls.length - 1].presetId === 'smoke-preset',
    JSON.stringify(presetMountCalls))
  check('消息送达恢复后的 agent.followup',
    resumedFollowupCalls.length === beforeFollowup + 1 && resumedFollowupCalls[resumedFollowupCalls.length - 1].content?.[0]?.text === 'hi',
    JSON.stringify(resumedFollowupCalls.map((f) => f.content?.[0]?.text)))
  check('打开成功后不再回 not_running 报错', phone.msgs.every((m) => m.type !== 'error'), JSON.stringify(phone.msgs.filter((m) => m.type === 'error')))
}

// ---- 子代理休眠会话发消息：先拉起父会话，再经 subagents.followup 冷恢复投递 ----
{
  phone.msgs.length = 0
  const beforeResume = resumeCalls.length
  phone.ws.send(JSON.stringify({ type: 'send_message', sessionId: 'cold-3', text: '继续子代理' }))
  await new Promise((r) => setTimeout(r, 400))
  check('子代理会话 send_message 走 subagents.followup',
    subagentFollowupCalls.length === 1 && subagentFollowupCalls[0].childId === 'cold-3'
    && subagentFollowupCalls[0].parentId === 'cold-1'
    && subagentFollowupCalls[0].content?.[0]?.text === '继续子代理',
    JSON.stringify(subagentFollowupCalls))
  check('子代理投递前先拉起父会话（父会话是顶层，走 agents.resume）',
    resumeCalls.length === beforeResume + 1 && String(resumeCalls[resumeCalls.length - 1].resumeSessionId) === 'cold-1',
    JSON.stringify(resumeCalls.map((c) => String(c.resumeSessionId))))
}

// ---- 打开失败仍给友好报错 ----
{
  phone.msgs.length = 0
  phone.ws.send(JSON.stringify({ type: 'send_message', sessionId: 'cold-404', text: 'hi' }))
  const err = await awaitMsg(phone.msgs, (m) => m.type === 'error' && m.code === 'not_running', '打开失败报错')
  check('打开失败仍回 not_running 且附原因', err?.message?.includes('自动打开失败') === true, err?.message)
}

// ---- 斜杠命令路由：已注册命令走 commands.execute（与 Web composer 同链），普通文本发模型 ----
{
  phone.msgs.length = 0
  const before = followupCalls.length
  phone.ws.send(JSON.stringify({ type: 'send_message', sessionId: 'session-1', text: '/compact' }))
  await new Promise((r) => setTimeout(r, 300))
  check('斜杠命令走 commands.execute（不发模型）',
    commandExecuteCalls.length === 1 && commandExecuteCalls[0].line === '/compact'
    && Array.isArray(commandExecuteCalls[0].images) && commandExecuteCalls[0].images.length === 0
    && commandExecuteCalls[0].signal !== undefined && followupCalls.length === before,
    JSON.stringify(commandExecuteCalls.map((c) => c.line)))

  phone.msgs.length = 0
  phone.ws.send(JSON.stringify({ type: 'send_message', sessionId: 'session-1', text: '/nope' }))
  const errRow = await awaitMsg(phone.msgs, (m) => m.type === 'event' && m.event?.type === 'command' && m.event.commandStatus === 'error', '未注册命令错误行')
  check('未注册命令 → 会话内错误行（不发模型）',
    errRow?.event?.commandName === 'nope' && errRow?.event?.commandOk === false
    && typeof errRow?.event?.text === 'string' && followupCalls.length === before,
    JSON.stringify(errRow?.event))

  phone.msgs.length = 0
  phone.ws.send(JSON.stringify({ type: 'send_message', sessionId: 'session-1', text: '普通文本消息' }))
  await new Promise((r) => setTimeout(r, 300))
  check('非斜杠文本原样发模型',
    followupCalls.length === before + 1 && followupCalls[followupCalls.length - 1].content?.[0]?.text === '普通文本消息',
    JSON.stringify(followupCalls[followupCalls.length - 1]?.content?.[0]?.text))
}

// ---- 斜杠命令投影：command/run → running 行；command/done → done 行（补命令名 + 结果）----
{
  phone.msgs.length = 0
  const evListenerCmd = listeners.get('session/event')
  if (evListenerCmd) {
    evListenerCmd(mockSession, { seq: 60, time: Date.now(), type: 'command/run', data: { commandId: 'cmd-proj-1', name: 'compact', args: '' } })
    const run = await awaitMsg(phone.msgs, (m) => m.type === 'event' && m.event?.type === 'command' && m.event.commandStatus === 'running', 'command/run 投影')
    check('command/run → running 行（命令名+参数）',
      run?.event?.commandId === 'cmd-proj-1' && run?.event?.commandName === 'compact' && run?.event?.commandArgs === '',
      JSON.stringify(run?.event))

    evListenerCmd(mockSession, { seq: 61, time: Date.now(), type: 'command/done', data: { commandId: 'cmd-proj-1', kind: 'success', text: 'Compacted 12 history items' } })
    const done = await awaitMsg(phone.msgs, (m) => m.type === 'event' && m.event?.type === 'command' && m.event.commandStatus === 'done', 'command/done 投影')
    check('command/done → done 行（补命令名 + 结果文本）',
      done?.event?.commandId === 'cmd-proj-1' && done?.event?.commandName === 'compact'
      && done?.event?.commandOk === true && done?.event?.text === 'Compacted 12 history items',
      JSON.stringify(done?.event))
  }
}

// ---- 排队消息：subscribe 带 queue + spliced 广播 + 插队/删除 ----
{
  phone.ws.send(JSON.stringify({ type: 'subscribe', sessionId: 'session-1' }))
  const hist = await awaitMsg(phone.msgs, (m) => m.type === 'history' && m.sessionId === 'session-1', 'session-1 历史含队列')
  check('subscribe 返回排队消息', Array.isArray(hist.queue) && hist.queue.length === 2 && hist.queue[0].placement === 'queued' && hist.queue[0].text === '排队的消息1', JSON.stringify(hist.queue))
  check('subscribe 带该会话 goal（活会话 GoalView）', hist.goal?.objective === '完成 LSP 与调试器集成' && hist.goal?.phase === 'active' && hist.goal?.maxGoalRounds === 8 && hist.goal?.roundsStarted === 1, JSON.stringify(hist.goal))
  check('subscribe 带该会话 todos（任务列表投影）', Array.isArray(hist.todos) && hist.todos.length === 2 && hist.todos[0].content === '写协议字段' && hist.todos[0].status === 'in_progress', JSON.stringify(hist.todos))
  // 斜杠命令清单（服务端注册表权威，客户端 "/" 候选弹窗数据源）
  check('subscribe 带斜杠命令清单（名称+说明+参数提示）',
    Array.isArray(hist.commands) && hist.commands.length === 2
    && hist.commands[0].name === 'compact' && hist.commands[0].description === 'Compact older conversation history'
    && hist.commands[1].name === 'plan' && hist.commands[1].input?.hint === 'off|message',
    JSON.stringify(hist.commands))
  // commands/change → commands_update 广播（重读清单推给手机）
  const changeListener = eventsListeners.get('commands/change')
  if (changeListener) {
    phone.msgs.length = 0
    changeListener()
    const cu = await awaitMsg(phone.msgs, (m) => m.type === 'commands_update' && m.sessionId === 'session-1', 'commands_update 广播')
    check('commands/change → commands_update 广播（重读命令清单）',
      Array.isArray(cu.commands) && cu.commands.length === 2 && cu.commands[0].name === 'compact',
      JSON.stringify(cu.commands))
  }
  // todo/write 事件 → todos_update 广播（会话级）
  phone.msgs.length = 0
  const evListenerTodo = listeners.get('session/event')
  if (evListenerTodo) {
    evListenerTodo(mockSession, { seq: 30, time: Date.now(), type: 'todo/write', data: { todos: [{ content: '写协议字段', status: 'in_progress' }, { content: '跑冒烟', status: 'pending' }] } })
    const tu = await awaitMsg(phone.msgs, (m) => m.type === 'todos_update' && m.sessionId === 'session-1', 'todos_update 广播')
    check('todo/write → todos_update 广播（重读投影）', Array.isArray(tu.todos) && tu.todos.length === 2, JSON.stringify(tu.todos))
  }
  const evListener2 = listeners.get('session/event')
  if (evListener2) {
    evListener2(mockSession, { seq: 9, time: Date.now(), type: 'agent/inbox/spliced', data: { target: 'next-turn', start: 0, removedCount: 0, inserted: [] } })
    const q = await awaitMsg(phone.msgs, (m) => m.type === 'session_queue' && m.sessionId === 'session-1', 'session_queue 广播')
    check('spliced → session_queue 广播', Array.isArray(q.items) && q.items.length === 2, JSON.stringify(q.items))
  }
  phone.ws.send(JSON.stringify({ type: 'queue_action', sessionId: 'session-1', itemId: 'm1', action: 'steer' }))
  await new Promise((r) => setTimeout(r, 300))
  check('插队：remove(m1) + steer(消息)', inboxRemoved.includes('m1') && inboxSteered.some((m) => m.id === 'm1'), JSON.stringify(inboxRemoved) + JSON.stringify(inboxSteered.map((m) => m.id)))
  phone.ws.send(JSON.stringify({ type: 'queue_action', sessionId: 'session-1', itemId: 'm2', action: 'remove' }))
  await new Promise((r) => setTimeout(r, 300))
  check('删除排队消息：remove(m2)', inboxRemoved.includes('m2'), JSON.stringify(inboxRemoved))
}

// ---- Goal：goal/change 落库 → goal_update 广播（会话级，延迟重读）----
{
  phone.msgs.length = 0
  const evListenerG = listeners.get('session/event')
  if (evListenerG) {
    evListenerG(mockSession, { seq: 12, time: Date.now(), type: 'goal/change', data: { kind: 'goal/change', operation: 'block', goal: { id: 'g1', revision: 2, objective: '完成 LSP 与调试器集成', phase: 'blocked', blockedReason: { code: 'blocked', message: '等待真机验收' }, maxGoalRounds: 8 }, roundsStarted: 1, createdAt: 900, updatedAt: 1200 } })
    const g = await awaitMsg(phone.msgs, (m) => m.type === 'goal_update' && m.sessionId === 'session-1', 'goal_update 广播')
    check('goal/change → goal_update 广播（重读该会话目标）', g.goal?.objective === '完成 LSP 与调试器集成' && g.goal?.phase === 'active' && g.goal?.roundsStarted === 1, JSON.stringify(g.goal))
  }
}

// ---- 回归：inbox splice 观察者滞后一拍（真实 inbox.mutate 先落库后改投影）----
// 入队广播必须含新消息；claim 广播必须不含已认领消息（否则手机端排队状态错位）。
{
  phone.msgs.length = 0
  const evListener3 = listeners.get('session/event')
  if (evListener3) {
    // 模拟真实 inbox.mutate：session.append 同步触发 session/event，随后才改投影
    evListener3(mockSession, { seq: 10, time: Date.now(), type: 'agent/inbox/spliced', data: { target: 'next-turn', start: 2, removedCount: 0, inserted: [{ id: 'm3', source: { kind: 'user' }, content: [{ type: 'text', text: '新排队3' }] }] } })
    inboxMessages.push({ id: 'm3', source: { kind: 'user' }, content: [{ type: 'text', text: '新排队3' }] })
    const q = await awaitMsg(phone.msgs, (m) => m.type === 'session_queue' && m.sessionId === 'session-1', '入队后广播(变更后)')
    check('入队广播含新消息（投影更新后）', q.items.some((it) => it.id === 'm3'), JSON.stringify(q.items))

    phone.msgs.length = 0
    evListener3(mockSession, { seq: 11, time: Date.now(), type: 'agent/inbox/spliced', data: { target: 'next-turn', start: 0, removedCount: 1, inserted: [] } })
    inboxMessages.shift()
    const q2 = await awaitMsg(phone.msgs, (m) => m.type === 'session_queue' && m.sessionId === 'session-1', 'claim 后广播(变更后)')
    check('claim 广播不含已认领消息', !q2.items.some((it) => it.id === 'm1') && q2.items.length === 2, JSON.stringify(q2.items))
  }
}

// ---- 回归：分页按"投影后的可见行"翻页（原始事件窗口会整页为空卡死）----
{
  phone.msgs.length = 0
  phone.ws.send(JSON.stringify({ type: 'history_page', sessionId: 'session-1', beforeSeq: 5, limit: 300 }))
  const p = await awaitMsg(phone.msgs, (m) => m.type === 'history' && m.sessionId === 'session-1', 'history_page(5)')
  const texts = p.events.map((e) => e.text)
  check('翻页跳过不可投影事件且同 seq 多行保留', p.events.length === 3 && texts.includes('第一句') && texts.includes('第一答') && texts.includes('思考中'), JSON.stringify(p.events))
  check('翻页到底 hasMore=false', p.hasMore === false && p.total === 5, `hasMore=${p.hasMore} total=${p.total}`)

  phone.msgs.length = 0
  phone.ws.send(JSON.stringify({ type: 'history_page', sessionId: 'session-1', beforeSeq: 1, limit: 300 }))
  const p2 = await awaitMsg(phone.msgs, (m) => m.type === 'history' && m.sessionId === 'session-1', 'history_page(1)')
  check('扫到最开头返回空页且 hasMore=false（不死循环）', p2.events.length === 0 && p2.hasMore === false, JSON.stringify(p2.events))
}

// ---- 会话列表增量：session/created → session_upsert ----
{
  const createdListener = listeners.get('session/created')
  if (createdListener) {
    createdListener({ id: 'session-new', header: { delegationDepth: 0, cwd: '/new', createdAt: Date.now() }, events: [] })
    const up = await awaitMsg(phone.msgs, (m) => m.type === 'session_upsert' && m.session?.id === 'session-new', 'session_upsert')
    check('新建会话推增量行', up?.session?.status === 'idle' && up?.session?.agentCount === 0 && up?.session?.name === 'new', JSON.stringify(up?.session))
  }
}

// ---- 历史分页（投影行窗口语义：旧→新顺序、按可见行截断、hasMore 随扫描截止）----
{
  phone.msgs.length = 0
  const mk = (seq, text) => ({ seq, time: 1000 + seq, type: 'user/message', data: { content: [{ type: 'text', text }] } })
  mockSession.events = [mk(1, '旧1'), mk(2, '旧2'), mk(3, '旧3'), mk(4, '旧4'), mk(5, '旧5')]
  phone.ws.send(JSON.stringify({ type: 'subscribe', sessionId: 'session-1' }))
  const hist = await awaitMsg(phone.msgs, (m) => m.type === 'history' && m.sessionId === 'session-1' && m.total === 5, 'session-1 尾部历史')
  check('subscribe 全量可投影：5 行、旧→新、hasMore=false', hist.total === 5 && hist.hasMore === false && hist.events.length === 5 && hist.events[0].seq === 1 && hist.events[4].seq === 5, JSON.stringify({ t: hist.total, m: hist.hasMore, n: hist.events.length, first: hist.events[0]?.seq, last: hist.events[4]?.seq }))
  phone.ws.send(JSON.stringify({ type: 'history_page', sessionId: 'session-1', beforeSeq: 3, limit: 300 }))
  const page = await awaitMsg(phone.msgs, (m) => m.type === 'history' && m.sessionId === 'session-1' && m.events.length === 2, 'history_page 翻页')
  check('history_page 返回 seq<3 的行、旧→新、到底 hasMore=false', page.events[0].seq === 1 && page.events[1].seq === 2 && page.hasMore === false, JSON.stringify(page.events.map((e) => e.seq)))
  // 大事件量：subscribe 只下发 300 行投影窗口，hasMore=true
  phone.msgs.length = 0
  mockSession.events = Array.from({ length: 350 }, (_, i) => mk(i + 1, `批量${i + 1}`))
  phone.ws.send(JSON.stringify({ type: 'subscribe', sessionId: 'session-1' }))
  const tail = await awaitMsg(phone.msgs, (m) => m.type === 'history' && m.sessionId === 'session-1' && m.total === 350, '350条尾部截断')
  check('超过300条只下发尾部300行（旧→新）', tail.events.length === 300 && tail.hasMore === true && tail.events[0].seq === 51 && tail.events[299].seq === 350, JSON.stringify({ n: tail.events.length, m: tail.hasMore, first: tail.events[0]?.seq, last: tail.events[299]?.seq }))
  phone.ws.send(JSON.stringify({ type: 'history_page', sessionId: 'session-1', beforeSeq: 51, limit: 300 }))
  const page2 = await awaitMsg(phone.msgs, (m) => m.type === 'history' && m.sessionId === 'session-1' && m.events.length === 50, '翻到最早50条')
  check('翻页翻到最早且 hasMore=false', page2.events[0].seq === 1 && page2.events[49].seq === 50 && page2.hasMore === false, JSON.stringify({ first: page2.events[0]?.seq, last: page2.events[49]?.seq, m: page2.hasMore }))
  mockSession.events = []
}

// ---- 思考流式：reasoning-delta 累积节流广播 think_delta，assistant/message 清除 ----
{
  phone.msgs.length = 0
  const evListener4 = listeners.get('session/event')
  if (evListener4) {
    evListener4(mockSession, { seq: 20, time: Date.now(), type: 'assistant/chunk', data: { chunk: { type: 'reasoning-delta', text: '正在' } } })
    evListener4(mockSession, { seq: 21, time: Date.now(), type: 'assistant/chunk', data: { chunk: { type: 'reasoning-delta', text: '思考' } } })
    evListener4(mockSession, { seq: 22, time: Date.now(), type: 'assistant/chunk', data: { chunk: { type: 'text-delta', text: 'x' } } })
    const d = await awaitMsg(phone.msgs, (m) => m.type === 'think_delta' && m.sessionId === 'session-1' && m.text !== '', 'think_delta 流式广播')
    check('reasoning-delta 累积 → think_delta 广播', d.text === '正在思考', JSON.stringify(d.text))
    evListener4(mockSession, { seq: 23, time: Date.now(), type: 'assistant/message', data: { message: { content: [{ type: 'reasoning', text: '正在思考' }, { type: 'text', text: '答' }] } } })
    const c = await awaitMsg(phone.msgs, (m) => m.type === 'think_delta' && m.sessionId === 'session-1' && m.text === '', 'think_delta 清除')
    check('assistant/message 后清除实时思考行', c.text === '', JSON.stringify(c.text))
  }
}

// ---- Deep Diving：turn/start 轮次起点 + llm/stream 起止 → 轮次累计 tick ----
{
  const streamListener = listeners.get('llm/stream')
  const evListenerTurn = listeners.get('session/event')
  if (streamListener && evListenerTurn) {
    phone.msgs.length = 0
    // 轮次开始：广播空 todos_update（清掉上一轮任务列表）+ turn_status open + 记录轮次起点
    const t0 = Date.now()
    evListenerTurn(mockSession, { seq: 40, time: t0, type: 'turn/start', data: {} })
    const cleared = await awaitMsg(phone.msgs, (m) => m.type === 'todos_update' && m.sessionId === 'session-1', 'turn/start 清空 todos')
    check('turn/start → 空 todos_update（清掉旧任务列表）', Array.isArray(cleared.todos) && cleared.todos.length === 0, JSON.stringify(cleared.todos))
    const turnOpen = await awaitMsg(phone.msgs, (m) => m.type === 'turn_status' && m.sessionId === 'session-1' && m.open === true, 'turn_status open')
    check('turn/start → turn_status open（整个轮次显示标签）', Math.abs(turnOpen.since - t0) < 1500, JSON.stringify(turnOpen))

    async function* fakeStream() { yield { type: 'chunk', text: 'a' } }
    const wrapped = streamListener({ sessionId: 'session-1', model: 'm' }, () => fakeStream())
    const w = await awaitMsg(phone.msgs, (m) => m.type === 'model_waiting' && m.sessionId === 'session-1', 'model_waiting 广播')
    check('模型请求开始广播 model_waiting', w.startedAt !== undefined, JSON.stringify(w))
    // 服务端计时：ticker 每秒广播 deep_diving_tick；since = 轮次起点（非本次请求起点），跨请求不归零
    const tick = await awaitMsg(phone.msgs, (m) => m.type === 'deep_diving_tick' && m.sessionId === 'session-1', 'deep_diving_tick 广播')
    check('tick 按轮次累计（since ≈ turn/start，elapsed ≥ 0）', tick.elapsedSeconds >= 0 && Math.abs(tick.since - t0) < 1500, JSON.stringify(tick))
    for await (const _ of wrapped) { /* 消费完触发 done */ }
    const d = await awaitMsg(phone.msgs, (m) => m.type === 'model_waiting_done' && m.sessionId === 'session-1', 'model_waiting_done 广播')
    check('模型请求完成广播 model_waiting_done', d.elapsedMs >= 0 && d.startedAt === w.startedAt, JSON.stringify(d))
    // 轮次结束 → turn_status closed（客户端收起 Deep diving 标签）
    phone.msgs.length = 0
    evListenerTurn(mockSession, { seq: 41, time: Date.now(), type: 'turn/end', data: {} })
    const turnClosed = await awaitMsg(phone.msgs, (m) => m.type === 'turn_status' && m.sessionId === 'session-1' && m.open === false, 'turn_status closed')
    check('turn/end → turn_status closed', turnClosed.open === false, JSON.stringify(turnClosed))
  }
}

// ---- 桌面端拉取手机日志：logs_request → upload_logs → /remote/phone-logs ----
{
  phone.ws.on('message', (d) => {
    const m = JSON.parse(d.toString())
    if (m.type === 'logs_request') {
      phone.ws.send(JSON.stringify({
        type: 'upload_logs',
        requestId: m.requestId,
        entries: [
          { ts: 1700000000000, level: 'I', tag: 'CONNECT', message: '手机端日志第1条' },
          { ts: 1700000001000, level: 'W', tag: 'RECONNECT', message: '手机端日志第2条' },
        ],
      }))
    }
  })
  const res = { status: 200, body: '', writeHead(s2, h) { this.status = s2 }, end(b) { this.body = b.toString() } }
  const req = { url: '/remote/phone-logs?wait=2000', headers: { host: '127.0.0.1' }, socket: { remoteAddress: '127.0.0.1' } }
  await routes.get('exact:/remote/phone-logs')(req, res)
  const j = JSON.parse(res.body)
  check('桌面端拉取手机日志', j.ok === true && j.count === 2 && j.entries[0].message === '手机端日志第1条' && j.entries[1].tag === 'RECONNECT', JSON.stringify(j))
}

// ---- 链路 A：bridge 持有的审批（approve 命令）----
const approvalListener = listeners.get('approval/request')
{
  const session = {
    id: 'session-1',
    events: [
      { type: 'approval/asked', data: { id: 'apr-1', toolName: 'bash', callId: 'call-1', reason: '需要越权执行' } },
      { type: 'tool/call', data: { callId: 'call-1', name: 'bash', arguments: JSON.stringify({ command: 'rm -rf /tmp/x' }) } },
    ],
  }
  const req = { agent: { id: 'session-1', session }, toolName: 'bash', callId: 'call-1', reason: '需要越权执行', signal: new AbortController().signal }
  const p = approvalListener(req, async () => 'unavailable')
  const wire = await awaitMsg(phone.msgs, (m) => m.type === 'approval_request', 'bridge 审批广播')
  check('审批透传 reason/callId/command', wire.approval.reason === '需要越权执行' && wire.approval.callId === 'call-1' && wire.approval.command === 'rm -rf /tmp/x' && wire.approval.rpcId === undefined, JSON.stringify(wire.approval))
  phone.ws.send(JSON.stringify({ type: 'approve', approvalId: 'apr-1', decision: 'allowed-once' }))
  const outcome = await Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('approve timeout')), 3000))])
  check('approve 裁决回传', outcome === 'allowed-once', String(outcome))
  await awaitMsg(phone.msgs, (m) => m.type === 'approval_resolved' && m.approvalId === 'apr-1', 'approval_resolved')
  check('approval_resolved 广播', true)
}

// ---- 链路 B：桌面持有的审批（mux 转发 + answer_approval）----
{
  const rpcId = 'rpc-apr-2'
  muxWss.clients.forEach((ws) => ws.send(JSON.stringify({
    rpcId,
    payload: { type: 'approval/requested', sessionId: 'session-1', approvalId: 'apr-2', toolName: 'file', reason: '桌面持有审批' },
  })))
  const wire = await awaitMsg(phone.msgs, (m) => m.type === 'approval_request' && m.approval?.approvalId === 'apr-2', 'mux 审批广播')
  check('mux 审批带 rpcId', wire.approval.rpcId === rpcId, JSON.stringify(wire.approval))
  phone.ws.send(JSON.stringify({ type: 'answer_approval', rpcId, sessionId: 'session-1', approvalId: 'apr-2', decision: 'rejected' }))
  await awaitMsg(phone.msgs, (m) => m.type === 'approval_resolved' && m.approvalId === 'apr-2', 'mux approval_resolved')
  const resp = fakeResponds.find((r) => r?.rpcId === rpcId)
  check('/api/respond 收到裁决（含 type 字段）', resp?.type === 'client-response' && resp?.result?.value?.outcome === 'rejected' && resp?.result?.value?.approvalId === 'apr-2', JSON.stringify(resp))
}

// ---- 链路 C：桌面持有的提问（mux 转发 + answer_question）----
{
  const rpcId = 'rpc-q-1'
  muxWss.clients.forEach((ws) => ws.send(JSON.stringify({
    rpcId,
    payload: {
      type: 'question/requested',
      sessionId: 'session-1',
      questions: [{ id: 'q1', question: '是否继续？', header: '确认', options: [{ label: '继续', description: '继续执行' }] }],
    },
  })))
  const wire = await awaitMsg(phone.msgs, (m) => m.type === 'question_request' && m.question?.rpcId === rpcId, 'question_request 广播')
  check('提问透传 question/options', wire.question.questions[0].question === '是否继续？' && wire.question.questions[0].options[0].label === '继续', JSON.stringify(wire.question))
  phone.ws.send(JSON.stringify({ type: 'answer_question', rpcId, sessionId: 'session-1', answers: [{ id: 'q1', selected: ['继续'], custom: null }] }))
  await awaitMsg(phone.msgs, (m) => m.type === 'question_resolved' && m.rpcId === rpcId, 'question_resolved')
  const resp = fakeResponds.find((r) => r?.rpcId === rpcId)
  check('/api/respond 收到答案（custom:null 已剥离）', resp?.type === 'client-response' && resp?.result?.value?.answer?.answers?.[0]?.selected?.[0] === '继续' && resp?.result?.value?.answer?.answers?.[0]?.custom === undefined, JSON.stringify(resp))
}

// ---- 调试端点：本会话内发起审批 ----
{
  const res = { status: 200, body: '', writeHead(s, h) { this.status = s }, end(b) { this.body = b.toString() } }
  const req = { url: '/remote/debug/approval-test', method: 'POST', headers: { host: '127.0.0.1' }, socket: { remoteAddress: '127.0.0.1' }, [Symbol.asyncIterator]: async function* () { yield JSON.stringify({ sessionId: 'session-1', reason: '自测审批' }) } }
  await routes.get('exact:/remote/debug/approval-test')(req, res)
  const j = JSON.parse(res.body)
  check('调试端点返回 allowed-once', j.ok === true && j.outcome === 'allowed-once', JSON.stringify(j))
  check('调试端点先切 ask 策略', sessionAppendLog.some((e) => e.type === 'approval/policy' && e.data.policy === 'ask'), JSON.stringify(sessionAppendLog))
  check('approval.request 被调用', approvalRequestCalls.length === 1 && approvalRequestCalls[0].reason === '自测审批')
}

// ---- 持久化工作状态：/remote/work PUT→GET 回环 + health/hello 携带 ----
{
  const put = { status: 200, body: '', writeHead(s, h) { this.status = s }, end(b) { this.body = b.toString() } }
  const putReq = { url: '/remote/work', method: 'PUT', headers: { host: '127.0.0.1' }, socket: { remoteAddress: '127.0.0.1' }, [Symbol.asyncIterator]: async function* () { yield JSON.stringify({ activity: 'LSP 自测中', pending: ['重启后自测诊断条', 'Debugger 集成'], notes: ['重启自动续跑 + 重启通知'] }) } }
  await routes.get('exact:/remote/work')(putReq, put)
  check('PUT /remote/work 写入工作状态', put.status === 200 && JSON.parse(put.body).activity === 'LSP 自测中' && JSON.parse(put.body).pending.length === 2, put.body)
  const get = { status: 200, body: '', writeHead(s, h) { this.status = s }, end(b) { this.body = b.toString() } }
  const getReq = { url: '/remote/work', method: 'GET', headers: { host: '127.0.0.1' }, socket: { remoteAddress: '127.0.0.1' }, [Symbol.asyncIterator]: async function* () {} }
  await routes.get('exact:/remote/work')(getReq, get)
  check('GET /remote/work 回读（activity + pending）', JSON.parse(get.body).activity === 'LSP 自测中' && JSON.parse(get.body).pending[1] === 'Debugger 集成', get.body)
  const hres = { status: 200, body: '', writeHead(s, h) { this.status = s }, end(b) { this.body = b.toString() } }
  await routes.get('exact:/remote/health')({ url: '/remote/health', headers: {}, socket: { remoteAddress: '127.0.0.1' } }, hres)
  const h2 = JSON.parse(hres.body)
  check('health 携带 work 摘要', h2.work !== undefined && h2.work.activity === 'LSP 自测中' && h2.work.pending === 2, JSON.stringify(h2.work))
  // 清理测试写入的工作状态
  const clr = { status: 200, body: '', writeHead(s, h) { this.status = s }, end(b) { this.body = b.toString() } }
  await routes.get('exact:/remote/work')({ url: '/remote/work', method: 'PUT', headers: { host: '127.0.0.1' }, socket: { remoteAddress: '127.0.0.1' }, [Symbol.asyncIterator]: async function* () { yield JSON.stringify({ activity: null, pending: [], notes: [] }) } }, clr)
}

// ---- 重启通知：重连客户端收到 server_boot（版本 + notes）----
{
  const phone3 = await openPhone()
  const boot = await awaitMsg(phone3.msgs, (m) => m.type === 'server_boot', 'server_boot 推送')
  check('重连客户端收到 server_boot（版本 + notes）', boot.version === '0.12.0' && Array.isArray(boot.notes), JSON.stringify(boot))
  phone3.ws.close()
}

// ---- LSP：mock language server → notifyFileChanged → 诊断回调 ----
{
  const { LspManager } = await import(new URL('../lib/lsp.js', import.meta.url).href)
  const fs = await import('node:fs')
  fs.writeFileSync(`${TMP}/mock-lsp.mjs`, `
import { Buffer } from 'node:buffer'
let buf = Buffer.alloc(0)
function tryParse() {
  const i = buf.indexOf('\\r\\n\\r\\n')
  if (i < 0) return
  const m = /Content-Length:\\s*(\\d+)/i.exec(buf.subarray(0, i).toString('ascii'))
  if (!m) return
  const len = Number(m[1])
  if (buf.length < i + 4 + len) return
  const payload = JSON.parse(buf.subarray(i + 4, i + 4 + len).toString('utf8'))
  buf = buf.subarray(i + 4 + len)
  handle(payload)
}
function send(obj) {
  const s = JSON.stringify(obj)
  process.stdout.write('Content-Length: ' + Buffer.byteLength(s) + '\\r\\n\\r\\n' + s)
}
function handle(msg) {
  if (msg.method === 'initialize') {
    send({ jsonrpc: '2.0', id: msg.id, result: { capabilities: { textDocumentSync: 1 } } })
  } else if (msg.method === 'textDocument/didOpen' || msg.method === 'textDocument/didChange') {
    send({ jsonrpc: '2.0', method: 'textDocument/publishDiagnostics', params: {
      uri: msg.params.textDocument.uri,
      diagnostics: [
        { range: { start: { line: 2, character: 4 }, end: { line: 2, character: 12 } }, severity: 1, message: '类型不匹配：number 不能赋给 string', source: 'mock-lsp' },
        { range: { start: { line: 7, character: 0 }, end: { line: 7, character: 5 } }, severity: 2, message: '未使用的变量', source: 'mock-lsp' },
      ],
    } })
  }
}
process.stdin.on('data', (c) => { buf = Buffer.concat([buf, c]); tryParse() })
`)
  fs.writeFileSync(`${TMP}/lsp-test-example.ts`, 'const x: number = 1\n')
  const got = []
  const mgr = new LspManager({
    onDiagnostics: (path, sessionId, diags) => { got.push({ path, sessionId, diags }) },
    cmdOverride: { typescript: ['node', `${TMP}/mock-lsp.mjs`] },
    log: () => {},
  })
  check('LSP 可用语言检测（mock 覆盖）', mgr.availableLangs().includes('typescript'), JSON.stringify(mgr.availableLangs()))
  mgr.notifyFileChanged(`${TMP}/lsp-test-example.ts`, 'session-1')
  mgr.flush(`${TMP}/lsp-test-example.ts`)
  await new Promise((r) => setTimeout(r, 900))
  const last = got[got.length - 1]
  check('LSP 诊断回调（2 条、1-based 行列、severity）',
    last?.path === `${TMP}/lsp-test-example.ts` && last.diags.length === 2 &&
    last.diags[0].line === 3 && last.diags[0].column === 5 && last.diags[0].severity === 1 &&
    last.diags[0].message.includes('类型不匹配') && last.diags[1].severity === 2,
    JSON.stringify(last?.diags))
  check('LSP 诊断带会话隔离 id（session-1 回传）', last?.sessionId === 'session-1', JSON.stringify(last?.sessionId))

  // Kotlin：.kt 扩展 → kotlin-language-server 通道（mock 覆盖，不依赖本机二进制）
  fs.writeFileSync(`${TMP}/lsp-test-example.kt`, 'val x: Int = 1\n')
  const mgrKt = new LspManager({
    onDiagnostics: (path, sessionId, diags) => { got.push({ path, sessionId, diags }) },
    cmdOverride: { kotlin: ['node', `${TMP}/mock-lsp.mjs`] },
    log: () => {},
  })
  mgrKt.notifyFileChanged(`${TMP}/lsp-test-example.kt`, 'session-1')
  mgrKt.flush(`${TMP}/lsp-test-example.kt`)
  await new Promise((r) => setTimeout(r, 1500))
  const lastKt = got[got.length - 1]
  check('Kotlin .kt 走 kotlin-language-server 通道（mock）',
    lastKt?.path === `${TMP}/lsp-test-example.kt` && lastKt.diags.length === 2 && lastKt.sessionId === 'session-1',
    JSON.stringify(lastKt))
  mgr.dispose()
}

// ---- LSP 诊断反馈闭环（LspFeedback 决策逻辑 + 逃生门 + 跨文件回退 + Kotlin pull 覆盖）----
{
  const { LspFeedback, lspFeedbackEnabledFromEnv } = await import(new URL('../lib/lsp-feedback.js', import.meta.url).href)

  // 逃生门判定（默认开启；0/false 关闭；1/true 开启）
  check('DSH_REMOTE_LSP_FEEDBACK 默认开启', lspFeedbackEnabledFromEnv({}) === true)
  check('DSH_REMOTE_LSP_FEEDBACK=0 关闭', lspFeedbackEnabledFromEnv({ DSH_REMOTE_LSP_FEEDBACK: '0' }) === false)
  check('DSH_REMOTE_LSP_FEEDBACK=false/FALSE 关闭', lspFeedbackEnabledFromEnv({ DSH_REMOTE_LSP_FEEDBACK: 'false' }) === false && lspFeedbackEnabledFromEnv({ DSH_REMOTE_LSP_FEEDBACK: 'FALSE' }) === false)
  check('DSH_REMOTE_LSP_FEEDBACK=1/true 开启', lspFeedbackEnabledFromEnv({ DSH_REMOTE_LSP_FEEDBACK: '1' }) === true && lspFeedbackEnabledFromEnv({ DSH_REMOTE_LSP_FEEDBACK: 'true' }) === true)

  const mkErr = (path, line, message) => ({ path, line, column: 1, severity: 1, message })
  const mkWarn = (path, line) => ({ path, line, column: 1, severity: 2, message: '未使用的变量' })

  // 1) 运行中会话：error 注入一次、含错误文本、warning 不注入；同批去重
  {
    const injected = []
    const fb = new LspFeedback({ enabled: true, inject: (sid, text) => injected.push({ sid, text }), log: () => {} })
    fb.handle('/a.ts', 'session-1', [mkErr('/a.ts', 3, '类型不匹配：number 不能赋给 string'), mkWarn('/a.ts', 7)])
    fb.flush('session-1')
    check('LSP 反馈：error 注入一次且含错误文本（运行中会话）',
      injected.length === 1 && injected[0].sid === 'session-1' && injected[0].text.includes('类型不匹配'),
      JSON.stringify(injected.map((i) => i.text.slice(0, 50))))
    check('LSP 反馈：warning 不注入（不含未使用变量）', !injected[0].text.includes('未使用的变量'), injected[0].text)

    fb.handle('/a.ts', 'session-1', [mkErr('/a.ts', 3, '类型不匹配：number 不能赋给 string')])
    fb.flush('session-1')
    check('LSP 反馈：同批去重（第二次同诊断不注入）', injected.length === 1, `n=${injected.length}`)
    fb.dispose()
  }

  // 2) 进展语义 + 每轮注入上限 + 清零静默
  {
    const injected = []
    const fb = new LspFeedback({ enabled: true, inject: (_sid, text) => injected.push(text), log: () => {} })
    fb.handle('/a.ts', 'session-1', [mkErr('/a.ts', 1, 'e1'), mkErr('/a.ts', 2, 'e2'), mkErr('/a.ts', 3, 'e3')])
    fb.flush('session-1')
    fb.handle('/a.ts', 'session-1', [mkErr('/a.ts', 3, 'e3')])
    fb.flush('session-1')
    check('LSP 反馈：第二次注入带进展（已消除 2 个，剩余 1 个）',
      injected.length === 2 && injected[1].includes('已消除 2 个') && injected[1].includes('剩余 1 个'), injected[1])

    fb.handle('/a.ts', 'session-1', [mkErr('/a.ts', 1, 'e1'), mkErr('/a.ts', 2, 'e2')])
    fb.flush('session-1')
    const afterCap = injected.length
    fb.handle('/a.ts', 'session-1', [mkErr('/a.ts', 4, 'e4')])
    fb.flush('session-1')
    check('LSP 反馈：每轮注入上限 3 次（防死循环）', afterCap === 3 && injected.length === 3, `afterCap=${afterCap} total=${injected.length}`)

    // 清零静默：错误全部消除 → onCleared 回调，不再注入
    const cleared = []
    let fb2Injections = 0
    const fb2 = new LspFeedback({ enabled: true, inject: () => { fb2Injections += 1 }, onCleared: (sid) => cleared.push(sid), log: () => {} })
    fb2.handle('/a.ts', 'session-1', [mkErr('/a.ts', 1, 'e1')])
    fb2.flush('session-1')
    fb2.handle('/a.ts', 'session-1', [])
    fb2.flush('session-1')
    check('LSP 反馈：错误清零 → 静默（onCleared 回调，不注入）',
      cleared.length === 1 && cleared[0] === 'session-1' && fb2Injections === 1,
      JSON.stringify({ cleared, injections: fb2Injections }))
    fb.dispose()
    fb2.dispose()
  }

  // 3) 逃生门关闭：零注入
  {
    const injected = []
    const fb = new LspFeedback({ enabled: false, inject: (_s, t) => injected.push(t), log: () => {} })
    fb.handle('/a.ts', 'session-1', [mkErr('/a.ts', 1, 'e1')])
    fb.flush('session-1')
    check('DSH_REMOTE_LSP_FEEDBACK=0 关闭时零注入', injected.length === 0, `n=${injected.length}`)
    fb.dispose()
  }
}

// ---- LSP 跨文件诊断：sessionId 回退归属（改 A 导致 B 报错，广播不再带空 sessionId）----
{
  const { LspManager } = await import(new URL('../lib/lsp.js', import.meta.url).href)
  const fs = await import('node:fs')
  fs.writeFileSync(`${TMP}/file-a.ts`, 'export const a = 1\n')
  fs.writeFileSync(`${TMP}/file-b.ts`, 'import { missing } from "./file-a"\n')
  fs.writeFileSync(`${TMP}/mock-lsp-cross.mjs`, `
import { Buffer } from 'node:buffer'
let buf = Buffer.alloc(0)
function tryParse() {
  const i = buf.indexOf('\\r\\n\\r\\n')
  if (i < 0) return
  const m = /Content-Length:\\s*(\\d+)/i.exec(buf.subarray(0, i).toString('ascii'))
  if (!m) return
  const len = Number(m[1])
  if (buf.length < i + 4 + len) return
  const payload = JSON.parse(buf.subarray(i + 4, i + 4 + len).toString('utf8'))
  buf = buf.subarray(i + 4 + len)
  handle(payload)
}
function send(obj) {
  const s = JSON.stringify(obj)
  process.stdout.write('Content-Length: ' + Buffer.byteLength(s) + '\\r\\n\\r\\n' + s)
}
function handle(msg) {
  if (msg.method === 'initialize') {
    send({ jsonrpc: '2.0', id: msg.id, result: { capabilities: { textDocumentSync: 1 } } })
  } else if (msg.method === 'textDocument/didOpen' || msg.method === 'textDocument/didChange') {
    // 跨文件：编辑 file-a 时，tsserver 推送受影响文件 file-b 的诊断（uri 不在 docSessions）
    const crossUri = msg.params.textDocument.uri.replace('file-a.ts', 'file-b.ts')
    send({ jsonrpc: '2.0', method: 'textDocument/publishDiagnostics', params: {
      uri: crossUri,
      diagnostics: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, severity: 1, message: '跨文件引用错误：file-b 引用了 file-a 不存在的符号', source: 'mock-cross' }],
    } })
  }
}
process.stdin.on('data', (c) => { buf = Buffer.concat([buf, c]); tryParse() })
`)
  const got = []
  const mgr = new LspManager({
    onDiagnostics: (path, sessionId, diags) => { got.push({ path, sessionId, diags }) },
    cmdOverride: { typescript: ['node', `${TMP}/mock-lsp-cross.mjs`] },
    log: () => {},
  })
  mgr.notifyFileChanged(`${TMP}/file-a.ts`, 'session-1')
  await new Promise((r) => setTimeout(r, 900))
  const cross = got.find((g) => g.path.endsWith('file-b.ts'))
  check('跨文件诊断 sessionId 回退归属（广播不再带空 sessionId）',
    cross !== undefined && cross.sessionId === 'session-1' && cross.diags.length === 1 && cross.diags[0].message.includes('跨文件引用错误'),
    JSON.stringify(cross))
  mgr.dispose()
}

// ---- Kotlin pull：编辑后除被编辑文件外，拉取该 server 已打开的其余文档（跨文件覆盖）----
{
  const { LspManager } = await import(new URL('../lib/lsp.js', import.meta.url).href)
  const fs = await import('node:fs')
  fs.writeFileSync(`${TMP}/file-a.kt`, 'val a = 1\n')
  fs.writeFileSync(`${TMP}/file-b.kt`, 'val b = a\n')
  fs.writeFileSync(`${TMP}/mock-kotlin-pull.mjs`, `
import { Buffer } from 'node:buffer'
let buf = Buffer.alloc(0)
function tryParse() {
  for (;;) {
    const i = buf.indexOf('\\r\\n\\r\\n')
    if (i < 0) return
    const m = /Content-Length:\\s*(\\d+)/i.exec(buf.subarray(0, i).toString('ascii'))
    if (!m) return
    const len = Number(m[1])
    if (buf.length < i + 4 + len) return
    const payload = JSON.parse(buf.subarray(i + 4, i + 4 + len).toString('utf8'))
    buf = buf.subarray(i + 4 + len)
    handle(payload)
  }
}
function send(obj) {
  const s = JSON.stringify(obj)
  process.stdout.write('Content-Length: ' + Buffer.byteLength(s) + '\\r\\n\\r\\n' + s)
}
function handle(msg) {
  if (msg.method === 'initialize') {
    send({ jsonrpc: '2.0', id: msg.id, result: { capabilities: { textDocumentSync: 1 } } })
  } else if (msg.method === 'textDocument/diagnostic') {
    // pull 模式：回应 textDocument/diagnostic 请求（非空 items 避免空结果重试）
    send({ jsonrpc: '2.0', id: msg.id, result: { items: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, severity: 1, message: 'pulled', source: 'mock-pull' }] } })
  }
}
process.stdin.on('data', (c) => { buf = Buffer.concat([buf, c]); tryParse() })
`)
  const pulled = []
  const mgr = new LspManager({
    onDiagnostics: (path) => { pulled.push(path) },
    cmdOverride: { kotlin: ['node', `${TMP}/mock-kotlin-pull.mjs`] },
    log: () => {},
  })
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  mgr.notifyFileChanged(`${TMP}/file-a.kt`, 'session-1')
  await sleep(1500)
  mgr.notifyFileChanged(`${TMP}/file-b.kt`, 'session-1')
  await sleep(1500)
  // 重新编辑 A（内容变化）→ 应同时 pull A 与 B（跨文件覆盖）
  fs.writeFileSync(`${TMP}/file-a.kt`, 'val a = 2\n')
  const before = pulled.length
  mgr.notifyFileChanged(`${TMP}/file-a.kt`, 'session-1')
  await sleep(1500)
  const afterPulls = pulled.slice(before)
  check('Kotlin pull 覆盖已打开文档（重编辑 A 后 A+B 都被拉取）',
    afterPulls.some((p) => p.endsWith('file-a.kt')) && afterPulls.some((p) => p.endsWith('file-b.kt')),
    JSON.stringify(afterPulls.map((p) => p.split('/').pop())))
  mgr.dispose()
}

// ---- Kotlin 项目根定位 + spawn 环境纯函数（修复 kotlin LSP 诊断失效）----
{
  const { kotlinProjectRoot, kotlinSpawnEnv, KOTLIN_STRIP_PROXY_VARS } = await import(new URL('../lib/lsp.js', import.meta.url).href)
  const fs = await import('node:fs')
  const os = await import('node:os')
  const path = await import('node:path')

  // 造嵌套工程：仓库根含 settings.gradle.kts + build.gradle.kts，模块目录只含 build.gradle.kts
  const projRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-kotlin-root-'))
  const composeAppSrc = path.join(projRoot, 'composeApp', 'src', 'main', 'kotlin')
  fs.mkdirSync(composeAppSrc, { recursive: true })
  fs.writeFileSync(path.join(projRoot, 'settings.gradle.kts'), 'rootProject.name = "x"\n')
  fs.writeFileSync(path.join(projRoot, 'build.gradle.kts'), 'plugins { kotlin("jvm") apply false }\n')
  fs.writeFileSync(path.join(projRoot, 'composeApp', 'build.gradle.kts'), 'plugins { kotlin("jvm") }\n')
  const kt = path.join(composeAppSrc, 'App.kt')
  fs.writeFileSync(kt, 'val x = 1\n')
  check('Kotlin 根定位：模块深处 .kt → 含 settings 的仓库根（非模块目录）',
    kotlinProjectRoot(kt) === projRoot && kotlinProjectRoot(kt) !== path.join(projRoot, 'composeApp'),
    JSON.stringify({ got: kotlinProjectRoot(kt), want: projRoot }))

  // 无 settings：取最上层含任一标记的目录
  const noSettings = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-kotlin-nosettings-'))
  fs.mkdirSync(path.join(noSettings, 'a', 'b'), { recursive: true })
  fs.writeFileSync(path.join(noSettings, 'build.gradle'), '')
  fs.writeFileSync(path.join(noSettings, 'a', 'build.gradle.kts'), '')
  const kt2 = path.join(noSettings, 'a', 'b', 'x.kt')
  fs.writeFileSync(kt2, 'val y = 2\n')
  check('Kotlin 根定位：无 settings 时取最上层含标记目录', kotlinProjectRoot(kt2) === noSettings, kotlinProjectRoot(kt2))

  // 都没有标记：退回文件所在目录
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-kotlin-bare-'))
  fs.mkdirSync(path.join(bare, 'sub'), { recursive: true })
  const kt3 = path.join(bare, 'sub', 'z.kt')
  fs.writeFileSync(kt3, 'val z = 3\n')
  check('Kotlin 根定位：无任何标记退回文件目录', kotlinProjectRoot(kt3) === path.join(bare, 'sub'), kotlinProjectRoot(kt3))

  // spawn 环境：剥离代理、注入 GRADLE_USER_HOME/JAVA_HOME、不覆盖已有值
  const env = kotlinSpawnEnv(
    { PATH: '/usr/bin', http_proxy: 'http://x:8080', HTTPS_PROXY: 'http://y:8080', JAVA_HOME: '', GRADLE_USER_HOME: '' },
    { gradleUserHome: '/Users/t/.gradle', javaHome: '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home' },
  )
  check('kotlinSpawnEnv 剥离代理变量', env.http_proxy === undefined && env.HTTPS_PROXY === undefined && env.https_proxy === undefined && env.all_proxy === undefined, JSON.stringify(env))
  check('kotlinSpawnEnv 注入 GRADLE_USER_HOME 与 JAVA_HOME', env.GRADLE_USER_HOME === '/Users/t/.gradle' && env.JAVA_HOME === '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home', JSON.stringify({ g: env.GRADLE_USER_HOME, j: env.JAVA_HOME }))
  const env2 = kotlinSpawnEnv({ JAVA_HOME: '/keep/me', GRADLE_USER_HOME: '/keep/g' }, { gradleUserHome: '/x', javaHome: '/y' })
  check('kotlinSpawnEnv 不覆盖已有 JAVA_HOME/GRADLE_USER_HOME', env2.JAVA_HOME === '/keep/me' && env2.GRADLE_USER_HOME === '/keep/g', JSON.stringify(env2))
  check('KOTLIN_STRIP_PROXY_VARS 含 http_proxy/https_proxy', KOTLIN_STRIP_PROXY_VARS.includes('http_proxy') && KOTLIN_STRIP_PROXY_VARS.includes('https_proxy'), JSON.stringify(KOTLIN_STRIP_PROXY_VARS))
}

// ---- Debug：真实 Node Inspector 子进程 —— REST 启动 → 断点命中 → 调用栈/变量 → 单步 → 恢复 → 退出 ----
{
  const fs = await import('node:fs')
  fs.writeFileSync(`${TMP}/bridge_smoke_debug.mjs`, [
    'let counter = 0',
    'for (let i = 1; i <= 2; i++) {',
    '  counter += i', // line 4（1-based）断点
    '  console.log("loop", counter)',
    '}',
    'console.log("done", counter)',
  ].join('\n') + '\n')

  const postJson = async (pathname, bodyObj) => {
    const res = { status: 200, body: '', writeHead(s, h) { this.status = s }, end(b) { this.body = b.toString() } }
    const bodyStr = JSON.stringify(bodyObj)
    const req = {
      url: pathname,
      method: 'POST',
      headers: { host: '127.0.0.1' },
      socket: { remoteAddress: '127.0.0.1' },
      async *[Symbol.asyncIterator]() { yield bodyStr },
    }
    await routes.get(`exact:${pathname}`)(req, res)
    return JSON.parse(res.body)
  }

  phone.msgs.length = 0
  const start = await postJson('/remote/debug/start', {
    sessionId: 'session-1',
    program: `${TMP}/bridge_smoke_debug.mjs`,
    breakpoints: [{ path: `${TMP}/bridge_smoke_debug.mjs`, line: 4 }],
  })
  check('debug/start 返回 ok 与初始快照', start.ok === true && start.debug?.state === 'starting', JSON.stringify(start))

  const paused = await awaitMsg(phone.msgs, (m) => m.type === 'debug_state' && m.sessionId === 'session-1' && m.debug?.state === 'paused', 'debug 断点命中', 200)
  const top = paused.debug?.paused?.frames?.[0]
  check('断点命中：调用栈帧 + 行号（1-based）+ 作用域', top?.line === 4 && top?.path.endsWith('bridge_smoke_debug.mjs') && (top?.scopes?.length ?? 0) > 0, JSON.stringify(paused.debug?.paused))

  phone.msgs.length = 0
  // ESM 顶层 let 在 module 作用域（非 local）；断言 counter 可见
  const localScope = top.scopes.find((s) => s.name === '模块') ?? top.scopes.find((s) => s.name === '局部变量') ?? top.scopes[0]
  phone.ws.send(JSON.stringify({ type: 'debug_command', sessionId: 'session-1', action: 'variables', variablesReference: localScope.variablesReference }))
  const vars = await awaitMsg(phone.msgs, (m) => m.type === 'debug_variables' && m.sessionId === 'session-1' && m.variablesReference === localScope.variablesReference, 'debug_variables 回包', 100)
  check('暂停现场变量（模块作用域可见 counter）', vars.variables.some((v) => v.name === 'counter'), JSON.stringify(vars.variables?.map((v) => v.name)))

  phone.msgs.length = 0
  phone.ws.send(JSON.stringify({ type: 'debug_command', sessionId: 'session-1', action: 'step' }))
  const stepped = await awaitMsg(phone.msgs, (m) => m.type === 'debug_state' && m.sessionId === 'session-1' && m.debug?.state === 'paused' && m.debug?.paused?.stoppedAt?.line === 2, '单步到循环头', 150)
  check('单步：循环体末句 → 循环头（CDP stepOver 语义，line 2）', stepped.debug?.paused?.stoppedAt?.line === 2, JSON.stringify(stepped.debug?.paused?.stoppedAt))

  // 恢复 → 断点第 2 轮命中（line 4）→ 再恢复 → 进程退出 stopped
  phone.msgs.length = 0
  phone.ws.send(JSON.stringify({ type: 'debug_command', sessionId: 'session-1', action: 'resume' }))
  const secondHit = await awaitMsg(phone.msgs, (m) => m.type === 'debug_state' && m.sessionId === 'session-1' && m.debug?.state === 'paused' && m.debug?.paused?.stoppedAt?.line === 4, '断点第二轮命中', 150)
  check('断点第二轮命中（i=2）', secondHit.debug?.paused?.stoppedAt?.line === 4, JSON.stringify(secondHit.debug?.paused?.stoppedAt))

  phone.msgs.length = 0
  phone.ws.send(JSON.stringify({ type: 'debug_command', sessionId: 'session-1', action: 'resume' }))
  const stopped = await awaitMsg(phone.msgs, (m) => m.type === 'debug_state' && m.sessionId === 'session-1' && m.debug?.state === 'stopped', '进程退出 → stopped', 200)
  check('恢复后跑完 → stopped', stopped.debug?.state === 'stopped', JSON.stringify(stopped.debug?.state))
  const outs = phone.msgs.filter((m) => m.type === 'debug_output' && m.sessionId === 'session-1')
  // 中间步骤清过缓冲：最后一轮缓冲含 loop 3 / done 3，各一行（双通道去重验证）
  check('console 输出流（loop 3/done 3 可见、无双行）', outs.filter((m) => m.line.includes('loop 3')).length === 1 && outs.filter((m) => m.line.includes('done 3')).length === 1, JSON.stringify(outs.map((m) => m.line)))
}

phone.ws.close()
httpServer.close()
muxWss.close()
const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length > 0 ? 1 : 0)
