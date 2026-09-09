# 结果交付通知 wire 契约（服务端补投递，0.15.0）

> 面向 App 域代理的精确 wire 契约：桥（dsh-remote-control-bridge）0.15.0 起把「结果交付通知」的
> 幂等键**服务端权威化**并**持久化补投递**（不丢）。App 侧按本契约消费（`notifiedKeys` 文件持久化 +
> 补发消费 + 确认回传）。字段名/类型/语义以下表为准，不得歧义。

## 1. 背景与语义

- 结果交付通知 = agent 一轮完成（`turn/end`）且本轮有实质产出时，桥生成的一条「结果已就绪」提醒。
- **turnKey 服务端权威**：桥在轮次完成时用 `randomUUID()` 生成，App **不再**从 `turn_status.since` 推导
  （铁律 6：服务端投影为准）。同一「会话×轮次」唯一。
- **不丢**：桥把未确认投递的通知持久化到 `$DSH_HOME/remote-control-deliveries.json`，
  手机重连时经 `hello.pendingDeliveries` 补发；手机确认后桥删除记录。
- **降噪（服务端判定）**：主会话认 `assistant_message`（最终结论）；子代理认非空 `tool_result` 或
  `assistant_message`。无产出的轮次**不**产生通知（App 无需再本地判定 hasDeliverySubstance）。

## 2. 数据类型（TS `src/protocol.ts`，App `Protocol.kt` 镜像）

### 2.1 DeliveryNoticeWire（单条交付通知）

| 字段 | 类型 | 必填 | 语义 |
|---|---|---|---|
| `sessionId` | string | 是 | 会话 id（DSH session id）。 |
| `turnKey` | string | 是 | **服务端权威幂等键**（`randomUUID()`，36 字符）。App 按 `(sessionId, turnKey)` 去重。 |
| `title` | string | 是 | 通知标题，固定 `"结果已就绪"`。 |
| `body` | string | 是 | 通知正文，桥生成：主会话 `「<标题>」本轮已完成`；子代理 `「<标题>」已完成`（无标题时回退 `本轮已完成` / `子代理已完成`）。 |
| `isSubagent` | boolean | 是 | 是否子代理会话（App 据此选通知通道/图标）。 |
| `completedAt` | number | 是 | 轮次完成时间（epoch ms，服务端时钟）。 |

JSON 示例：
```json
{
  "sessionId": "sess-abc123",
  "turnKey": "d2e892e2-98be-43ae-8b9b-50af499f8a95",
  "title": "结果已就绪",
  "body": "「payment」本轮已完成",
  "isSubagent": false,
  "completedAt": 1788971881976
}
```

### 2.2 EvDeliveryNotice（实时事件）

`{ "type": "delivery_notice", "notice": <DeliveryNoticeWire> }`

- 触发时机：agent 轮次完成（`turn/end`）且有产出，实时广播给所有在线手机。

## 3. 下发通道（两条，App 都要消费，靠 (sessionId, turnKey) 去重）

1. **实时**：`delivery_notice` 事件（轮次完成时广播）。
2. **补发**：`hello` 载荷新增 `pendingDeliveries: DeliveryNoticeWire[]`（未确认投递的全量；缺省 = 旧桥无该字段 → App 按空数组处理）。

App 消费流程：收到（实时或补发）→ 按 `(sessionId, turnKey)` 去重（`notifiedKeys` 文件持久化，
与现有 `delivery:{sessionId}:{turnKey}` 键一致）→ 展示系统通知 → **回 `confirm_delivery` 确认**。
若通知被三态门控抑制（前台浏览/勿扰），**仍要回确认**（抑制只是不发系统通知，不代表可丢）。

## 4. 确认命令（Client → Server）

### 4.1 CmdConfirmDelivery

```json
{ "type": "confirm_delivery", "deliveries": [ { "sessionId": "sess-abc123", "turnKey": "d2e892e2-..." } ] }
```

| 字段 | 类型 | 必填 | 语义 |
|---|---|---|---|
| `type` | string | 是 | 固定 `"confirm_delivery"`。 |
| `deliveries` | {sessionId: string, turnKey: string}[] | 是 | 已消费的通知清单（批量）。桥按 `(sessionId, turnKey)` 精确删除台账记录。 |

- 确认是**幂等删除**：重复确认同一键无副作用；确认不存在的键也安全（no-op）。
- 桥不回 ack（无需响应）；确认后 `hello.pendingDeliveries` 不再含该条。

## 5. App 侧实现清单（App 域代理按此实现）

1. `Protocol.kt` 镜像：`DeliveryNoticeWire`（data class）、`DeliveryNotice`（@SerialName "delivery_notice"）、
   `ConfirmDelivery`（@SerialName "confirm_delivery"）、`Hello.pendingDeliveries: List<DeliveryNoticeWire>`。
2. 消费去重：`notifiedKeys` 用 `delivery:{sessionId}:{turnKey}`（**移除旧 `turnStartBySession` 推导逻辑**）。
3. 补发消费：`hello` 到达后遍历 `pendingDeliveries`，与实时 `delivery_notice` 走同一 `onDelivery` 路径。
4. 确认回传：每条消费后 `confirm_delivery`（可批量，去重后一次回传）。
5. 三态门控/勿扰逻辑保留在 App 侧不变，但**抑制通知也要回确认**。

## 6. 兼容性

- 旧桥（<0.15.0）无 `delivery_notice` / `pendingDeliveries` / `confirm_delivery`：App 侧 `ignoreUnknownKeys` +
  空数组兜底；旧 App 收到 `delivery_notice` 会忽略（unknown event），不破坏。
- 桥侧 `EvError` 新增 `msgId?`（可选）：服务端拒绝 `send_message` 时回带 msgId，App 可把失败精确关联回 pending。
