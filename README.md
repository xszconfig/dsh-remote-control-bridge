# dsh-remote-control-bridge

DeepSeek Harness 桌面端远程控制桥接插件（当前版本 **0.10.9**）。把 dsh 的会话 / Agent / 审批 / 思考流暴露成 WebSocket + REST，供手机客户端（[`dsh-remote-control`](https://github.com/xszconfig/dsh-remote-control)）连接。支持扫码配对、设备指纹与长期设备凭据，并在 Web UI 侧边栏内置「连接移动端」配对弹窗。

## 定位

- **不改 dsh 内核**，收敛为一个树外插件。
- **手机是控制面，不是数据面**：代码 / 密钥 / 工作区永驻桌面，手机只读状态、发指令、做审批。
- **单向数据流**：会话历史、排队队列、思考流全部以服务端投影为唯一事实源，客户端只做乐观显示 + 接收广播纠正。

## 暴露的接口

| 端点 | 类型 | 说明 |
|------|------|------|
| `/remote/ws` | WebSocket upgrade | 双向 JSON 帧：状态快照、事件流、命令 |
| `/remote/health` | GET | 健康检查：`{ok, version, sessions}` |
| `/remote/sessions` | GET | 会话 + Agent 快照（JSON） |
| `/remote/ping` | GET | 在线探测：`{ok, version, serverId, hostname, sessions}`（手机设备列表探测用，无需认证） |
| `/remote/pair` | GET | 配对页（HTML + 二维码，**仅 loopback**） |
| `/remote/pair-info` | GET | 配对信息 JSON（含一次性 pair token 与候选 ws URL，**仅 loopback**） |
| `/remote/devices` | GET | 已配对设备列表（token 打码，**仅 loopback**） |
| `/remote/connected` | GET | 当前在线客户端列表（设备 id / 名称 / 型号 / 连接时间） |
| `/remote/logs` | GET | bridge 结构化日志（`?since=` 增量拉取；故障排查主入口） |
| `/remote/phone-logs` | GET | 等待手机回传本地连接日志（桌面端 → 手机 `logs_request` → `upload_logs`） |
| `/remote/debug/approval-test` | GET | 调试用：切审批策略 / 发起一次测试审批 |

### WS 协议（JSON 帧）

**服务端 → 客户端：**

| type | 载荷 | 触发 |
|------|------|------|
| `hello` | `serverId` + `hostname` + `sessions[]` + `agents[]` + `workspaces[]` + 挂起审批/提问 | 连接建立 / 响应 `list` |
| `history` | `sessionId` + `events[]` + `queue[]` + `hasMore` + `total` | 响应 `subscribe` / `history_page` |
| `event` | `sessionId` + `event`（[EventProjection](#消息模型-eventprojection)） | 会话事件实时投影（用户/助手/思考/工具调用/结果） |
| `session_queue` | `sessionId` + `items[]` | 排队队列变化（inbox splice，见[排队消息同步](#排队消息同步)） |
| `think_delta` | `sessionId` + `text`（空 = 清除） | 思考流式增量（100ms 节流，见[思考流式](#思考流式)） |
| `model_waiting` / `model_waiting_done` | `sessionId` + `startedAt`（done 带 `elapsedMs`） | 模型请求起止（Deep Diving 指示） |
| `agent_status` | `sessionId` + `status` | Agent 状态变化（running/idle） |
| `session_title` | `sessionId` + `title` | 会话标题变更（用户改名/自动生成） |
| `session_upsert` | `session` | 会话列表增量（新建/下线） |
| `approval_request` | `approvalId` + `sessionId` + `toolName` + `reason?` + `callId?` + `command?` + `rpcId?` | 审批请求（`rpcId` = 桌面端持有，裁决走 `answer_approval`） |
| `approval_resolved` | `approvalId` + `outcome` | 审批已裁决 |
| `question_request` | `rpcId` + `sessionId` + `questions[]` | 桌面端多选提问透传 |
| `question_resolved` | `rpcId` | 提问已答复 |
| `logs_request` | `requestId` | 桌面端请求手机日志 |
| `device_registered` | `deviceId` + `deviceToken` + `serverId` + `hostname` | 响应 `register_device` |
| `device_revoked` | `deviceId` | 响应 `revoke_device` |
| `error` | `code` + `message` | 命令错误 |

**客户端 → 服务端：**

| type | 载荷 | 效果 |
|------|------|------|
| `list` | — | 回 `hello` 快照 |
| `subscribe` | `sessionId` | 回 `history`（尾部 300 行投影窗口 + 当前队列） |
| `history_page` | `sessionId` + `beforeSeq` + `limit?`(10~500，默认 300) | 回 seq < beforeSeq 的上一页投影行 |
| `send_message` | `sessionId` + `text` | `agent.followup()`（运行中入队，空闲即开新轮） |
| `interrupt` | `sessionId` | `agent.cancel({kind:'user'})` |
| `approve` | `approvalId` + `decision` | 裁决 bridge 持有的审批（`allowed-once`/`rejected`） |
| `answer_approval` | `rpcId` + `approvalId` + `decision` | 裁决桌面端（mux）持有的审批 |
| `answer_question` | `rpcId` + `answer` | 回答桌面端提问 |
| `queue_action` | `sessionId` + `itemId` + `action`(`steer`/`remove`) | 插队（注入当前轮）/ 删除排队消息 |
| `register_device` | `deviceId` + `name` + `model?` | 建立 / 刷新设备记录，签发长期 `deviceToken` |
| `revoke_device` | `deviceId` | 撤销设备凭据 |
| `upload_logs` | `requestId` + `entries[]` | 回传手机连接日志（响应 `logs_request`） |

### 消息模型（EventProjection）

会话原始事件在服务端投影为可见行（`projectEvent`），手机只消费投影结果：

| 字段 | 说明 |
|------|------|
| `seq` / `type` / `timestamp` | 原始事件序号 / 行类型（`user_message` `assistant_message` `think` `tool_call` `tool_result`）/ 时间 |
| `text` | 正文（assistant 正文在客户端按 CommonMark 渲染） |
| `toolName` / `toolArgs` / `toolResult` / `toolError` | 工具名 / 原始参数 / 结果文本（4000 字符截断）/ 是否出错 |
| `toolCard` / `toolKind` | 桌面端 presentCall 同源卡片形态（`terminal`/`generic`/`diff`）/ 类别（read/edit/delete/move/search/execute/fetch/other） |
| `toolDesc` | 一行描述：优先 `TerminalCallView.description`（命令的一句话总结），缺失退回 title |
| `callId` | 调用/结果关联 id（客户端据此把失败命令标红） |
| `diffs` | `DiffCallView.diffs`（path/oldText/newText）：Edit/Write 等文件变更，客户端展开工具卡渲染红删绿增 |

### 历史分页语义

- **按投影行翻页**，不是按原始事件窗口：`projectWindowBack` 从 `beforeSeq` 向前扫描原始事件逐条投影，攒满一页可见行或扫到最开头——大会话（百万级原始事件）下不会出现"整页投影为空"的卡死。
- 返回顺序恒为 **旧→新**；`hasMore` = 攒满 limit 且仍有未扫描的原始事件（下一请求若全不可投影会空页返回并置 `hasMore=false`，不会死循环）。
- 同 seq 多行（think + 正文）原子收集；`total` 为原始事件总数。

### 排队消息同步

- 排队队列是 inbox 的**内存投影**：`agent/inbox/spliced` 事件先落库（同步触发 `session/event` 观察者）、之后才改投影。
- 因此 bridge 在观察者里**不直接读队列**，而是 `queueMicrotask` 延迟到本 tick 结束（投影已更新）再广播 `session_queue`——否则入队广播不含新消息、claim 广播仍含旧消息（客户端排队状态永远错位）。
- `subscribe`/`hello` 携带 `queue` 快照兜底；客户端乐观显示 + 广播纠正。

### 思考流式（think_delta）

- `assistant/chunk` 的 `reasoning-delta` 增量累积，**100ms 节流**广播 `think_delta`（尾部 240 字符），手机一行持续刷新。
- `assistant/message`、`turn/start`、`turn/end`、`user/message` 时清空（终态由 `think` 投影行呈现）。

## 配对与设备指纹

1. 桌面浏览器打开 `http://127.0.0.1:3080/remote/pair`（端口按实际），页面展示二维码（10 分钟有效）。
2. 手机 App「扫码连接」→ 用二维码里的 `?pair=` 一次性 token 连上 → 发 `register_device`。
3. 服务端把设备记入 `$DSH_HOME/remote-control-devices.json`（0600），签发长期 token；手机保存 token + `serverId` 指纹。
4. 之后手机用 `?token=<deviceToken>` 直连；`/remote/ping` 用于设备列表在线检测（`serverId` 变化即「设备已更换」）。
5. 机器指纹 `serverId` 持久化在 `$DSH_HOME/remote-control-bridge-id`。

> dsh 出于安全只支持 Web 服务监听 127.0.0.1（`--host 0.0.0.0` 被内核拒绝），手机通过 USB `adb reverse tcp:<port> tcp:<port>`、SSH 隧道（`ssh -L <port>:127.0.0.1:<port> user@host`）或 Tailscale（`tailscale serve`）访问。配对页在回环绑定时会把 127.0.0.1 地址放在二维码候选首位并给出提示。

## 认证

- 默认无 token（信任 dsh web server 的 loopback 绑定）。
- 设 `DSH_REMOTE_TOKEN` 后，客户端需在 `?token=` 或 `Authorization: Bearer` 提供。
- `?pair=` 一次性配对 token 与 `?token=` 设备长期 token 也受支持；`/remote/ping` 无需认证（供在线探测）。

## 安装到 dsh web profile

```bash
cd ~/code/dsh-remote-control-bridge
pnpm build
cd ~/.dsh/profiles/web
dsh plugin --profile web add file:~/code/dsh-remote-control-bridge
```

（`dsh plugin` 会把包加入 profile 的 `package.json` dependencies，并 append 到 `dsh.profile.bundles`。改完插件需重启 `dsh web` 生效。）

## 依赖的 dsh API（已验证）

- `ctx.agents.list()` / `ctx.sessions.list()`
- `ctx.workspaceRegistry.list()`（工作区分组）
- `ctx.sessionTitle.get(session)`（会话显示名）
- `agent.followup(createUserMessage({ content, source:{kind:'user'} }))` / `agent.steer` / `agent.cancel({ kind: 'user' })`
- `agent.inbox.nextTurn / nextStep`（排队投影）+ `agent.inbox.remove(MessageId)`
- `ctx.on('session/event', (session, event) => …)`（含 `session/title`、`agent/inbox/spliced`、`assistant/chunk`）
- `ctx.on('agent/status', ({ agent, status }) => …)`
- `ctx.on('llm/stream', (options, next) => …)`（Deep Diving 起止，global + prepend）
- `ctx.on('approval/request', async (req, next) => …)`
- `ctx.tools.get(name, scope)?.presentCall?.(args)`（工具描述 / 类别 / diff）
- `ctx.webServer.register(route)` / `ctx.webServer.registerUpgrade(route)`
- `ctx.webServer.port` / `ctx.webServer.host`（配对二维码生成用）
- `ctx.sessionPersistence` + `ctx.sessionProjectionCache.cachedSnapshot(header)`（冷会话列表/历史，零日志读）

## Agent 接入指南（如何让新 Agent 的会话出现在手机）

bridge 不需要 Agent 做任何改造，接入零代码。手机端能看到什么，取决于下列 dsh 机制：

1. **会话可见性**：手机看到的会话 = 桌面端 `ctx.sessions.list()` 的 live 会话 ∪ 持久化层的冷会话（`sessionPersistence` 只读读取 + `sessionProjectionCache.cachedSnapshot` 提供标题/元数据，不拉起 Agent）。
2. **事件投影**：Agent 写入 session 的 `user/message`、`assistant/message`（reasoning 块 → `think` 行）、`tool/call`、`tool/result` 自动投影给手机；`assistant/chunk` 的 `reasoning-delta` 触发 `think_delta` 流式行。其它事件类型（约 38 种）不下发，手机端只展示投影行。
3. **状态与队列**：Agent 的 `agent/status`（running/idle）实时同步；`agent.inbox` 的任何 splice（入队/claim/删除）都会广播 `session_queue`——Agent 只要用标准 inbox API 接收输入，排队状态就自动正确。
4. **审批**：Agent 走 `ctx.on('approval/request')` 的审批会被 bridge 拦截并推给手机裁决（`approve` 命令回传）；桌面端（mux）持有的审批经 `answer_approval` 转裁决。提问同理（`question_request` / `answer_question`）。
5. **工具展示**：Agent 注册工具时实现 `presentCall`（返回 `ToolCallView`，含 `title`/`description`/`kind`/`diffs`）即可获得与桌面端一致的一行描述、图标类别和 Code Diff；未实现时降级为原始参数展示。

## 回归测试

`/tmp/bridge_smoke.mjs`（本机，未入库）：mock ctx 覆盖 hello 快照、冷会话合并、分页语义、排队同步、思考流式、审批/提问透传、工具描述与 diff 投影，**49/49 通过**（bridge 0.10.9）。
