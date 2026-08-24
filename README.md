# dsh-remote-control-bridge

DeepSeek Harness 桌面端远程控制桥接插件。把 dsh 的会话 / Agent / 审批暴露成 WebSocket + REST，供手机客户端（[`dsh-remote-control`](https://github.com/xszconfig/dsh-remote-control)）连接。支持扫码配对、设备指纹与长期设备凭据，并在 Web UI 侧边栏内置「连接移动端」配对弹窗。

## 定位

- **不改 dsh 内核**，收敛为一个树外插件。
- **手机是控制面，不是数据面**：代码 / 密钥 / 工作区永驻桌面，手机只读状态、发指令、做审批。

## 暴露的接口

| 端点 | 类型 | 说明 |
|------|------|------|
| `/remote/ws` | WebSocket upgrade | 双向 JSON 帧：状态快照、事件流、命令 |
| `/remote/health` | GET | 健康检查 |
| `/remote/sessions` | GET | 会话 + Agent 快照（JSON） |
| `/remote/ping` | GET | 在线探测：`{ok, version, serverId, hostname, sessions}`（手机设备列表探测用，无需认证） |
| `/remote/pair` | GET | 配对页（HTML + 二维码，**仅 loopback**） |
| `/remote/pair-info` | GET | 配对信息 JSON（含一次性 pair token 与候选 ws URL，**仅 loopback**） |
| `/remote/devices` | GET | 已配对设备列表（token 打码，**仅 loopback**） |

### WS 协议（JSON 帧）

**服务端 → 客户端：**

| type | 载荷 | 触发 |
|------|------|------|
| `hello` | `serverId` + `hostname` + `sessions[]` + `agents[]` + `workspaces[]` | 连接建立 |
| `history` | `sessionId` + `events[]` | 响应 `subscribe` |
| `event` | `sessionId` + `event` | 会话事件（实时） |
| `agent_status` | `sessionId` + `status` | Agent 状态变化 |
| `session_title` | `sessionId` + `title` | 会话标题变更（用户改名/自动生成） |
| `approval_request` | `approvalId` + `sessionId` + `toolName` + `reason?` | 审批请求 |
| `approval_settled` | `approvalId` + `outcome` | 审批已裁决 |
| `device_registered` | `deviceId` + `deviceToken` + `serverId` + `hostname` | 响应 `register_device` |
| `device_revoked` | `deviceId` | 响应 `revoke_device` |
| `error` | `code` + `message` | 命令错误 |

**会话与工作区语义（与桌面端一致）：**

- `SessionSummary.name`：桌面显示名 = `sessionTitle` 服务的持久化标题（日志支撑/用户改名）→ cwd basename → id。
- `SessionSummary.workspaceId`：来自 `workspaceRegistry`（`null` = 未分组）。
- `hello.workspaces[]`：`{id, title, path, sessionCount}`，持久注册表顺序。
- 标题变更通过 `session/title` 事件实时广播为 `session_title`。

**客户端 → 服务端：**

| type | 载荷 | 效果 |
|------|------|------|
| `list` | — | 回 `hello` 快照 |
| `subscribe` | `sessionId` | 回 `history` 历史 |
| `send_message` | `sessionId` + `text` | `agent.followup()` |
| `interrupt` | `sessionId` | `agent.cancel({kind:'user'})` |
| `approve` | `approvalId` + `decision` | 裁决审批（`allowed-once`/`rejected`） |
| `register_device` | `deviceId` + `name` + `model?` | 建立 / 刷新设备记录，签发长期 `deviceToken` |
| `revoke_device` | `deviceId` | 撤销设备凭据 |

## 配对与设备指纹

1. 桌面浏览器打开 `http://127.0.0.1:3080/remote/pair`（端口按实际），页面展示二维码（10 分钟有效）。
2. 手机 App「扫码连接」→ 用二维码里的 `?pair=` 一次性 token 连上 → 发 `register_device`。
3. 服务端把设备记入 `$DSH_HOME/remote-control-devices.json`（0600），签发长期 token；手机保存 token + `serverId` 指纹。
4. 之后手机用 `?token=<deviceToken>` 直连；`/remote/ping` 用于设备列表在线检测（`serverId` 变化即「设备已更换」）。
5. 机器指纹 `serverId` 持久化在 `$DSH_HOME/remote-control-bridge-id`。

> dsh 出于安全只支持 Web 服务监听 127.0.0.1（`--host 0.0.0.0` 被内核拒绝），手机通过 USB `adb reverse tcp:<port> tcp:<port>` 或 SSH 隧道（`ssh -L <port>:127.0.0.1:<port> user@host`）访问。配对页在回环绑定时会把 127.0.0.1 地址放在二维码候选首位并给出提示。

## 安装到 dsh web profile

```bash
cd ~/code/dsh-remote-control-bridge
pnpm build
cd ~/.dsh/profiles/web
dsh plugin --profile web add file:~/code/dsh-remote-control-bridge
```

（`dsh plugin` 会把包加入 profile 的 `package.json` dependencies，并 append 到 `dsh.profile.bundles`。改完插件需重启 `dsh web` 生效。）

## 认证

- 默认无 token（信任 dsh web server 的 loopback 绑定）。
- 设 `DSH_REMOTE_TOKEN` 后，客户端需在 `?token=` 或 `Authorization: Bearer` 提供。
- `?pair=` 一次性配对 token 与 `?token=` 设备长期 token 也受支持。

## 依赖的 dsh API（已验证）

- `ctx.agents.list()` / `ctx.sessions.list()`
- `ctx.workspaceRegistry.list()`（工作区分组）
- `ctx.sessionTitle.get(session)`（会话显示名）
- `agent.followup(createUserMessage({ content, source:{kind:'user'} }))`
- `agent.cancel({ kind: 'user' })`
- `ctx.on('session/event', (session, event) => …)`（含 `session/title` 事件）
- `ctx.on('agent/status', ({ agent, status }) => …)`
- `ctx.on('approval/request', async (req, next) => …)`
- `ctx.webServer.register(route)` / `ctx.webServer.registerUpgrade(route)`
- `ctx.webServer.port` / `ctx.webServer.host`（配对二维码生成用）
