# [BUG] 排队消息消费后 2 秒窗口内被「恢复逻辑」误判丢失而重复注入

## 元信息

| 项 | 值 |
| --- | --- |
| 状态 | 已修复 |
| 仓库/模块 | 桥（`src/core.ts` 排队消息持久化 + 恢复巡检） |
| 发现方式 | 服务端日志告警（生产日志时间线） |
| 日期 | 2026-09-02 |
| 相关 commit | `cc35dc86e860da58e506eb1ffa248f0c2662f890`（`cc35dc8`） |
| 关联文档 | `docs/bugs/_TEMPLATE.md`；`src/core.ts` 自动续跑（`tryResumeIfPending`/`resumeTick`）同源设计 |

## 背景

- 排队消息（queue）需要跨重启恢复：消息入队后写入磁盘快照（`work.json` 的 `queues` 字段），重启后由 `restoreQueueIfLost` 对比「磁盘快照」与「活队列（live agent 的 queueItems）」，「快照里有、活队列里没有」的消息被判定为「重启丢失」，用 `followup` 重新注入，恢复完清掉该快照。
- 为减少写盘频率，快照写入做了 **2000ms 防抖**（`scheduleQueueSnapshot` 用 `setTimeout` 挂起写入，重复触发会清掉旧定时器重新计时）。
- 设计意图：**防重复**——快照是「活队列已消费」的兜底镜像，只有真丢了（活队列没了）才重新注入。

## 现象

- 服务端日志出现「同一批排队消息被反复重新注入」：消息本已被 agent 消费掉，但随后又被 followup 重发一次，用户（模型）会重复执行同一件事。
- 日志时间线（seq 为消息序号）：`seq 2915` 被消费 → 仅 **1.465s** 后 `seq 2917` 被「恢复逻辑」误判为丢失而重新注入 → 同一窗口内循环重注入 `seq 3172 / 3202 / 3220 / 3230`（多次）。
- 关键证据点：**消费与误恢复之间只隔 1.465s < 2000ms**——正好落在快照防抖窗口之内。

## 排查过程

- 观察到重复注入日志后，先对齐时间线：`seq 2915` 消费 → 1.465s 后 `seq 2917` 误恢复注入，间隔明显小于 2000ms，怀疑与「快照防抖」有关。
- 排除「真的重启丢失」：该窗口内进程并未重启，live agent 仍持有消息，只是磁盘快照还没刷新——不是丢失。
- 读 `restoreQueueIfLost`：它直接从 `work.json` 读快照、与活队列做差集；而快照写入是 `setTimeout(2000)` 防抖挂起的。锁定竞态：**消息刚被消费、`scheduleQueueSnapshot` 尚未到期写盘**时，磁盘里还是「含旧消息」的陈旧快照，恢复巡检（`resumeTick` 每 20s + `agent/status running` 即时触发）一旦在这 2s 窗口内跑一次，就会把「已消费」误判为「丢失」→ 重复注入。
- 更隐蔽的放大点：`followup` 会同步唤醒 idle agent → 触发 `agent/status running` → 再次调用 `restoreQueueIfLost`，形成同窗口内的循环重注入（与 `tryResumeIfPending` 的重入路径同款）。

## 根因分析（必须挖到深层，不允许停留在表面现象）

- **表面原因**：`restoreQueueIfLost` 读的是「2000ms 防抖尚未刷新的磁盘快照」，把它当成活队列的权威事实来对比，在防抖窗口内产生「已消费 vs 旧快照」的假差异，触发重复注入。

- **深层根因（状态归属模型缺陷）**：磁盘快照是**异步防抖写的「滞后镜像」**，而恢复逻辑却把它当作**权威事实**直接与活队列对比——**两个数据源（磁盘滞后镜像 vs 内存活队列）之间的时间一致性没有任何保证**。这是一个典型的「把派生/缓存状态当单一事实源」的模型错误：
  - 快照本质是「活队列的持久化投影」，它永远是滞后的、可能陈旧的；真正的权威事实是内存里的活队列。
  - 而 `restoreQueueIfLost` 把投影当成了主比对方，等于在「投影还没追上现实」的窗口里做判断，天然会误判。
  - 正确姿势只有两条：**（a）对比前先 flush**（把挂起的写入立即落盘，让投影追上现实），或 **（b）快照只做兜底、以活队列为主**（只认「活队列确认没有」才恢复，且恢复前不依赖陈旧投影）。
  - 本修复选了（a）：`restoreQueueIfLost` 比对前先 `flushQueueSnapshot`，把投影与现实的时序差距收敛到「一次同步 flush」。

- **可推广教训**：任何「防抖/异步/缓存」写出的状态，都不能直接被当作「权威事实」参与另一条时间线的判断；对比两个数据源前必须先消除两者的时间差（flush / 等待 / 只读权威源）。这条和 `tryResumeIfPending` 的「指纹幂等」是同一类问题：**异步投影必须显式与权威状态对齐，而不是被当作独立事实源**。

## 解法

- 方案说明：让恢复逻辑在对比前先把该会话「挂起的（防抖未到期）快照写入」立即 flush 落盘，使磁盘状态追上真实活队列，再读盘对比——这样「已消费」的消息在快照里也已经被移除，不会再被误判为「丢失」。顺带把 `queueSnapTimers` 从 `Map<string, Timeout>` 改成 `Map<string, { timer, items }>`，因为 flush 需要拿到「挂起时准备写入的那批 items」，并同步适配 `dispose` 里的清理。

- **核心 Code Diff**（`git show cc35dc8 -- src/core.ts` 关键几行 before/after）：

```diff
-  const queueSnapTimers = new Map<string, NodeJS.Timeout>()
+  const QUEUE_SNAPSHOT_DEBOUNCE_MS = 2000
+  const queueSnapTimers = new Map<string, { timer: NodeJS.Timeout; items: QueueItemWire[] }>()
+  const writeQueueSnapshot = (sessionId: string, items: QueueItemWire[]): void => {
+    try {
+      const work = loadWorkState(WORK_FILE)
+      const queues = { ...(work?.queues ?? {}) }
+      queues[sessionId] = {
+        items: items.map((i) => ({ id: i.id, placement: i.placement, text: i.text })),
+        at: Date.now(),
+      }
+      writeWorkState(WORK_FILE, { queues })
+    } catch (e: unknown) {
+      logger.warn('QUEUE', `队列快照写入失败 session=${sessionId.slice(0, 12)}: ${String(e)}`)
+    }
+  }
+  /** 立即把挂起的（防抖未到期）快照写盘，使磁盘状态追上真实队列；无挂起则不动。 */
+  const flushQueueSnapshot = (sessionId: string): void => {
+    const pending = queueSnapTimers.get(sessionId)
+    if (pending === undefined) return
+    clearTimeout(pending.timer)
+    queueSnapTimers.delete(sessionId)
+    writeQueueSnapshot(sessionId, pending.items)
+  }
   const scheduleQueueSnapshot = (sessionId: string, items: QueueItemWire[]): void => {
     const prev = queueSnapTimers.get(sessionId)
-    if (prev !== undefined) clearTimeout(prev)
-    const t = setTimeout(() => {
+    if (prev !== undefined) clearTimeout(prev.timer)
+    const timer = setTimeout(() => {
       queueSnapTimers.delete(sessionId)
-      try {
-        const work = loadWorkState(WORK_FILE)
-        const queues = { ...(work?.queues ?? {}) }
-        queues[sessionId] = {
-          items: items.map((i) => ({ id: i.id, placement: i.placement, text: i.text })),
-          at: Date.now(),
-        }
-        writeWorkState(WORK_FILE, { queues })
-      } catch (e: unknown) {
-        logger.warn('QUEUE', `队列快照写入失败 session=${sessionId.slice(0, 12)}: ${String(e)}`)
-      }
-    }, 2000)
-    t.unref?.()
+      writeQueueSnapshot(sessionId, items)
+    }, QUEUE_SNAPSHOT_DEBOUNCE_MS)
+    timer.unref?.()
+    queueSnapTimers.set(sessionId, { timer, items })
   }
@@
   const restoreQueueIfLost = (sessionId: string): void => {
     if (restoringSessions.has(sessionId)) return
+    // 先 flush 防抖窗口内挂起的快照写入，避免按「已消费、尚未刷新」的陈旧快照误判为丢失而重复注入。
+    flushQueueSnapshot(sessionId)
     try {
       const work = loadWorkState(WORK_FILE)
       const snap = work?.queues?.[sessionId]
@@
-    for (const t of queueSnapTimers.values()) clearTimeout(t)
+    for (const t of queueSnapTimers.values()) clearTimeout(t.timer)
     queueSnapTimers.clear()
```

- 提交哈希：`cc35dc86e860da58e506eb1ffa248f0c2662f890`（`cc35dc8`，工作树 main）。

- 回归测试（`git show cc35dc8 -- test/smoke.mjs`）：新增断言「防抖窗口内被消费的消息不被重复恢复注入」——先直接向 `work.json` 写入一条「已消费」消息的陈旧快照（模拟 2s 防抖尚未刷新的状态），触发 `session/event`（spliced）让 `scheduleQueueSnapshot` 挂起当前真实队列的快照，再在防抖窗口内触发 `agent/status running`（`restoreQueueIfLost`），断言 followup 里**不出现**该「已消费」消息。

## 后续改进计划

- [ ] **消息幂等键（`clientMsgId`）仍在待议**：本修复堵住了「陈旧快照 vs 活队列」的竞态，但若未来引入更多「多源恢复」路径，仍建议给每条排队消息加客户端幂等键，让重复注入在消费端可去重（纵深防御）。
- [ ] **`work.json` 原子写待做**：当前 `writeWorkState` 非原子写（直接覆写），flush 与常规防抖写并发时仍可能有一方读到半写状态；建议改为「临时文件 + rename」原子写，进一步消除快照一致性风险。
- [ ] 教训推广：审计其余「异步防抖/缓存写入」的地方（如 `resumeFingerprint`、会话列表合并持久化层），确认没有另一处把「滞后投影」当权威事实去对比。
