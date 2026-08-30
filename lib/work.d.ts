/** 排队消息快照条目（与协议 QueueItemWire 同构，独立声明避免协议耦合）。 */
export interface QueueSnapshotItem {
    id: string;
    placement: string;
    text: string;
}
export interface QueueSnapshot {
    items: QueueSnapshotItem[];
    at: number;
}
export interface WorkState {
    /** 当前进行中的事项（一句话；null = 无）。 */
    activity: string | null;
    /** 待办清单（重启后按序继续）。 */
    pending: string[];
    /** 最近一次重启的新增功能说明（推送给重连客户端展示）。 */
    notes: string[];
    /** 会话排队消息快照：sessionId → 快照（重启后与活队列对比，丢了才恢复）。 */
    queues?: Record<string, QueueSnapshot>;
    updatedAt: number;
}
export declare function loadWorkState(file: string): WorkState | null;
export declare function writeWorkState(file: string, patch: {
    activity?: string | null;
    pending?: string[];
    notes?: string[];
    queues?: Record<string, QueueSnapshot>;
}): WorkState;
