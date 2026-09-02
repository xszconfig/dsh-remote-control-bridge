# 桥自身业务代码热插拔（Phase B）

DSH 以 Cordis 插件方式加载本包（profile bundles 里的 `dsh-remote-control-bridge`，入口
`lib/index.js`）。官方 HMR 被禁用，不用它；本方案**纯自举**：进程不重启，桥自身业务代码
（`src/core.ts` 及其全部依赖图）可热替换。

## 机制图（文字版）

```
进程内
  shell  lib/index.js（稳定薄壳，此后几乎不再改）
   ├─ 导出 { name, inject, apply }；apply 为 async 函数
   ├─ ReloadController  lib/reloader.js（稳定平面，DI 可单测）
   │     · initialLoad / reload / startWatcher / stopWatcher / dispose
   │     · 状态字段 reloads / lastReloadAt / lastError / watching / currentVersion
   │     · reload()：copy 暂存 → import 新 core → dispose 旧 fiber → ctx.plugin 新 core
   ├─ 两个自举路由（鉴权与 core 同款 allowLocalOrEnvToken）
   │     · POST /remote/reload   触发热换
   │     · GET  /remote/hot      { ok, shell, reloads, lastReloadAt, lastError, watching, coreVersion }
   ├─ fs.watch(lib/)  debounce ~400ms → reload()
   └─ ctx.effect 清理：逆序释放两路由 disposer → watcher.close → dispose core fiber

  core  lib/core.ts（业务整体，随版本目录热换）
   ├─ name = 'dsh-remote-control-bridge-core'；inject/apply 与原 index.ts 完全一致
   ├─ 相对依赖 ./protocol.js、./lsp.js、./lsp-feedback.js、./debug.js、./work.js、./logger.js、./auth.js
   └─ bare 依赖 ws / qrcode / @deepseek-ai/*（经 staging/node_modules 合并式符号链接解析）

磁盘
  ~/.dsh/bridge-reload/
   ├─ <ts-1>/   上一代（保留，回滚用）
   └─ <ts-2>/   当前代
   （其余删除；每次 reload 的旧 ESM 模块图留在进程模块表，不可回收）
```

**为什么换目录就能整体热换**：ESM 模块缓存按文件 URL 键控。每次 reload 把 `lib/` 里的全部
`*.js` 复制进一个**全新的、以时间戳命名的暂存目录**，再 `await import(<该目录>/core.js)`。
新目录 = 全新缓存键，`core.js` 及其全部**相对静态依赖**（`./protocol.js`、`./lsp.js`、
`./work.js` …）整体换新——core 内部的 `import './x.js'` 一行不用改。

**bare import 怎么办**：`ws` / `qrcode` / `@deepseek-ai/*` 按「从导入文件所在目录向上找
`node_modules`」解析，而暂存目录位于部署包目录树之外，向上找不到。所以复制时额外在暂存目录内
建一个**真实目录** `node_modules`，把**所有**祖先 `node_modules` 的顶层条目合并式符号链接进来
（`ReloadController` 的默认 `copyFiles` 实现完成，见 `src/reloader.ts`）：从 srcDir 向上收集
每一个祖先 `node_modules`（直到文件系统根），按最近→最远遍历，同名条目先到先得、后到的跳过
（近层优先，与 Node 逐层向上解析的「最近命中」语义一致）；单个符号链接失败只跳过该条目。
相对依赖随目录热换，bare 依赖保持固定共享。

> **为什么必须合并而不是单目标链接**：pnpm 把依赖分层存放——近层
> （`~/.dsh/profiles/web/node_modules`）只有 qrcode/ws 等，远层
> （`~/.dsh/profiles/node_modules`）才有 @deepseek-ai/* 运行时包。若只链最近的一层，
> `import '@deepseek-ai/cordis'` 会解析失败（ERR_MODULE_NOT_FOUND）。合并所有层才能让
> 「staging 目录外的 import」解析等价于「部署包原位」的解析。

> **生产实锤（0.13.0）**：0.13.0 首次激活时因上述单目标链接缺陷，`@deepseek-ai/*` 解析失败、
> core 加载失败；临时用环境补丁（额外把远层 @deepseek-ai 链接进近层）恢复；本合并式修复为根治版。

## 部署流

```bash
# 1. 编译（repo 内）
pnpm build

# 2. 覆盖部署目录的 lib（本例 profile 为 web）
cp -R lib/* ~/.dsh/profiles/web/node_modules/dsh-remote-control-bridge/lib/

# 3a. watcher 自动触发（默认开启，debounce ~400ms）
#     或
# 3b. 本机 loopback 手动触发（或带 DSH_REMOTE_TOKEN 的 Authorization: Bearer <token>）
curl -X POST http://127.0.0.1:3080/remote/reload

# 4. 验证：health 版本 + hot 状态
curl http://127.0.0.1:3080/remote/health     # 看 version
curl http://127.0.0.1:3080/remote/hot        # 看 reloads 是否 +1、lastError、coreVersion
```

## 首次激活需重启一次

旧进程里只有 Phase A 的代码（`apply` 即业务本体，没有 shell / ReloadController / 自举路由），
不存在热换入口。**部署完 0.13.0 后必须先重启 DSH 服务端一次**，让薄壳加载进来；此后业务代码
升级才可 `curl -X POST /remote/reload` 免重启热换。

## 回滚语义

- **import 失败**（`core.js` 语法错 / 缺失）：不动旧实例，只记 `lastError`，旧版本继续运行。
- **新 apply 抛错**：先 dispose 旧 fiber → 挂新 core；若新 apply 抛错，用**保留的上一代模块
  引用**重新 `ctx.plugin` 旧模块（旧 fiber 重新可用），并记 `lastError`。
- **reload 重入锁**：进行中再次触发返回 `busy`（HTTP 409）。
- 上一代版本化目录 + 模块引用在成功热换前一直保留，作为回滚兜底。

## 环境变量开关

| 变量 | 作用 |
| --- | --- |
| `DSH_REMOTE_HOT_RELOAD` | `0` 只关 watcher（文件变化不再自动触发），`/remote/reload` 端点仍可用 |
| `DSH_REMOTE_TOKEN` | 非 loopback 请求经 `Authorization: Bearer <token>` 访问 reload/hot 与 core 本地端点 |

## 限制清单

- **改 shell（`src/index.ts`）、auth（`src/auth.ts`）、reloader（`src/reloader.ts`）需重启**：
  这三者是稳定平面，shell 静态缓存、不参与热换。改 `src/auth.ts` 后，shell 自身两个路由仍走
  进程启动时缓存的旧逻辑，直到下次重启；core 侧随版本目录立即换新。
- **旧 ESM 模块图随 reload 累积**：每次热换，旧模块图留在进程模块表（不可回收）。开发期已知可
  接受开销；长期高频 reload 会缓慢增长内存，必要时重启进程回收。
- **暂存目录位置与剪枝**：`~/.dsh/bridge-reload/`（或 `$DSH_HOME/bridge-reload/`），只留
  「当前 + 上一代」，其余自动删除。
- **官方 HMR 被禁用**：不走官方 HMR 链路，纯自举。
- 热换只替换业务代码；**依赖包（node_modules）不随热换更新**——升级依赖仍需重启。
