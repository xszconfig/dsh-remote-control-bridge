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
    /** Kotlin 需要项目根（含 build 文件）才能导入分析；找不到就退回文件所在目录。 */
    private kotlinProjectRoot;
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
