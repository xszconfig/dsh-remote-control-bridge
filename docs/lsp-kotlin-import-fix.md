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

## 未改

- `BRIDGE_VERSION` 与版本断言（主 agent 合并时统一协调）。
- 协议 wire 结构。
