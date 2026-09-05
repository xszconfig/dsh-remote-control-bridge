# [BUG] Agent 工具调用无超时导致挂死（lsp_query 卡死 agent 回合 400+ 分钟）

## 元信息

| 项 | 值 |
| --- | --- |
| 状态 | 已修复 |
| 仓库/模块 | 桥（src/lsp.ts / src/debug.ts / src/core.ts） |
| 发现方式 | 用户报告（生产事故） |
| 日期 | 2026-09-05 |
| 相关 commit | `77e4146` |
| 关联文档 | docs/lsp-kotlin-import-fix.md、docs/hot-reload.md、`~/.dsh/kotlin-lsp/UPGRADE-NOTES.md` |

## 背景

bridge 通过 `ctx.tools.register(defineTool(...))` 注入三个 Agent 工具：`lsp_query`（查诊断/
hover/definition/references）与 `debug_start`/`debug_command`（Node Inspector 调试）。DSH 核心
用 `@deepseek-ai/dsh-tool-call-timeout-policy` 作为 `tools/execute` 包装层，对**声明了 `timeoutMs`**
的工具执行协作式超时中止；未声明的工具该策略直接 `return next()`，无任何截止时间。

LSP 侧 `LspManager.request()` 与调试侧 `InspectorSession.send()` 都是「发帧 → 把 settle 钩子塞进
`pending: Map<id, …>` → 等回包才 settle」的 RPC 风格；进程/连接死掉时仅清理 pending，从不 settle。

## 现象

昨晚 Kotlin LSP 服务器进程已退出（bridge 日志 00:15:54：`This build of kotlin-server has expired.
The IDE will now close.`）。随后 `lsp_query` 对已死的服务器发请求并 `await`，在途 Promise 永不落定，
整个 agent 回合卡死 **400+ 分钟**（期间无任何超时/中断手段）。

## 排查过程

1. 确认桥工具定义（src/core.ts ~754-895）无一声明 `timeoutMs`。
2. 查 `@deepseek-ai/dsh-tools` 类型：`ToolDefinition.timeoutMs?: number` 是**声明式**元数据，注册表
   不强制，强制执行靠 `dsh-tool-call-timeout-policy` 包装层——未声明即绕过。
3. 读 `LspManager.request()`：返回的 Promise 只在 `handleMessage` 收到同 id 回包时 resolve；`exit`
   处理器只 `state.pending.clear()`、`killServer` 只 `clear()`，**从不 reject** → await 方无限挂起。
4. 读 `InspectorSession.send()`：`ws.on('close')` / `child.on('exit')` / `dispose()` 同样只
   `this.pending.clear()` 不 reject（`dispose()` 里甚至留了注释承认「挂起 await 的结局与
   pending 永不落定一致」）。

## 根因分析（深层，非表面）

- **表面原因**：`request()/send()` 的在途 Promise 在服务器退出/连接断开时只 `clear` 不 `reject`，
  使 `lsp_query`/`variablesFor`/`stop` 的 `await` 永不落定。
- **深层根因**：这是「**状态归属模型**」缺陷——settle 动作被绑在「回包事件」这一条时间线上，
  而进程存活状态是另一条独立时间线（`exit`/`close`）。当存活时间线先走完，回包时间线不再产生，
  pending 就成了无人认领的孤儿 Promise。正确模型应让 pending 的 settle **从真实进程/连接状态推导**：
  一旦状态进入 dead/closed，主动 reject 所有孤儿，而不是靠「事件对称置清」。
- **第二重失效单点**：工具未声明 `timeoutMs`，使框架级超时策略被绕过——于是进程死亡 + 无策略兜底
  两个单点叠加，最终无限挂起。两者缺一，事故都不会如此严重。

## 解法

- `src/lsp.ts`：`query()` 加内部 10s deadline（`withTimeout`）+ 死进程快速失败（`serverDead` 检查
  `exitCode/signalCode/killed`）；`pending` 改为 `{resolve, reject}`，`exit`/`killServer` 时
  `rejectPending` 主动 reject 所有在途请求（根因修复）。
- `src/debug.ts`：`send()` 的 pending 在 `ws.on('close')`/`child.on('exit')`/`dispose()` 时 reject；
  `command()` 自捕获，避免 void 化调用方产生未处理拒绝。
- `src/core.ts`：`lsp_query`/`debug_start`/`debug_command` 声明 `timeoutMs: 10_000`；
  `debug_command` 的 `variablesFor`/`stop` await 再包 `withTimeout` 兜底。
- `src/deadline.ts`：新增共享 `withTimeout` 软 deadline 助手（超时返回 `onTimeout()`，先完成清定时器）。

### 核心 Code Diff

```ts
// src/lsp.ts —— request() 的 pending 从「只 resolve」改为「可 reject」，退出时统一 reject
-  pending: Map<number, (result: unknown) => void>
+  pending: Map<number, PendingEntry>   // { resolve, reject }

   proc.on('exit', () => {
     ...
-    state.pending.clear()
+    this.rejectPending(state, new Error('server exited'))   // 主动 reject，绝不孤儿
   })

   async query(...) {
     ...
+    if (this.serverDead(state)) return { text: `${lang} 语言服务器已退出` }   // 快速失败
+    return await withTimeout(this.queryInner(...), LSP_QUERY_TIMEOUT_MS,   // 10s 兜底
+      () => ({ text: `LSP 查询超时（10s）：${lang} 语言服务器无响应，可能未启动或已退出` }))
   }
```

```ts
// src/core.ts —— 声明 timeoutMs，让 dsh-tool-call-timeout-policy 生效
   defineTool({
     name: 'lsp_query',
+    timeoutMs: 10_000,
     ...
   })
```

- 提交哈希：`77e4146`（main）。
- 回归测试：`pnpm test` 132/132 全绿（hotreload 6 + smoke 126）；新增 `src/deadline.ts` 的
  `withTimeout` 由 lsp/debug/core 三处调用覆盖；离线 smoke 的 LSP mock 不受影响。

## 后续改进计划

- 待办：用最小 node 脚本对「已退出的 Kotlin 服务器」直接调 `lsp.query` 验证 ~10s 内返回超时文本
  （热重载上线后执行）。
- 待办：`~/.dsh/kotlin-lsp` 的 EAP 二进制已过期（见 UPGRADE-NOTES.md 与本次事故），更新二进制属
  另一决策，本 bug 只堵「无超时」这一面。
- 教训推广：任何「RPC 风格 await」都要问一句——**进程/连接死掉时 pending 是否会被 settle？**
  排查清单：① 工具是否声明 `timeoutMs`；② `pending` map 清理时是 `clear` 还是 `reject`；
  ③ 是否从真实存活状态推导 settle，而非依赖回包事件。
