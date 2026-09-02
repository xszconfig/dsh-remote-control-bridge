# [BUG] 注入的上下文消息在手机上被误渲染成用户消息气泡

## 元信息

| 项 | 值 |
| --- | --- |
| 状态 | 已修复 |
| 仓库/模块 | 桥（src/protocol.ts、src/core.ts）+ App（protocol/Protocol.kt、App.kt） |
| 发现方式 | 用户报告 |
| 日期 | 2026-09-03 |
| 相关 commit | 见「解法」提交哈希 |
| 关联文档 | 铁律 6（所有数据以服务端投影为准） |

## 背景

桥把 DSH 会话日志投影成 wire 事件给手机端渲染。`projectEvent` 对 `user/message`
节点只做一件事：抽文本 → 打 `type: 'user_message'`，**不看**节点携带的 `source` 元数据。
而 DSH 的 `user/message` 节点既承载「真实用户输入」，也承载「注入的上下文/系统消息」
（`agent.inject()` 的 AGENTS.md `<system-reminder>`、LSP 编译错误反馈、文件变更通知、
cron、技能内容、压缩检查点、session 起始提醒、目标续跑轮次等），两者唯一区别就是
`data.source.kind`。桥侧漏掉这个判别 → 手机端把所有 `user_message` 一律画成「你」的用户气泡。

## 现象

手机上「Agent 上下文注入消息」被渲染成「用户消息气泡」。典型：
- `<system-reminder>Updated instructions from: AGENTS.md ...</system-reminder>` 显示为右侧蓝色「你」气泡。
- LSP 反馈闭环的「【LSP 编译错误】…」注入消息同样显示为用户气泡。

服务端/Web 端并不这样呈现：Web 用 `ContextMessageNode(kind='context')` +
`ContextInjectionRow`（折叠的「上下文」行，头带 role+producer），绝不与用户消息混同。

## 排查过程

1. 桥 `src/core.ts` `projectEvent` 的 `case 'user/message'`（约 2645 行）只 `extractText`，
   无 source 透传（`src/protocol.ts` 的 `EventProjection` 亦无 source 字段）。
2. 查 DSH 会话类型定义（桥 node_modules `@deepseek-ai/dsh-session` `lib/types/types.d.ts` 255-262 行：
   `user/message` = `UserMessage`，注释明说「direct human prompt / synthetic agent.inject() context /
   goal continuation round，`source` tells them apart」）。
3. 查 `@deepseek-ai/dsh-llm` `lib/types/message.d.ts`：`MessageSourceMap` =
   `user(kind:'user')` | `plugin(kind:'plugin', plugin, form)` | `model` | `tool`；
   `ContextForm` = instructions/catalog/snapshot/notice/relay/recall。
   即权威判别字段 = `UserMessage.source.kind`。
4. 桥自己的 LSP 反馈注入（`src/core.ts` 717-725 行）正是用
   `createUserMessage({ source: { kind: 'plugin', plugin: 'dsh-remote-control-bridge', form: 'notice', ... } })`，
   而投影处却把这条 node 判成 user —— 证据闭环。
5. Web 端语义（profile `dsh-client-runtime` `conversation.d.ts` + `context-provenance.d.ts`）：
   `kind='user'`→UserMessageNode；`kind='plugin'`/未知 → ContextMessageNode，
   `contextProvenance` 对任何不可读/未知 source 都**降级为 inject**，绝不落回 user。

## 根因分析（必须挖到深层，不允许停留在表面现象）

- 表面原因：桥投影 `user/message` 时未读 `data.source.kind`，把「节点类型」当成「消息角色」，
  丢失了 DSH 日志里已存在的权威分类元数据。
- 深层根因：**单一事实源（DSH 日志的 `source` 字段）在投影边界被丢弃**。桥把「user/message 事件」
  直接等价于「用户消息」，但 `user/message` 是「user-role 消息」的统称，真正的角色语义在
  `source.kind` 里。这是典型的「用事件类型名代替领域分类」的模型缺陷——事件名是通道，`source` 才是身份。
  可推广教训：凡是「同一事件类型承载多种语义」的投影，必须把节点内可区分的权威字段一并透传，
  不能靠事件名推断角色（铁律 6：分类在服务端完成，客户端只渲染）。

## 解法

- 协议：`EventProjection` 增 `source?: 'user' | 'inject'`（增量字段，老 App `ignoreUnknownKeys` 忽略）。
- 桥投影：`user/message` 按 `data.source.kind === 'user'` → `'user'`，其余（plugin/未知/缺失）→ `'inject'`。
  未知/缺失一律降级为 inject（与 Web `contextProvenance` 一致，绝不误判为用户）。
- App 渲染：`source == null || 'user'` → 用户气泡（老桥兼容）；其它 → 弱化的 `ContextRow`（「上下文」折叠行）。
  纯函数 `isInjectedUserMessage` 抽离并单测。

核心 Code Diff（桥 core.ts）：
```diff
     case 'user/message': {
       const text = extractText(event.data.content)
       if (!text) return []
-      return [{ ...base, type: 'user_message', text }]
+      // 权威分类：DSH user/message 节点 source.kind 是唯一判别元数据
+      const src = (event.data.source as { kind?: unknown } | undefined)?.kind
+      const source: EventSource = src === 'user' ? 'user' : 'inject'
+      return [{ ...base, type: 'user_message', text, source }]
     }
```

- 提交哈希：见本分支 `git log`（fix/message-source）。
- 回归测试：桥 smoke 新增 4 条分类断言（user/AGENTS.md 注入/LSP 注入/无 source 降级）；
  App 新增 `MessageSourceTest`（4 例）。

## 后续改进计划

- 待办：可进一步透传 `source.form`（instructions/notice/recall…）给 App 做更细的「上下文」子标签与图标；
  当前 P0 只需区分 user/inject，form 细分留待后续。
- 教训推广：审计桥 `projectEvent` 其余分支是否同样存在「用事件类型名代替领域分类」的隐患
  （如 assistant/tool 是否也需要透传 source/provenance）。
