export type LspSeverity = 1 | 2 | 3 | 4;
export interface LspDiagnosticWire {
    path: string;
    line: number;
    column: number;
    endLine?: number;
    endColumn?: number;
    severity: LspSeverity;
    message: string;
    source?: string;
}
/**
 * Kotlin 项目根定位（纯函数，便于单测）：向上遍历（默认 20 层）收集所有含构建标记的目录，
 * 优先取最上层含 settings.gradle(.kts) 的目录；没有 settings 时取最上层含任一标记的目录；
 * 都没有则退回文件所在目录。
 *
 * 修复背景：旧实现向上找到第一个含 build 文件的目录就停，会把 composeApp 模块目录误当项目根
 * （缺 settings.gradle.kts 的仓库根），导致 IntelliJ 导入缺 content root → Kotlin 文件
 * 被判 not-under-content-root → 0 诊断。
 */
export declare function kotlinProjectRoot(path: string): string;
/** Kotlin（IntelliJ 内核）spawn 环境里需要剥离的代理变量：进程网络不可用时代理会把 Gradle 下载/解析导进黑洞。 */
export declare const KOTLIN_STRIP_PROXY_VARS: string[];
/**
 * 构造 Kotlin（IntelliJ 内核）spawn 环境变量（纯函数，便于单测）：
 * 1. 剥离代理变量（避免代理黑洞阻断 Gradle 分发/依赖解析）；
 * 2. 未显式设置时注入 GRADLE_USER_HOME（确保 wrapper 分发命中本机 ~/.gradle 缓存）；
 * 3. 未显式设置时注入 JAVA_HOME（Gradle 兼容 JDK，作为自动探测失败时的防御兜底）。
 */
export declare function kotlinSpawnEnv(base: NodeJS.ProcessEnv, opts: {
    gradleUserHome: string;
    javaHome?: string;
}): NodeJS.ProcessEnv;
export interface LspOptions {
    /** 诊断回调：path + 触发它的会话 + 该文件当前全部诊断。 */
    onDiagnostics: (path: string, sessionId: string | undefined, diagnostics: LspDiagnosticWire[]) => void;
    /** 语言 → 覆盖命令（测试注入 mock server 用）。 */
    cmdOverride?: Record<string, string[]>;
    /** 日志钩子（默认静默）。 */
    log?: (message: string) => void;
}
export declare class LspManager {
    private readonly opts;
    private readonly servers;
    private readonly missing;
    private readonly diagTimers;
    private readonly diagCache;
    private tsServerPathCache;
    constructor(opts: LspOptions);
    /** 已就绪（二进制存在）的语言列表，hello 快照里下发给手机。 */
    availableLangs(): string[];
    /** Agent 编辑/写入了文件 → 打开或更新到对应 language server（sessionId 用于诊断会话隔离）。 */
    notifyFileChanged(path: string, sessionId?: string): void;
    /** 立即同步一次文件内容（绕过节流，供测试）。 */
    flush(path: string): void;
    dispose(): void;
    /**
     * Agent 主动查询语言服务器（OMP 同款能力）：diagnostics / hover / definition / references。
     * 返回给模型看的纯文本；诊断优先读缓存（push/pull 两个通道都会更新）。
     */
    query(action: 'diagnostics' | 'hover' | 'definition' | 'references', path: string, line?: number, column?: number): Promise<{
        text: string;
    }>;
    private cmdFor;
    /**
     * 官方 JetBrains Kotlin LSP 二进制三级解析：
     * a. DSH_KOTLIN_LSP_BIN（绝对路径或 PATH 上的名字）；
     * b. 解包在 ~/.dsh/kotlin-lsp/server/bin/intellij-server；
     * c. PATH 上的 `kotlin-lsp`。
     */
    private kotlinBin;
    /** IntelliJ LSP 的索引/缓存目录（稳定路径，跨进程复用，避免每次重建索引）。 */
    private kotlinIndexDir;
    /**
     * 找 Gradle 兼容 JDK（Java 17~23）作为防御性 JAVA_HOME。
     * 背景：intellij-server 自带 JBR-25（Java 25），而 Gradle 8.11.1 只支持到 Java 23，
     * 若 IntelliJ 内核自动探测不到兼容 JDK，Gradle 守护进程会落在 JBR-25 上 → Groovy 编译
     * 构建脚本时报 "Unsupported class file major version 69"。注入 JAVA_HOME 让内核的
     * tryJavaFromJavaHome 兜底（不兼容时内核会自行忽略，不会误伤）。
     */
    private gradleJavaHome;
    private kotlinCmd;
    /** 项目根里的构建系统：Gradle / Maven。用于显式 buildTools 触发 IntelliJ 的项目导入。 */
    private kotlinBuildTool;
    /**
     * 官方 IntelliJ Kotlin LSP 需要全量能力声明（oh-my-pi 同款）：只声明 publishDiagnostics 会让
     * IntelliJ 不完整启用分析/索引。这里覆盖诊断 + hover/definition/references（query 用）。
     */
    private kotlinCapabilities;
    private langFor;
    /** 全局 typescript 安装里的 tsserver.js（typescript-language-server 不捆绑 typescript 时需要显式指路）。 */
    private tsserverPath;
    private findExecutable;
    private ensureServer;
    private killServer;
    private notify;
    private request;
    private handleMessage;
    /** 回应服务器发起的请求（oh-my-pi 同款：workspace/configuration 与 workspace/workspaceFolders 必须回数组）。 */
    private handleServerRequest;
    private respond;
    private syncDoc;
    /** 把一条 LSP Diagnostic（push 或 pull 两种来源共用）转成桥接的 wire 结构。 */
    private toWireDiagnostic;
    /** pull 模式诊断：请求 textDocument/diagnostic，非空就回调，空则节流重试（IntelliJ 分析异步，就绪后仍需 20~30s 才算完）。 */
    private pullDiagnostics;
}
