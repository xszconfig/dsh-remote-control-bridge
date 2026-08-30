export interface WorkState {
    /** 当前进行中的事项（一句话；null = 无）。 */
    activity: string | null;
    /** 待办清单（重启后按序继续）。 */
    pending: string[];
    /** 最近一次重启的新增功能说明（推送给重连客户端展示）。 */
    notes: string[];
    updatedAt: number;
}
export declare function loadWorkState(file: string): WorkState | null;
export declare function writeWorkState(file: string, patch: {
    activity?: string | null;
    pending?: string[];
    notes?: string[];
}): WorkState;
