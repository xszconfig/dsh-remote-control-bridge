/** 断点（手机/agent 侧均为 1-based 行号）。 */
export interface DebugBreakpointWire {
    path: string;
    line: number;
}
export type DebugRunState = 'starting' | 'running' | 'paused' | 'stopped';
export interface DebugScopeWire {
    name: string;
    variablesReference: string;
}
export interface DebugFrameWire {
    id: string;
    name: string;
    path: string;
    line: number;
    scopes: DebugScopeWire[];
}
export interface DebugVariableWire {
    name: string;
    value: string;
    type?: string;
    hasChildren: boolean;
    variablesReference: string;
}
export interface DebugPausedInfo {
    reason: string;
    stoppedAt: {
        path: string;
        line: number;
    } | null;
    frames: DebugFrameWire[];
}
export interface DebugStateSnapshot {
    state: DebugRunState;
    program: string;
    cwd: string;
    breakpoints: DebugBreakpointWire[];
    paused?: DebugPausedInfo;
    /** 最近一次错误的说明（启动失败/脚本报错等），state=stopped 时可能携带。 */
    error?: string;
}
export interface DebugStartOptions {
    program: string;
    cwd?: string;
    breakpoints?: DebugBreakpointWire[];
}
export interface DebugHooks {
    onState(sessionId: string, snap: DebugStateSnapshot): void;
    onOutput(sessionId: string, line: string): void;
    onVariables(sessionId: string, variablesReference: string, variables: DebugVariableWire[]): void;
}
export declare class DebugManager {
    private readonly hooks;
    private sessions;
    constructor(hooks: DebugHooks);
    has(sessionId: string): boolean;
    snapshotOf(sessionId: string): DebugStateSnapshot | null;
    start(sessionId: string, opts: DebugStartOptions): DebugStateSnapshot;
    command(sessionId: string, action: 'resume' | 'step' | 'step_out'): void;
    variables(sessionId: string, variablesReference: string): void;
    /** 读取变量并返回（Agent 调试工具用；不广播）。 */
    variablesFor(sessionId: string, variablesReference: string): Promise<DebugVariableWire[]>;
    stop(sessionId: string): Promise<void>;
}
