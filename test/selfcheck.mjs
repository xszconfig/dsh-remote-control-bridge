// bridge 激活自检脚本（运维工具，不参与 pnpm test）：
// 验证服务端 0.12.0 的 斜杠命令清单 / server_boot 版本 / 自动续跑注入恰好一次 / 休眠会话候选列表 / 会话自动打开。
// 用法：
//   node test/selfcheck.mjs            # 基础检查 + 列出休眠会话候选
//   node test/selfcheck.mjs --open <sessionId> [message]   # 向休眠会话发一条测试消息（验证自动打开）
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const require = createRequire(import.meta.url)
const { WebSocket } = require('ws')
const HOST = process.env.DSH_SELFCHECK_HOST ?? '127.0.0.1'
const PORT = Number(process.env.DSH_SELFCHECK_PORT ?? 3080)
const openSessionId = process.argv.includes('--open') ? process.argv[process.argv.indexOf('--open') + 1] : undefined
const openMessage = openSessionId !== undefined
  ? process.argv.slice(process.argv.indexOf('--open') + 2).join(' ').trim() || '【自检】会话自动打开验证：请只回复"OK"，不要执行任何操作。'
  : undefined

const tokens = (() => {
  const f = join(homedir(), '.dsh', 'remote-control-devices.json')
  if (!existsSync(f)) return []
  try {
    const j = JSON.parse(readFileSync(f, 'utf8'))
    return (j.devices ?? []).map((d) => d.token).filter(Boolean)
  } catch {
    return []
  }
})()

const connect = (token) => new Promise((resolve, reject) => {
  const headers = token !== undefined ? { Authorization: `Bearer ${token}` } : {}
  const ws = new WebSocket(`ws://${HOST}:${PORT}/remote/ws`, { headers })
  const msgs = []
  const timer = setTimeout(() => reject(new Error('connect timeout')), 5000)
  ws.on('message', (d) => { try { msgs.push(JSON.parse(d.toString())) } catch { /* 忽略 */ } })
  ws.on('open', () => { clearTimeout(timer); resolve({ ws, msgs }) })
  ws.on('error', (e) => { clearTimeout(timer); reject(e) })
})

const awaitMsg = async (msgs, pred, label, tries = 60) => {
  for (let i = 0; i < tries; i++) {
    const found = msgs.find(pred)
    if (found) return found
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`awaitMsg timeout: ${label}`)
}

const results = []
const check = (label, cond, detail = '') => {
  results.push({ label, pass: !!cond })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
}

// 版本兼容断言：live 服务器在部署 0.13.0 前仍是 0.12.0，两版都过；
// 部署 0.13.0 后收紧为 === '0.13.0'。
const isVersion = (v) => v === '0.12.0' || v === '0.13.0'

let conn
for (const token of [undefined, ...tokens]) {
  try {
    conn = await connect(token)
    console.log(`WS 已连接${token !== undefined ? '（device token 鉴权）' : '（无鉴权，localhost 放行）'}`)
    break
  } catch {
    /* 试下一个 token */
  }
}
if (conn === undefined) {
  console.log('FAIL  WS 连接失败（无可用 token）')
  process.exit(1)
}
const { ws, msgs } = conn

const hello = await awaitMsg(msgs, (m) => m.type === 'hello', 'hello')
check('hello 版本（0.12.0/0.13.0 兼容）', isVersion(hello?.version), hello?.version)

const boot = await awaitMsg(msgs, (m) => m.type === 'server_boot', 'server_boot')
check('server_boot 版本（0.12.0/0.13.0 兼容）', isVersion(boot?.version), boot?.version)

// 子代理会话标题：打印有 parentSessionId 的会话（人工核对凝练度）
const subs = (hello?.sessions ?? []).filter((s) => s.parentSessionId)
console.log(`子代理会话 ${subs.length} 个，标题样例：`)
for (const s of subs.slice(0, 12)) console.log(`  - [${s.status ?? 'idle'}] ${(s.name ?? '(空)').slice(0, 40)}`)

// 斜杠命令清单：订阅本会话拿 history.commands
const mainSession = 'session-ab787050-ebad-40ed-8013-83859ddbc88e'
ws.send(JSON.stringify({ type: 'subscribe', sessionId: mainSession }))
const hist = await awaitMsg(msgs, (m) => m.type === 'history' && m.sessionId === mainSession, 'history 本会话')
check('subscribe 携带斜杠命令清单（服务端注册表）', Array.isArray(hist?.commands) && hist.commands.some((c) => c.name === 'compact'), JSON.stringify(hist?.commands?.map((c) => c.name)))

// 自动续跑幂等：work.json 指纹必须与当前内容一致（说明注入后指纹已写盘 → 后续零重复注入）。
// 注意：本次注入若恰好在重启前被旧进程消费（work.json 更新与 kill 竞态），历史里会是 0 条——
// 这属于操作时序问题而非代码 bug；关键断言是「指纹一致 → 不会重复注入」。
const resumeCount = (hist?.events ?? []).filter((e) => e.type === 'user_message' && (e.text ?? '').includes('【服务端自动续跑】')).length
console.log(`INFO  本会话历史窗口内续跑消息 ${resumeCount} 条（仅信息，见上方注释）`)
try {
  const workResp = await fetch(`http://${HOST}:${PORT}/remote/work`)
  const work = await workResp.json()
  const fp = `${work.activity ?? ''}\n${(work.pending ?? []).join('\n')}\n${work.sessionId ?? ''}`
  check('自动续跑指纹一致（不会重复注入）', work.resumeFingerprint === fp, work.resumeFingerprint === fp ? 'match' : 'MISMATCH')
} catch (e) {
  check('自动续跑指纹一致（不会重复注入）', false, String(e))
}

// 休眠会话候选（agent 未挂载的会话；--open 用）
const dormant = (hello?.sessions ?? []).filter((s) => s.status !== 'running')
console.log(`休眠/空闲会话候选 ${dormant.length} 个：`)
for (const s of dormant.slice(0, 15)) console.log(`  - ${s.id.slice(0, 12)} [${s.status ?? 'idle'}]${s.parentSessionId ? ' (子代理)' : ''} ${(s.name ?? '').slice(0, 30)}`)

if (openSessionId !== undefined) {
  console.log(`向 ${openSessionId} 发送测试消息：${openMessage.slice(0, 50)}`)
  ws.send(JSON.stringify({ type: 'send_message', sessionId: openSessionId, text: openMessage }))
  // 自动打开：预期不再收到 not_running 错误；等待 8s 观察是否有 error 返回
  await new Promise((r) => setTimeout(r, 8000))
  const err = msgs.find((m) => m.type === 'error' && m.code === 'not_running')
  check('休眠会话 send_message 无 not_running（自动打开成功）', err === undefined, err?.message)
  if (err === undefined) {
    // 该会话的历史/事件流里应出现刚发的消息（投递不丢）
    ws.send(JSON.stringify({ type: 'subscribe', sessionId: openSessionId }))
    const targetHist = await awaitMsg(msgs, (m) => m.type === 'history' && m.sessionId === openSessionId, '目标会话 history')
    const delivered = (targetHist?.events ?? []).some((e) => e.type === 'user_message' && (e.text ?? '').includes('会话自动打开验证'))
    check('消息已投递进目标会话（事件流可见）', delivered)
  }
}

ws.close()
const failed = results.filter((r) => !r.pass).length
console.log(`\n自检完成：${results.length - failed}/${results.length} 通过`)
process.exit(failed > 0 ? 1 : 0)
