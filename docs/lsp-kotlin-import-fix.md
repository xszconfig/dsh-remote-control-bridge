# Kotlin LSP 诊断失效修复（项目导入 + 根定位）

## 问题现象

手机端 LSP 诊断全是 TS/JS，Kotlin「一个问题都没有」。用带故意类型错误的 `.kt` 探针查询诊断，
返回「暂无诊断」——不是代码没问题，而是 IntelliJ 内核根本没把 Kotlin 文件纳入分析。

## 根因（两条叠加，已在 IntelliJ 日志 + 独立 system-path 复现实锤）

### 根因 1：项目根定位错（主因）

`src/lsp.ts` 旧 `kotlinProjectRoot()` 向上找**第一个**含 build 文件的目录就停。对仓库里的
`composeApp/src/main/kotlin/.../App.kt`，向上第一个含 `build.gradle.kts` 的是
`composeApp` 模块目录 → 把它当项目根导入（日志 rootPath 证实），而不是含
`settings.gradle.kts` 的仓库根 `/Users/xieshaoze/Code/dsh-remote-control`。

这个错根直接触发根因 2，并导致导入缺 content root → `KotlinProblemHighlightFilter`
把文件判为 `not-under-content-root` → 返回 0 诊断。

### 根因 2：Gradle 守护进程落在 JBR-25（Java 25）上，与 Gradle 8.11.1 不兼容

日志（`~/.dsh/kotlin-lsp/index/system/log/intellij-server.log`）三连失败（23:28/23:42/00:10）
的深层原因不是网络，而是：

```
[IMPORT ERR]: BUG! exception in phase 'semantic analysis' in source unit '_BuildScript_' Unsupported class file major version 69
Caused by: java.lang.IllegalArgumentException: Unsupported class file major version 69
  at groovyjarjarasm.asm.ClassReader.<init>(...)
SEVERE - Could not run build action using connection to Gradle distribution 'https://services.gradle.org/distributions/gradle-8.11.1-bin.zip'.
```

- major version 69 = Java 25。intellij-server 自带 **JBR-25**（`jbr/Contents/Home/bin/java -version`
  → `openjdk 25.0.3`），而 Gradle 8.11.1 只支持到 Java 23。Groovy 编译构建脚本时 ASM 读不动
  Java 25 的 class 文件 → 导入必败。
- 外层那句「Could not run build action … distribution …」是 Tooling API 的误导性包装语，
  **不代表真的在重新下载**。本机 `~/.gradle/wrapper/dists/gradle-8.11.1-bin/`（含 `.ok`）早已
  就位；日志里「Update check failed: HTTP connect timed out」是 IntelliJ 自己的升级检查，非致命。

**为什么 JBR-25 会被选中**：kotlin-lsp 的 `GradleToolingApiHelper.findTheMostCompatibleJdk()`
会先 `guessGradleVersion(projectDirectory)` 读 `gradle/wrapper/gradle-wrapper.properties` 才能
按 Gradle 版本挑兼容 JDK。根因 1 把 composeApp 模块目录当根，那里**没有 wrapper** →
`guessGradleVersion` 返回 null → 直接返回 null → 守护进程回落到 JBR-25。

（反证：用正确仓库根复现时，日志出现
`Gradle Tooling API will use Java located in /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`，
`BUILD SUCCESSFUL in 2m 6s`，不再有 major version 69。）

## 修复

### 1. `kotlinProjectRoot` 提成纯函数，改为「优先最上层 settings」

`src/lsp.ts` 新增导出 `kotlinProjectRoot(path)`：

- 向上遍历（20 层内）收集**所有**含标记（`build.gradle.kts` / `build.gradle` /
  `settings.gradle.kts` / `settings.gradle` / `pom.xml`）的目录；
- **优先取最上层含 `settings.gradle(.kts)` 的目录**（即仓库根）；
- 没有 settings 时取最上层含任一标记的目录；
- 都没有则退回文件所在目录。

`kotlinBuildTool` 的 key、`workspaceFolders`、`rootUri`/`rootPath` 全部改用新根，
保证 wrapper 能被找到 → JDK 自动探测恢复 → 导入成功。

### 2. spawn 环境：剥离代理黑洞 + 注入 GRADLE_USER_HOME + 防御性 JAVA_HOME

`src/lsp.ts` 新增导出 `kotlinSpawnEnv(base, opts)` 纯函数（kotlin spawn 时使用）：

- 剥离 `http_proxy`/`https_proxy`/`HTTP_PROXY`/`HTTPS_PROXY`/`all_proxy`/`ALL_PROXY`/
  `no_proxy`/`NO_PROXY`（进程网络不可用时，代理会把 Gradle 解析导进黑洞）；
- 未显式设置时注入 `GRADLE_USER_HOME=~/.gradle`（确保 wrapper 分发命中本机缓存）；
- 未显式设置时注入 `JAVA_HOME`，指向 Gradle 兼容 JDK（Java 17~23）。

`JAVA_HOME` 由私有 `gradleJavaHome()` 探测：优先沿用环境 `JAVA_HOME`，其次 Homebrew
`openjdk@21/@17/@23`，再扫 `/Applications/Android Studio*.app` 的 JBR。这是**防御兜底**——
主修复是根定位；即便内核自动探测仍失败，`tryJavaFromJavaHome` 也会读 `JAVA_HOME`
（不兼容时内核会自行忽略，不误伤）。

> 注意：`intellij-server` 原生启动器的运行时查找顺序是「产品专用环境变量 → 用户配置 →
> 自带 jbr → JDK_HOME → JAVA_HOME」，自带 JBR 优先级高于 JAVA_HOME，所以注入
> `JAVA_HOME` 只会影响 Gradle 守护进程，不会把 intellij-server 本身换到低版本 JVM 上。

## 验证（独立 system-path，未碰线上实例 PID 64078）

1. 反证根因：把「模块目录（无 wrapper）」当根导入 → 日志无「Gradle Tooling API will use
   Java」、导入无法就绪（复现 JBR-25 回落路径）。
2. 正证修复：小测试工程（`settings.gradle.kts` + `build.gradle.kts` + 带错误的 `.kt` +
   `gradle/wrapper` 指向 8.11.1）以仓库根导入 → `BUILD SUCCESSFUL in 2m 6s`，JDK 选
   openjdk@21，无 major version 69。诊断返回见交付报告（若该次运行仍未等到
   `intellij/ready-for-test`，属于首次导入的冷启动耗时，非导入失败）。

## 第二阶段：构建后处理 ClassCastException（Android 模块导入崩溃 → 空模型）

### 现象

第一阶段修好后，`BUILD SUCCESSFUL` 正常打出，但紧随其后 `SourceSetDependencyResolver`
构造器抛 `ClassCastException`，整个 `importWorkspace` 中断 → `Workspace model cache saved (0 K)`、
`Project analyzer project ... is being disposed` → 文件仍 `not-under-content-root` → Kotlin 诊断 0 条。

线上日志 16:46 段（与独立复现完全一致）：

```
SEVERE - class org.jetbrains.kotlin.gradle.idea.tcs.IdeaKotlinResolvedBinaryDependency cannot be cast to class org.jetbrains.kotlin.gradle.idea.tcs.IdeaKotlinDependency
  (IdeaKotlinResolvedBinaryDependency is in ... PluginClassLoader @6adc0aac;
   IdeaKotlinDependency is in ... PluginClassLoader @79dd18b8)
  at com.jetbrains.ls.imports.gradle.SourceSetDependencyResolver.populateDependenciesForAndroidModule(SourceSetDependencyResolver.kt:376)
  at com.jetbrains.ls.imports.gradle.SourceSetDependencyResolver.<init>(SourceSetDependencyResolver.kt:45)
  at com.jetbrains.ls.imports.gradle.IdeaProjectMapper.toWorkspaceData(IdeaProjectMapper.kt:38)
  at com.jetbrains.ls.imports.gradle.GradleWorkspaceImporter.importWorkspace(GradleWorkspaceImporter.kt:80)
```

### 根因（已实锤，非桥侧/非 KGP 版本「新旧」）

不是「KGP 2.1.0 的 `IdeaKotlinResolvedBinaryDependency` 是 `IdeaKotlinDependency` 之外的新类型」
——javap 反编译本机 KGP 2.1.0 的 `kotlin-gradle-plugin-idea-2.1.0.jar` 证实，在**同一 classloader** 里
`IdeaKotlinResolvedBinaryDependency` 继承 `IdeaKotlinBinaryDependency`，而后者 `implements IdeaKotlinDependency`，
是合法的 `IdeaKotlinDependency` 子类。

真正原因是**插件类加载器分裂**：本机 kotlin-lsp 分发把 KGP 的
`org.jetbrains.kotlin.gradle.idea.tcs.*` 类**同时打进了两个插件 jar**：

- `plugins/kotlin/lib/intellij.kotlin.base.projectModel.jar`（`kotlin` 插件）
- `plugins/kotlin.lsp/lib/modules/language-server.workspace-import.gradle-plugin.jar`（`kotlin.lsp` 插件）

两个插件各自用自己的 `PluginClassLoader` 加载**同名同类**（字节码完全相同，但在 JVM 里是两个不同类）。
Android 模块导入时，`androidProject.dependencies` 声明为 `List<IdeaKotlinDependency>`（来自一个 classloader），
元素却是另一个 classloader 产出的 `IdeaKotlinResolvedBinaryDependency` → 迭代时的 `checkcast` 失败。
异常信息里两个不同 hash 的 `PluginClassLoader` 就是实锤。被导入工程里 `composeApp` 是 KMP 的 Android 模块，
恰好走 `populateDependenciesForAndroidModule` 这条路径，所以只有带 Android 模块的工程才会炸。

> 附带观察：日志里还有 `[IMPORT ERR]: Failed to find 'target' in Kotlin extension` 与
> `Failed to call 'onVariants' in 'androidComponents' extension` 两条 WARN——同样是 kotlin-lsp 对
> KGP 2.1.0 内部结构的反射式访问不匹配，但它们是 WARN，不是致命项；二进制升级后若仍残留可再单独评估。

### 上游修复

上游 Kotlin/kotlin-lsp 的修复 commit：

- **`4be8d16815ea`** — *"LSP-1561: Never use third party classes in model which passes the boundary
  of plugins or/and gradle2idea boundary"*（2026-08-10）。

它把跨插件边界传递的 `IdeaKotlinResolvedBinaryDependency` / `IdeaKotlinProjectArtifactDependency`
（第三方 KGP 类）替换为自有 `AndroidDependency`（`AndroidDependency.Library` / `AndroidDependency.ProjectArtifact`）
模型，`populateDependenciesForAndroidModule` 不再 `cast` 任何 KGP 类型。这正是本 ClassCastException 的修复。

### 版本结论：修复尚未进入任何可下载二进制（当前无法升级，非网络问题）

| 来源 | 最新可用 | 时间 |
| --- | --- | --- |
| 本机 `~/.dsh/kotlin-lsp/server/build.txt` | **ILS-263.2689.0**（2026.3 EAP） | 2026-08-03（CDN `last-modified`） |
| GitHub releases（Kotlin/kotlin-lsp） | v262.9593.0 | 2026-07-27 |
| CDN 直链探测 | 263.2689.0（本机这版） | 2026-08-03 |
| Open VSX `jetbrains.kotlin-server` | 0.0.8 | 2026-08-03 |

修复合并于 **2026-08-10**，晚于所有公开二进制；截至本记录（2026-08-31）探测
`download-cdn.jetbrains.com` 上 263.2690.0~263.12000.0 均为 404，**没有含修复的构建**。
因此当前无法升级——不是代理黑洞（CDN 可直连，263.2689.0 的 tar.gz 返回 200），而是修复还没发布。

### 下载源与升级步骤（供含修复的构建发布后执行）

- 下载 URL（版本号 = `build.txt` 去掉 `ILS-` 前缀）：
  `https://download-cdn.jetbrains.com/language-server/kotlin-server/<版本>/kotlin-server-<版本>.tar.gz`
  （例如 `.../kotlin-server/263.2689.0/kotlin-server-263.2689.0.tar.gz`，约 382 MB）
- tar.gz 内布局与 `~/.dsh/kotlin-lsp/server/` 一致：`bin/ jbr/ lib/ license/ modules/ plugins/ build.txt kotlin-lsp.sh product-info.json`。
- 升级步骤：
  1. 停用桥的 Kotlin LSP（避免覆盖正在运行的二进制）；**不要** kill 线上 intellij-server，
     由主 agent 在重启窗口内处理。
  2. 备份：`mv ~/.dsh/kotlin-lsp/server ~/.dsh/kotlin-lsp/server.bak-<旧版本>`。
  3. 下载并解压新版，`chmod +x bin/intellij-server`。
  4. 用**独立临时 system-path** 验证（见下节），确认 `intellij/ready-for-test` 且
     `workspace-model.cache` 非 0K、`textDocument/diagnostic` 对 `composeApp/src/commonMain/kotlin/.../App.kt`
     有真实响应。
  5. 验证通过后由主 agent 重启 DSH（`dsh-restart` 需用户确认）。

### 独立环境验证结果（本次，未碰线上实例 PID 88155 与 `~/.dsh/kotlin-lsp/index`）

用 `mktemp -d` 独立 system-path（`/tmp/kotlin-lsp-repro-idx`）跑
`python3 ~/.dsh/kotlin-lsp/server/bin/warmup.py /Users/xieshaoze/Code/dsh-remote-control <临时index> --build-tool gradle -J-Xmx4g`，
spawn 环境复刻桥侧（剥代理 + `GRADLE_USER_HOME=~/.gradle` + `JAVA_HOME=openjdk@21`）：

1. `Importing Gradle project from: /Users/xieshaoze/Code/dsh-remote-control`（仓库根 ✅）
2. `Gradle Tooling API will use Java located in /opt/homebrew/opt/openjdk@21/...`（✅ 一阶段 JDK 兜底生效）
3. `BUILD SUCCESSFUL in 42s`（✅，warm daemon 更快）
4. `SEVERE ... IdeaKotlinResolvedBinaryDependency cannot be cast to IdeaKotlinDependency`
   （两个 `PluginClassLoader @246cea09` vs `@68099f4a`）——**复现成功**
5. `Workspace model cache saved (0 K)`、`workspace-model.cache` 65 字节 —— 模型为空
6. server 仍回 `intellij/ready-for-test {}`（导入失败被吞掉，桥因此看到「ready」但诊断 0 条）

结论：这是 kotlin-lsp 二进制自身的 bug，桥侧无初始化选项/环境变量可绕过（根因在插件 classloader
隔离，`buildTools`/`indexDir` 等都无法关闭 Android 依赖解析）。唯一修复是升级到含
`4be8d16815ea` 的构建；在此之前 Kotlin 诊断保持禁用（现状）。

## 未改

- `BRIDGE_VERSION` 与版本断言（主 agent 合并时统一协调）。
- 协议 wire 结构。
- `src/lsp.ts` 第二阶段无代码改动（bug 在二进制，非桥侧可解）。
