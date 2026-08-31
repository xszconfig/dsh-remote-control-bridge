/**
 * LSP 被动诊断 → Agent 注入的自动闭环（纯决策逻辑，可单测）。
 *
 * 背景：Agent 改代码后语言服务器被动检查出的编译错误，过去只广播到手机，
 * Agent 自己完全不知情。本模块把「该注入什么、何时注入、注入几次」的决策从
 * index.ts 的 Agent/broadcast 胶水层里抽出来，让闭环语义可被单元测试覆盖。
 *
 * 规则：
 * 1. 只注入 severity==1（error）；warning/info/hint 不注入（防噪音）；
 * 2. 同一编辑批次的诊断 ~1s 防抖合并（tsserver 跨文件诊断先后到达也并进同一批）；
 * 3. 同批错误用指纹（文件集合 + 首错误 message + 行号集合）去重，同一批只注入一次；
 * 4. 每轮（turn）注入上限 3 次，防死循环；turn/start 时重置；
 * 5. 第二次及以后的注入带进展（"已消除 X 个，剩余 N 个"）；清零静默（仅 onCleared 回调）。
 *
 * 本模块不碰 Agent / 广播 / wire 协议：注入与清零动作一律经构造参数回调，
 * 由 index.ts 决定「运行中 agent.inject / 空闲 agent.followup」的官方注入语义。
 * 逃生门 DSH_REMOTE_LSP_FEEDBACK（默认开启，0/false 关闭）由 index.ts 读取后
 * 经 `enabled` 传入；关闭时本模块的 handle 直接空转。
 */
/** 诊断的结构化最小面（与 lsp.ts 的 LspDiagnosticWire 结构兼容，避免反向依赖）。 */
export interface LspDiagnosticLike {
    path: string;
    line: number;
    column: number;
    severity: number;
    message: string;
}
/** 一条要注入给 Agent 的编译错误（只保留格式化所需字段）。 */
export interface LspError {
    path: string;
    line: number;
    column: number;
    message: string;
}
export interface LspFeedbackOptions {
    /** 逃生门：false 时全部新行为不生效（不注入、不清零）。 */
    enabled: boolean;
    /** 注入钩子：sessionId + 已格式化的错误清单文本。 */
    inject: (sessionId: string, text: string) => void;
    /** 清零钩子（可选）：本批错误全部消除时回调（默认静默，仅用于日志）。 */
    onCleared?: (sessionId: string, text: string) => void;
    log?: (msg: string) => void;
    /** 防抖窗口（ms），默认 1000。 */
    debounceMs?: number;
    /** 每轮注入上限，默认 3。 */
    maxInjectPerTurn?: number;
}
/** 逃生门判定：DSH_REMOTE_LSP_FEEDBACK 未设置/空 = 开启；'0'/'false'（不区分大小写）= 关闭。 */
export declare function lspFeedbackEnabledFromEnv(env?: NodeJS.ProcessEnv): boolean;
/** 同批错误指纹：文件集合 + 首错误 message + 行号集合（需求指定）。 */
export declare function lspFeedbackFingerprint(errors: readonly LspError[]): string;
export declare class LspFeedback {
    private readonly opts;
    private readonly debounceMs;
    private readonly maxPerTurn;
    private readonly states;
    constructor(opts: LspFeedbackOptions);
    /** 诊断到达：只记 error，按会话防抖合并后决定是否注入。 */
    handle(path: string, sessionId: string | undefined, diagnostics: readonly LspDiagnosticLike[]): void;
    /** 轮次边界：重置该会话的注入上限与批次指纹（新一轮重新计数）。 */
    markTurnStart(sessionId: string): void;
    /** 立即处理该会话累积的诊断（测试/收敛用，绕开防抖）。 */
    flush(sessionId: string): void;
    dispose(): void;
    private stateOf;
    private schedule;
    private process;
    private format;
}
