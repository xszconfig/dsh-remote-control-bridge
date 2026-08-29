/**
 * 结构化连接日志：级别 + tag + 消息，环形缓冲（内存有界），
 * 供 /remote/logs 接口与本地 console 镜像使用。
 * 后续所有 bridge 开发统一经这里打点（基础组件）。
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export interface LogEntry {
    seq: number;
    ts: number;
    level: LogLevel;
    tag: string;
    message: string;
}
export declare class ConnLogger {
    readonly scope: string;
    private readonly buffer;
    private seq;
    private readonly max;
    /** 节流表：key -> 上次放行时间（毫秒），用于高频事件降噪。 */
    private readonly throttle;
    constructor(scope: string, max?: number);
    log(level: LogLevel, tag: string, message: string): void;
    debug(tag: string, message: string): void;
    info(tag: string, message: string): void;
    warn(tag: string, message: string): void;
    error(tag: string, message: string): void;
    /**
     * 节流日志：同一 key 在 windowMs 内只放行一次（用于事件流等高频场景）。
     * 被节流丢弃的计数会并入放行时的消息（`xN`）。
     */
    throttled(level: LogLevel, tag: string, key: string, windowMs: number, message: () => string): void;
    /** 按级别过滤 + 截断的最近条目（供 /remote/logs）。 */
    entries(level?: LogLevel, limit?: number): LogEntry[];
}
