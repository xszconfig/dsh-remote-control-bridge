export interface WorkState {
    /** 当前进行中的事项（一句话；null = 无）。 */
    activity: string | null;
    /** 待办清单（重启后按序继续）。 */
    pending: string[];
    updatedAt: number;
}
export declare function loadWorkState(file: string): WorkState | null;
export declare function writeWorkState(file: string, patch: {
    activity?: string | null;
    pending?: string[];
}): WorkState;
