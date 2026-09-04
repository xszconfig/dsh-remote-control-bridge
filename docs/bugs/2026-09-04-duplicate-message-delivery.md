# [BUG] 子代理收尾消息在会话里被重复送达多次（「重复送达，已忽略」）

## 元信息

| 项 | 值 |
| --- | --- |
| 状态 | 已修复（待主对话提交后回填哈希） |
| 仓库/模块 | 桥（`src/core.ts` 排队消息持久化 + 恢复巡检 `restoreQueueIfLost`） |
| 发现方式 | 用户报告（主对话观察到「同一段内容消息重复出现，回复多次『（重复送达，已忽略）』」） |
| 日期 | 2026-09-04 |
| 相关 commit | `<待回填>`（工作树 main，未提交） |
| 关联文档 | `docs/bugs/2026-09-02-queue-snapshot-debounce-race.md`（同源前置修复 `cc35dc8`）；`docs/bugs/message-source-classification.md` |

## 背景

- 桥的「排队消息持久化」机制：`agent/inbox/spliced` 事件触发时，用 `queueItemsOf(agent)` 把父 agent 的 inbox（`nextTurn` 排队队列 + `nextStep` 插队/上下文）投影成列表，广播给手机展示，并**写入 `work.json` 的 `queues` 快照**；重启后 `restoreQueueIfLost` 对比「磁盘快照」与「活队列」，「快照有、活队列没有」的消息被判定为「重启丢失」→ 用 `agent.followup(createUserMessage({... source:{kind:'user'}}))` 重新注入。
- 该机制的**原始设计意图**：只兜底「用户从手机发的排队消息」在进程重启/agent 晚挂载时丢失。快照防抖 2000ms、恢复前 flush 等（`cc35dc8`）都是围绕这一意图打的补丁。
- DSH 子代理框架（`dsh-subagent`）在子代理完成时会向父会话投递两类消息：`subagent-report`（子代理调 report 工具的回传）与 `subagent-settled`（收尾通知，含 "Background subagent … finished … Its closing message: …"）。它们与真实用户消息一样会进入父 agent 的 inbox。

## 现象

- 最近一天内，子代理「收尾消息/报告」被重复送达：转盘设计子代理（`dc3c566a`）的收尾消息（含「设计方案已完成并通过 report 回传给父代理」「需用户拍板的 5 个取舍」）被**多次**送达（主对话回复了至少 6~7 次「（重复送达，已忽略）」）；Jugg 调研子代理（`62cef193`）的收尾消息送达 2 次。
- 会话日志（DSH 权威记录 `~/.dsh/sessions/…/session-ab787050-ebad-40ed-8013-83859ddbc88e/session.jsonl.zstd`）显示「设计方案已完成」这条收尾消息被**反复落库**，**每次 `seq` 都不同**：
  - 首次：`seq=2020183`，`source.kind="subagent-settled"`（DSH 框架 `notifySettlement` 的正常通知，只该发生一次）。
  - 重复：`seq=2021573 / 2021782 / 2021883 / 2021949 / 2021997 / 2022016 / 2027036`，**`source.kind="user"`**，内容与首次完全一致（含 "Background subagent dc3c566a … Its closing message: 设计方案已完成…"）。
  - 时间间隔 ~20~28s（`02:44:42 → 02:46:00 → 02:46:20 → 02:46:42 → 02:47:08 → 02:47:37 → 02:47:58 → 02:52:50`），与桥的 `resumeInterval = setInterval(resumeTick, 20_000)` 高度吻合。
- 主会话 sessionId = `session-ab787050-ebad-40ed-8013-83859ddbc88e`。

## 排查过程

1. **桥日志**（`curl http://127.0.0.1:3080/remote/logs`，live 0.13.0，环形缓冲 2000 条，消息正文不落日志）：无正文关键词命中，只有结构化 debug 行。观察到 `inbox/spliced(deferred)` **成对出现**（如 seq 301/303），初步怀疑「订阅叠加」。
2. **DSH 会话日志**（解压 `session.jsonl.zstd`，157374 行）：按关键词「设计方案已完成 / 回传给父代理 / 调研完成 / 有条件可行 / LSP 编译错误」检索，**拿到关键证据**：
   - 转盘设计收尾消息：首次 `subagent-settled`（seq 2020183）＋ **7 次 `source.kind="user"` 重复**（seq 各不相同）。
   - 每次重复前都有一条 `agent/inbox/spliced`（target=next-turn, inserted=收尾消息）→ 说明**收尾消息被反复 splice 回父 inbox**。
   - Jugg 子代理：`subagent-report`（seq 2151622，含「有条件可行」）＋ `subagent-settled`（seq 2152613，含「调研完成」）**各只投递一次**——「送达 2 次」实为「report + 收尾」两条不同消息，主对话把收尾误认作重复（非桥重复，属 DSH 框架的 report+closing 双投递语义）。
3. **判定重复发生层**：
   - `source.kind="user"` 的重复消息，其 content 与 `subagent-settled` 通知**逐字一致**（连 "Background subagent … finished" 前缀都在）——只有桥的 `restoreQueueIfLost`（`agent.followup(createUserMessage({... source:{kind:'user'}}))`）会以「user」身份重放这段内容。
   - 20~28s 间隔 = `resumeTick` 每 20s 巡检 `restoreQueueIfLost`。
   - **排除「桥重复投影/重播」**：MUX 帧统计里 `session/event ≈ session/projection`（如 296/296、556/556），没有 N 倍放大。
   - **排除「订阅叠加」**：`inbox/spliced(deferred)` 成对是 DSH 对同一条消息的 `insert`（inserted=1）＋ `claim`（inserted=0）两个**合法** `agent/inbox/spliced` 事件各触发一次 handler，不是同一事件触发两次（会话日志可对上：seq 2152609 insert / 2152611 claim ↔ 桥日志 301/303）。热重载的 `prevFiber.dispose()` → `ctx.plugin()` 子 fork dispose 会反注册 `ctx.on`，无残留订阅。
4. **时间窗对照**：转盘设计重复发生在 **09-02 02:44~02:52**，早于 `cc35dc8`（09-02 03:28）——当时还是「防抖竞态」的旧代码；当前进程（09-03 01:15 boot）里的子代理收尾（如 dc3c566a 在 09-03 01:00 的 report+settled）**各只投递一次**，说明 `cc35dc8` 已堵住时序竞态，但**没堵住「框架消息被纳入队列快照」这一归属层缺口**。
5. **代码定位**：`queueItemsOf`（`src/core.ts:930`）把 `nextTurn` 与 `nextStep` 的**所有**消息都纳入投影/快照；`nextStep` 里 `source.kind !== 'user'` 的被标成 `placement='context'`，但 `nextTurn` 里的框架消息（父 idle 时收尾经 `followup` 进 nextTurn）会被标成 `placement='queued'`。快照写入（`scheduleQueueSnapshot`）与恢复对比（`restoreQueueIfLost`）用的都是这个全量列表。

## 根因分析（必须挖到深层，不允许停留在表面现象）

- **表面原因**：子代理收尾通知（`source.kind="subagent-settled"`）随 inbox splice 进入父队列投影，被 `queueItemsOf` 写进 `work.json` 快照；收尾被父 agent 消费后，`restoreQueueIfLost` 在 20s 巡检里发现「快照有、活队列没有」→ 判定「丢失」→ 用 `followup` 以用户身份重注入，于是同一条收尾消息每 20s 被「恢复」一次。

- **深层根因（状态归属模型缺陷）**：**「排队消息快照」被当成了 inbox 的通用镜像，而不是「真实用户排队消息」的专属状态。**
  - inbox 里的消息有两类，生命周期与恢复语义完全不同：① **用户排队消息**（`source.kind="user"`，手机发来、等待消费）——需要跨重启持久化与恢复；② **框架注入消息**（`subagent-settled` / `subagent-report` / LSP 反馈 `plugin` 等）——瞬态、一次性，消费完就该消失，**绝不能**被当作「丢失的排队消息」重新注入。
  - `queueItemsOf` 不区分这两类，把 inbox 的「展示投影」直接复用作「持久化/恢复的事实源」，于是框架消息被错误地赋予「可恢复」状态，构成重复送达的温床。
  - `cc35dc8` 只修了「**时序**」（防抖窗口内陈旧快照 vs 活队列的竞态，用 flush 对齐），没修「**归属**」（框架消息根本不该进快照）。这是同一模型缺陷的两个切面：一个数据源（inbox 全量投影）同时服务「展示」和「恢复」两个目标，目标语义冲突时打补丁只能缓解、无法根治。

- **可推广教训**：**一个持久化快照/投影必须明确它归属哪类状态，绝不能把「供展示的全量投影」直接当「供恢复的权威状态」**。恢复类状态应只包含「真正需要跨时间线续命的实体」（用户消息），并把瞬态框架消息排除在归属之外。这与 `cc35dc8` 的教训（异步投影不能当权威事实）互补：前者讲「时序对齐」，本条讲「归属筛选」。

## 解法

- 方案说明：把「展示投影」与「持久化投影」拆开。展示仍用 `queueItemsOf`（保留 `context` 行，手机端「🔧上下文」标签不回归）；**快照写入与恢复对比改用新的 `userQueueItemsOf`，只收 `source.kind === 'user'` 的消息**——框架消息从此不进 `work.json`，也就不可能被「恢复」重注入。另在 `restoreQueueIfLost` 注入循环里加 `placement === 'context'` 防御，兜住修复前已写入的陈旧快照。

- **核心 Code Diff**（`src/core.ts`）：

```diff
   /** 排队消息投影（与桌面端 session/queue 同源）：nextTurn → queued，nextStep → steering/context。 */
   const queueItemsOf = (agent: Agent): QueueItemWire[] => [ ... ]
+
+  /**
+   * 排队消息持久化投影：只保留真实用户来源（source.kind === 'user'）的消息，用于 work.json 快照
+   * 与重启恢复。子代理收尾通知（subagent-settled）、报告回传（subagent-report）、LSP 反馈等框架
+   * 注入消息是瞬态的——它们随 inbox splice 进入队列投影；若一并写入快照，一旦被消费就会在 20s
+   * 巡检（restoreQueueIfLost）里被误判为「重启丢失」→ 以用户身份 followup 重注入，导致同一条
+   * 子代理收尾消息在会话里被重复送达多次。展示仍用 queueItemsOf（含 context 行），持久化/恢复
+   * 只用 userQueueItemsOf。
+   */
+  const userQueueItemsOf = (agent: Agent): QueueItemWire[] => [
+    ...agent.inbox.nextTurn.filter((m) => m.source.kind === 'user').map((m) => ({
+      id: m.id,
+      placement: 'queued' as const,
+      text: truncateResult(extractText(m.content)),
+    })),
+    ...agent.inbox.nextStep.filter((m) => m.source.kind === 'user').map((m) => ({
+      id: m.id,
+      placement: 'steering' as const,
+      text: truncateResult(extractText(m.content)),
+    })),
+  ]

   const restoreQueueIfLost = (sessionId: string): void => {
     ...
-    const live = queueItemsOf(agent)
+    const live = userQueueItemsOf(agent)
     ...
       for (const it of missing) {
+        // 防御：context 行是框架注入（子代理收尾/报告/LSP 反馈等），绝不作为用户消息重注入。
+        // 即便存在修复前写入的陈旧快照，也一并兜底阻断重复送达。
+        if (it.placement === 'context') continue
         agent.followup(createUserMessage({ content: [{ type: 'text', text: it.text }], source: { kind: 'user' } }))
       }

   // agent/inbox/spliced 处理器内：
     broadcast({ type: 'session_queue', sessionId: String(session.id), items })
-    scheduleQueueSnapshot(String(session.id), items)
+    // 持久化快照只收用户来源消息（子代理收尾/报告等框架注入不入快照，见 userQueueItemsOf）
+    scheduleQueueSnapshot(String(session.id), userQueueItemsOf(agent))
```

- 提交哈希：`<待回填>`（工作树 main，主对话验收后提交）。

- 回归测试（`test/smoke.mjs`）：新增断言「子代理收尾通知不入队列快照（防重复恢复注入根因）」——把一条 `source.kind="subagent-settled"` 的收尾消息塞进 live inbox 的 `nextStep`，触发 `agent/inbox/spliced`，等 2s 防抖落盘后断言 `work.json` 的该会话快照**不含**该收尾消息（修复前会以 `placement='context'` 写入）。

## 后续改进计划

- [ ] 回填 commit 哈希（主对话验收提交后）。
- [ ] **消息幂等键（`clientMsgId`）**：仍建议给每条用户排队消息加客户端幂等键，让重复注入在消费端可去重（纵深防御，与 `cc35dc8` 的待办一致）。
- [ ] **`work.json` 原子写**：当前非原子覆写，flush 与常规防抖写并发时可能读到半写状态；改「临时文件 + rename」。
- [ ] **审计同类「展示投影复用为恢复状态」**：检查 `resumeFingerprint`（自动续跑）是否也有把「派生投影」当权威状态的情况；确认队列快照的归属边界（只用户消息）在其它入口（如 `subscribe` 返回的 queue）不产生新歧义。
- [ ] 关联现象备注：LSP 反馈注入「【LSP 编译错误】」在本会话排查时仍会对 `test/smoke.mjs` 的 `mkWarn` 行（含中文字符串的箭头函数）报 **7 个假阳性解析错误**（`node --check` 通过、测试全绿），属 tsserver 对 `.mjs`+中文的误报，非本次重复送达根因，单独记录待查。
