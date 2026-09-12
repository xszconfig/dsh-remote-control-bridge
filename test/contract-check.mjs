// 跨端 wire schema 契约检查（止血 S1：手写双份协议漂移）。
//
// 目的：TS `src/protocol.ts` 的 wire 接口字段集合 与 Kotlin `Protocol.kt` 的
// @Serializable 类字段集合必须一致。任何一端新增/删除字段（allowlist 之外）→ 脚本失败，
// 堵住「手写镜像漂移 → 运行时静默丢字段/bad-response」的路径。
//
// 运行：node test/contract-check.mjs（随 pnpm test 在 smoke 之前执行）
// 环境变量 DSH_APP_REPO：覆盖 App 仓库路径（默认 ../dsh-remote-control）；
//   目录不存在时跳过并提示，保证桥仓库独立可测。
//
// 已知的「有意不对称」集中在下面三个 allowlist + NAME_MAP，均有理由注释：
//   TS_ONLY        —— TS 侧有、Kotlin 侧无（历史遗留/REST-only/内联匿名类型）
//   KT_ONLY        —— Kotlin 侧有、TS 侧无（本地持久化/REST 响应/内联匿名类型具名化）
//   NAME_MAP       —— 两侧同名不同（EvXxx→Xxx、DiffWire→FileDiffWire 等）
import { readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = resolve(fileURLToPath(import.meta.url), '..')

// ---- 有意不对称 allowlist（脚本内显式记录，含理由）----

// TS 接口在 Kotlin 侧无对应类型（历史遗留 / REST-only / 从未被 core.ts 广播）
const TS_ONLY = {
  EvSessions: 'TS 历史遗留事件，core.ts 从不广播（Kotlin 未镜像）',
  EvAgents: 'TS 历史遗留事件，core.ts 从不广播（Kotlin 未镜像）',
  PairInfo: 'REST /remote/pair-info 响应（App 只消费二维码里的 PairQrPayload）',
  DeviceRecord: 'REST /remote/devices 脱敏条目（App 不消费该端点）',
}

// Kotlin @Serializable 类在 TS protocol.ts 无对应 interface
const KT_ONLY = {
  CachedSessionSnapshot: 'App 本地会话元数据缓存快照，非 wire',
  StoredDevice: 'App 本地设备持久化（wire 用 DeviceRegistered / register_device 承载）',
  DeviceFile: 'App 本地设备文件，非 wire',
  ServerLogEntry: 'REST /remote/logs 响应条目（TS 对应类型在 logger.ts 的 LogEntry，不在 protocol.ts）',
  ServerLogsResponse: 'REST /remote/logs 响应（TS 内联，无 interface）',
  ApprovalSettledLegacy: '历史兼容事件（旧 bridge 0.3.0 事件名 approval_settled），TS 已删',
  DebugStoppedAt: 'TS DebugStateWire.paused.stoppedAt 内联匿名类型，Kotlin 具名',
  DebugPausedWire: 'TS DebugStateWire.paused 内联匿名类型，Kotlin 具名',
  HelloLsp: 'TS EvHello.lsp 内联匿名类型，Kotlin 具名',
  HelloWork: 'TS EvHello.work 内联匿名类型，Kotlin 具名',
  DeliveryConfirmItemWire: 'TS CmdConfirmDelivery.deliveries 内联匿名类型 {sessionId,turnKey}，Kotlin 具名',
}

// TS 接口名 → Kotlin 类名（同名不同名映射）
const NAME_MAP = {
  DiffWire: 'FileDiffWire',
  LspDiagnosticWire: 'DiagnosticWire',
  WireEndpoint: 'StoredEndpoint',
}

// 字段级 allowlist（`<类型>.<字段>:<方向>`；方向 kt=Kotlin 缺该字段，ts=TS 缺该字段）
const FIELD_ALLOWLIST = new Set([])

// ---- 解析：protocol.ts 的 interface 字段集合 ----

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '') // 块注释
    .replace(/\/\/.*$/gm, '') // 行注释
}

function parseTsInterfaces(src) {
  const lines = stripComments(src).split('\n')
  const out = {}
  let cur = null // { name, fields }
  let depth = 0
  const ifaceRe = /^export\s+interface\s+(\w+)\s*(?:extends\s+[\w.]+\s*)?\{/
  const fieldRe = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(\?)?\s*:/
  for (const line of lines) {
    if (cur === null) {
      const m = ifaceRe.exec(line.trim())
      if (m) {
        cur = { name: m[1], fields: [] }
        depth = 1
      }
      continue
    }
    const prevDepth = depth
    for (const ch of line) {
      if (ch === '{') depth++
      else if (ch === '}') depth--
    }
    if (depth <= 0) {
      out[cur.name] = cur.fields
      cur = null
      continue
    }
    // 只在 interface 顶层（depth===1）提取字段；内联匿名对象（如 DebugStateWire.paused 的
    // reason/stoppedAt/frames）跨行时 depth>1，不当作顶层字段（它们由 Kotlin 具名类承载）。
    if (prevDepth === 1) {
      const fm = fieldRe.exec(line)
      if (fm) cur.fields.push(fm[1])
    }
  }
  return out
}

// ---- 解析：Protocol.kt 的 @Serializable data class 字段集合 ----

function findBalancedParen(src, openIdx) {
  let depth = 0
  let inStr = false
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i]
    if (inStr) {
      if (ch === '\\') i++
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === '(') depth++
    else if (ch === ')') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

function parseKtClasses(src) {
  const text = stripComments(src)
  const out = {}
  const classRe = /\bdata\s+class\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g
  const objRe = /\bdata\s+object\s+([A-Za-z_][A-Za-z0-9_]*)/g
  for (const m of text.matchAll(classRe)) {
    const name = m[1]
    const openIdx = m.index + m[0].length - 1
    const closeIdx = findBalancedParen(text, openIdx)
    if (closeIdx < 0) {
      console.warn(`[contract-check] 无法匹配 ${name} 的括号，跳过`)
      continue
    }
    const body = text.slice(openIdx + 1, closeIdx)
    out[name] = [...body.matchAll(/\bval\s+([A-Za-z_][A-Za-z0-9_]*)\s*:/g)].map((x) => x[1])
  }
  for (const m of text.matchAll(objRe)) out[m[1]] = []
  return out
}

// ---- 主流程 ----

const bridgeRoot = resolve(__dirname, '..')
const tsPath = join(bridgeRoot, 'src', 'protocol.ts')
const appRepo = process.env.DSH_APP_REPO ?? join(bridgeRoot, '..', 'dsh-remote-control')
const ktPath = join(appRepo, 'composeApp', 'src', 'commonMain', 'kotlin', 'com', 'daniel', 'dshremote', 'protocol', 'Protocol.kt')

const tsSrc = readFileSync(tsPath, 'utf8')
const tsIfaces = parseTsInterfaces(tsSrc)

if (!existsSync(ktPath)) {
  console.log(`[contract-check] 跳过：未找到 App 仓库 Protocol.kt（${ktPath}）。可用 DSH_APP_REPO 覆盖，或 ` +
    `在桥仓库旁放 App 仓库（默认 ../dsh-remote-control）。`)
  process.exit(0)
}

const ktSrc = readFileSync(ktPath, 'utf8')
const ktClasses = parseKtClasses(ktSrc)

// TS 接口名 → Kotlin 类名（显式映射优先，事件/命令信封的 Ev/Cmd 前缀剥离，其余同名）。
// 注意：Ev/Cmd 只剥离「事件/命令信封」（Ev 后接大写字母，如 EvHello→Hello）；数据模型
// EventProjection 以 "Ev" 开头但第 3 字符是小写 'e'，不能被误剥成 "entProjection"。
const ktNameOf = (tsName) => {
  if (NAME_MAP[tsName]) return NAME_MAP[tsName]
  if (/^Ev[A-Z]/.test(tsName)) return tsName.slice(2)
  if (/^Cmd[A-Z]/.test(tsName)) return tsName.slice(3)
  return tsName
}

const failures = []
const warnings = []

for (const [tsName, tsFields] of Object.entries(tsIfaces)) {
  if (TS_ONLY[tsName]) continue
  const ktName = ktNameOf(tsName)
  const ktFields = ktClasses[ktName]
  if (ktFields === undefined) {
    failures.push(`TS 接口 ${tsName} 无 Kotlin 对应类型（期望 ${ktName}）——若为有意不对称请加入 TS_ONLY`)
    continue
  }
  // 事件/命令信封的 type 是判别字段（Kotlin 用 classDiscriminator，不声明）；数据模型的 type 是真字段
  const isEnvelope = /^Ev[A-Z]/.test(tsName) || /^Cmd[A-Z]/.test(tsName)
  const tsSet = new Set(isEnvelope ? tsFields.filter((f) => f !== 'type') : tsFields)
  const ktSet = new Set(ktFields)
  const missingInKt = [...tsSet].filter((f) => !ktSet.has(f) && !FIELD_ALLOWLIST.has(`${tsName}.${f}:kt`))
  const missingInTs = [...ktSet].filter((f) => !tsSet.has(f) && !FIELD_ALLOWLIST.has(`${tsName}.${f}:ts`))
  if (missingInKt.length) failures.push(`${tsName} → ${ktName}: Kotlin 缺字段 [${missingInKt.join(', ')}]`)
  if (missingInTs.length) failures.push(`${tsName} → ${ktName}: Kotlin 多字段 [${missingInTs.join(', ')}]（TS 无）`)
}

// Kotlin 侧未被任何 TS 接口匹配的类型 → 仅告警（本地持久化/REST 响应等可能是有意的）
for (const ktName of Object.keys(ktClasses)) {
  const matched = Object.entries(tsIfaces).some(([tsName]) => !TS_ONLY[tsName] && ktNameOf(tsName) === ktName)
  if (!matched && !KT_ONLY[ktName]) {
    warnings.push(`Kotlin 类型 ${ktName} 未被任何 TS 接口匹配——若为有意本地类型请加入 KT_ONLY`)
  }
}

const tsCount = Object.keys(tsIfaces).length
const checkedCount = Object.keys(tsIfaces).filter((n) => !TS_ONLY[n]).length
const ktCount = Object.keys(ktClasses).length
console.log(`[contract-check] TS 接口 ${tsCount} 个（比对 ${checkedCount}，豁免 ${Object.keys(TS_ONLY).length}）｜Kotlin 类 ${ktCount} 个`)
for (const w of warnings) console.warn(`[contract-check] WARN ${w}`)

if (failures.length > 0) {
  console.error(`[contract-check] FAIL 共 ${failures.length} 处漂移：`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('[contract-check] PASS 两侧 wire 字段集合一致')
