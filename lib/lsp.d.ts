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
    /** 诊断回调：path + 该文件当前全部诊断。 */
    onDiagnostics: (path: string, diagnostics: LspDiagnosticWire[]) => void;
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
    constructor(opts: LspOptions);
    /** 已就绪（二进制存在）的语言列表，hello 快照里下发给手机。 */
    availableLangs(): string[];
    /** Agent 编辑/写入了文件 → 打开或更新到对应 language server。 */
    notifyFileChanged(path: string): void;
    /** 立即同步一次文件内容（绕过节流，供测试）。 */
    flush(path: string): void;
    dispose(): void;
    private cmdFor;
    private langFor;
    private findExecutable;
    private ensureServer;
    private killServer;
    private send;
    private notify;
    private request;
    private handleMessage;
    private syncDoc;
}
