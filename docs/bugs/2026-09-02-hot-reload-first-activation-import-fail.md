# [BUG] 热插拔首次激活 core 加载失败（@deepseek-ai/cordis 解析不到）

## 元信息

| 项 | 值 |
| --- | --- |
| 状态 | 已修复（根治版；运行中 shell 仍需重启一次或靠环境补丁生效） |
| 仓库/模块 | 桥（`src/reloader.ts` `ReloadController` staging 目录 bare import 解析） |
| 发现方式 | 生产部署实锤（0.13.0 首次激活） |
| 日期 | 2026-09-02 |
| 相关 commit | `6d5da59db8e11f7647a6fc399c3552cf88220f4e`（`6d5da59`） |
| 关联文档 | `docs/hot-reload.md`（「bare import 怎么办」与「生产实锤 0.13.0」段落） |

## 背景

- 桥采用「自举热插拔」（Phase B）：`lib/index.js` 是稳定薄壳，`ReloadController`（`src/reloader.ts`）在 reload 时把 `lib/` 里全部 `*.js` 复制进一个**全新的、时间戳命名的 staging 目录**，再 `await import(<staging>/core.js)`，靠「新目录 = 新 ESM 缓存键」实现整体热换。
- `core.js` 里有 bare import：`ws` / `qrcode` / `@deepseek-ai/*`（如 `@deepseek-ai/cordis`）。staging 目录在部署包目录树之外，向上找不到 node_modules，所以复制时要在 staging 目录内补一个 node_modules 解析入口。
- **历史缺陷（旧补丁的假设）**：旧实现 `findNodeModules` **只向上找最近的第一个 `node_modules`**，把它整体 symlink 进 staging——这个「就近单链」假设在 npm 扁平 node_modules 下成立，但在 pnpm 分层布局下不成立。

## 现象

- 0.13.0 首次部署重启后，shell 正常起来，但 `core` import 失败，报错：

  ```
  ERR_MODULE_NOT_FOUND: Cannot find package '@deepseek-ai/cordis'
  imported from ~/.dsh/bridge-reload/<ts>/core.js
  ```

- 连锁表现：`health` 无响应（core 路由未注册，业务没起来）、`/remote/hot` 显示 `lastError`、客户端连不上。
- 触发条件：**首次激活**必现（旧进程没有薄壳，部署完 0.13.0 后重启 DSH 让薄壳加载，此时 `initialLoad` 走 `copyFiles` 补 node_modules，就踩中「只链近层」）。

## 排查过程

- 看报错路径 `~/.dsh/bridge-reload/<ts>/core.js`，先确认 staging 目录结构：`core.js` 已复制到位，但 `staging/node_modules` 是「指向最近一层 node_modules」的单个 symlink。
- 对照 pnpm 的实际布局：近层 `~/.dsh/profiles/web/node_modules` 里只有 `qrcode` / `ws` 等，而 `@deepseek-ai/*` 运行时包在远层 `~/.dsh/profiles/node_modules`——即「就近第一层」根本不包含 `@deepseek-ai/cordis`。
- 锁定根因：Node 的 bare import 解析是「从导入文件所在目录**逐层向上**检查每一个 `node_modules`」，而旧实现只复刻了「第一层命中」这半个语义，没复刻「逐层向上继续找」的完整语义。
- 现场应急：临时给部署包内加了 3 个绝对路径 symlink（把远层 `@deepseek-ai/*` 额外链接进近层），配合 `POST /remote/reload` 免重启恢复，先让生产可用。

## 根因分析（必须挖到深层，不允许停留在表面现象）

- **表面原因**：`findNodeModules` 只返回向上最近的第一个 `node_modules`，pnpm 分层布局下 `@deepseek-ai/*` 在更远的层，近层缺失 → staging 里 `import '@deepseek-ai/cordis'` 解析不到，`ERR_MODULE_NOT_FOUND`。

- **深层根因（模型缺陷）**：staging 目录是「部署目录树之外」的**全新路径**，它的 node_modules 解析链**不等于**部署包原位的解析链。旧实现用一个「就近单链」的简化假设去**模拟** Node 的解析，而该假设只对「扁平 node_modules（所有依赖挤在一层）」成立；pnpm 把依赖**分层存放**（近层只有 `qrcode`/`ws`，远层 `profiles/node_modules` 才有 `@deepseek-ai/*`），「就近第一层」就漏掉了远层包。正确模型不是「链最近的第一个」，而是**复刻 Node 的完整逐层解析语义**——收集**所有**祖先 `node_modules`、按近→远合并、同名近层优先。本质上是「用一个简化模型去替代真实解析器语义」导致的偏差：**当底层机制（Node 模块解析）有精确定义时，模拟它就必须复刻完整语义，而不是抓一个特例**。

- **可推广教训**：凡是「在新路径上重建依赖/import 解析」的场景（staging、打包、动态 import、`NODE_PATH` 类机制），都必须问「原位的解析链是什么、我的重建是否逐层等价」，尤其要警惕包管理器（pnpm 分层/yarn PnP/npm workspaces）改变 node_modules 布局后，所有「就近单链」类假设全部失效。symlink 合并时还要处理「悬空链接也算已存在」（`entryExists` 用 `lstatSync` 不跟随链接），否则同名冲突判断会误判。

## 解法

- 方案说明：`collectNodeModules` 从 `srcDir` 向上收集**每一个**祖先 `node_modules`（直到文件系统根）；staging 的 `node_modules` 建成**真实目录**，按最近→最远遍历，把每一层的**顶层条目** symlink 进来，**同名条目先到先得、后到跳过**（近层优先），与 Node 从导入文件向上逐层检查的「最近命中」语义一致；单个 symlink 失败（EEXIST/EPERM/平台不支持）只跳过该条目、不中断复制。`entryExists` 用 `lstatSync` 判断（不跟随链接，悬空链接也算已存在）。

- **核心 Code Diff**（`git show 6d5da59 -- src/reloader.ts` 关键几行 before/after）：

```diff
-/** 从 from 起向上找最近的 node_modules（供 staging 目录链接 bare import 用）。 */
-function findNodeModules(from: string): string | null {
+/**
+ * 从 from 起向上收集**每一个**祖先 node_modules（最近优先）。
+ * …pnpm 分层存放使 @deepseek-ai/* 在远层（profiles/node_modules）而近层（web/node_modules）缺失…
+ */
+function collectNodeModules(from: string): string[] {
+  const found: string[] = []
   let dir = from
   while (true) {
     const nm = join(dir, 'node_modules')
-    if (existsSync(nm)) return nm
+    if (existsSync(nm)) found.push(nm)
     const parent = dirname(dir)
-    if (parent === dir) return null
+    if (parent === dir) return found
     dir = parent
   }
 }
+
+/** 判断 p 处是否已存在任意条目（不跟随符号链接，悬空链接也算已存在）。 */
+function entryExists(p: string): boolean {
+  try {
+    lstatSync(p)
+    return true
+  } catch {
+    return false
+  }
+}
@@
 async function defaultCopyFiles(srcDir: string, destDir: string): Promise<void> {
   mkdirSync(destDir, { recursive: true })
@@
     if (!name.endsWith('.js')) continue
     copyFileSync(join(srcDir, name), join(destDir, name))
   }
-  const nm = findNodeModules(dirname(srcDir))
-  if (nm !== null) {
+
+  const nms = collectNodeModules(dirname(srcDir))
+  if (nms.length === 0) return
+
+  const nmDest = join(destDir, 'node_modules')
+  try {
+    mkdirSync(nmDest, { recursive: true })
+  } catch {
+    return // 建目录失败（权限等）：放弃链接，不中断复制
+  }
+  for (const nm of nms) {
+    let names: string[]
     try {
-      symlinkSync(nm, join(destDir, 'node_modules'), 'dir')
+      names = readdirSync(nm)
     } catch {
-      // 已存在或平台不支持符号链接：忽略，等下一次 reload 重试
+      continue
+    }
+    for (const entry of names) {
+      const linkPath = join(nmDest, entry)
+      if (entryExists(linkPath)) continue // 同名已存在：近层优先，跳过远层同名条目
+      try {
+        symlinkSync(join(nm, entry), linkPath, 'dir')
+      } catch {
+        // EEXIST / EPERM / 平台不支持符号链接：跳过该条目，不中断复制
+      }
     }
   }
 }
```

- 提交哈希：`6d5da59db8e11f7647a6fc399c3552cf88220f4e`（`6d5da59`，工作树 main）。

- 回归测试（`git show 6d5da59 -- test/hotreload.test.mjs`）：新增用例「两层 node_modules 合并：远层依赖可解析、近层同名优先」——造远层 `root/node_modules`（含 `far-only-dep`、`shared-dep` marker `far`）与近层 `root/a/node_modules`（只含 `shared-dep` marker `near`），core.js 同时 import `far-only-dep` 与 `shared-dep`，断言 applyLog 得到 `v1|from-far-layer|near`（远层可解析 + 近层同名优先），并验证 reload 后同样成立。测试结果 `pnpm test` 两遍 125/125 全绿。

## 后续改进计划

- [ ] **修复属稳定平面（reloader），需下次重启才进入运行中 shell**：`src/reloader.ts` 是 shell 静态缓存的稳定平面，不参与热换；本次修复在当前运行进程里不生效，**当前生产靠环境补丁（部署包内 3 个绝对路径 symlink）生效**。
- [ ] **临时补丁在 pnpm 重装后会消失**：3 个绝对路径 symlink 是手工打的环境补丁，`pnpm install` 重装会清掉；下次重启加载新 shell 后即可移除临时补丁。
- [ ] 教训推广：审计其它「重建 node_modules/依赖解析」的路径（打包、动态 import、工具链），确认 pnpm 分层布局下没有同类「就近单链」假设。
