# LSP 被动诊断 → Agent 自动闭环

## 问题

Agent 改代码后，语言服务器被动检查出的**编译错误**过去只广播到手机（`diagnostics` 事件），
Agent 自己完全不知情。最经典的「改 A 文件导致 B 文件编译错误（跨文件遗漏引用处）」场景，
Agent 只能靠后续跑测试/构建才发现，甚至一直不发现。

本特性把被动检查出的 **error** 自动喂给 Agent 自己，形成闭环：
编辑 → 诊断 → 注入 Agent → Agent 修复 → 再诊断 → 直到编译错误全部消除。

## 机制

### 注入触发（`src/index.ts` → `src/lsp-feedback.ts`）

某会话 Agent 编辑文件后，语言服务器诊断经 `LspManager.onDiagnostics` 回调到达 bridge：

1. **广播到手机**（原有行为，不变）：`diagnostics` 事件带 `sessionId`。
2. **喂给 Agent**（新增）：`LspFeedback.handle(path, sessionId, diagnostics)`。

`LspFeedback` 只做「该不该注入、注入什么、注入几次」的决策；真正的 Agent 动作由
`index.ts` 的 `inject` 回调决定，遵循官方注入语义：

- **运行中**：`agent.inject(message)` —— 注入 next-step，模型下一步推理立即看到，
  **不 `steer` 打断**（steer 是用户意图语义，会抢当前步；inject 是"下一步上下文"，不打断）。
- **空闲**：`agent.followup(message)` —— 唤醒驱动开始新一轮。

注入消息的 `source` 用官方 `plugin` 源（`kind: 'plugin'` + `form: 'notice'` + `summary`），
在桌面端 transcript 折叠展示；不新增任何 wire 协议字段，客户端无需改动。

### 过滤规则（只注入 error）

- 只注入 `severity === 1`（error）；warning/info/hint 不注入（防噪音）。
- 无 `sessionId` 归属的诊断不注入（跨文件诊断已在 `lsp.ts` 回退归属，见下）。

### 防抖与去重（`LspFeedback`）

- **防抖 ~1s**：同一编辑批次的诊断（含 tsserver 跨文件诊断先后到达）合并成一批；
  按会话隔离（多会话并发编辑互不串扰）。
- **指纹去重**：同批错误用指纹（文件集合 + 首错误 message + 行号集合）去重，
  同一批只注入一次。
- **每轮上限 3 次**：防「注入→修复→又报错→再注入」死循环；`turn/start` 时重置计数。

### 闭环进展语义

- 第一次注入：`【LSP 编译错误】检测到 N 个编译错误，请修复：…`。
- 第二次及以后：`【LSP 编译错误】已消除 X 个，剩余 N 个编译错误，请继续修复：…`
  （X = 上一批条数 − 当前条数）。
- 清零：**静默 + 日志**（`onCleared` 回调只记日志，不再注入打扰 Agent）。

### 跨文件覆盖（核心场景）

- **TS/JS 通道**：tsserver 会推送受影响文件的诊断（`uri` 不在 `docSessions`）。
  `LspManager` 新增 `ServerState.lastSession`（最近一次编辑触发该 server 的会话），
  `sessionOf(uri)` 优先取该文档 didOpen 会话、否则回退到 `lastSession`。
  这样跨文件诊断的 `sessionId` 不再为 `''`——既修复手机端因 `sessionId=''` 丢弃的问题，
  也纳入 Agent 注入清单。
- **Kotlin 通道**：pull 模式（IntelliJ LSP 不推 publishDiagnostics）。
  同步后除被编辑文件外，对该 server 已打开的其余文档也做一轮 `textDocument/diagnostic`
  拉取（`pullAllDiagnostics`），覆盖「改 A 导致 B 报错」。`openDocs` 规模有限（Agent
  实际编辑过的文件），可控。

### 逃生门

环境变量 `DSH_REMOTE_LSP_FEEDBACK`（默认开启；`0`/`false` 关闭，不区分大小写）。
关闭时 `LspFeedback.handle` 直接空转，不注入、不清零；手机广播不受影响（照常推）。

## 时序

```
Agent 编辑文件（tool/call）
  → LspManager.notifyFileChanged(path, sessionId)   记录 lastSession
  → didOpen/didChange → 语言服务器分析
  → publishDiagnostics（TS/JS push / Kotlin pull）
  → LspManager.onDiagnostics(path, sessionId, diags)  sessionId 已回退归属
     ├─ broadcast({ type:'diagnostics', ... })        手机照常收
     └─ LspFeedback.handle(...)                       仅 error，防抖合并
          → 指纹去重 / 每轮上限 3 次 / 进展语义
          → 运行中 agent.inject(next-step) / 空闲 agent.followup
Agent 下一步推理看到错误清单 → 修复 → 再诊断 → 直到清零（静默）
```

## 测试覆盖

`test/smoke.mjs` 新增 13 断言（总计 118 全绿）：

| 场景 | 断言 |
| --- | --- |
| 逃生门判定 | `DSH_REMOTE_LSP_FEEDBACK` 默认开 / `0`/`false`/`FALSE` 关 / `1`/`true` 开 |
| 注入 | error 注入一次且含错误文本；warning 不注入 |
| 去重 | 同批同诊断第二次不注入 |
| 进展 | 第二次注入带「已消除 X 个，剩余 N 个」 |
| 上限 | 每轮注入上限 3 次后不再注入 |
| 清零 | 错误清零 → onCleared 回调、不再注入 |
| 关闭 | `enabled:false`（= 环境变量关闭）零注入 |
| 跨文件 | 改 A 推 B 的诊断 sessionId 回退归属（不再 `''`） |
| Kotlin pull | 重编辑 A 后 A+B 都被拉取 |

## 设计取舍与已知约束

- **注入 API**：官方 `Agent.inject()`（"queue model-facing context for the next
  pre-step without waking the driver"）是「运行中注入 next-step」的正解；`steer()` 是
  用户意图语义（会抢最近 step），与"被动诊断反馈"性质不符，故运行中不用 steer。
- **`LspFeedback` 与队列快照的交互**：注入走 `agent.inject`/`agent.followup`，两者都
  会经 inbox splice 落库并触发 `session_queue` 广播 + `work.json` 队列快照。LSP 反馈
  消息因此会像普通排队消息一样被持久化；重启后若仍 pending 可能被 `restoreQueueIfLost`
  以 `followup` 重新注入——这是既有「排队消息跨重启恢复」机制的通用行为，并非本特性
  引入的冲突（诊断内容通常随 agent 修复很快被消费，重启残留概率低）。
- **Kotlin 全量拉取取舍**：采用「pull 已打开文档」而非 `workspace/diagnostic`（LSP 3.17
  全工作区拉取）。理由：`openDocs` 规模有限可控；`workspace/diagnostic` 需要 partial-result
  进度分片处理 + 大项目可能超时（JetBrains IntelliJ LSP 的 pull diagnostics 在 2025.1
  有变更、社区有多起 Kotlin LSP pull 超时反馈），收益/复杂度不成比例。
