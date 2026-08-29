const LEVEL_ORDER = { debug: 0, info: 1, warn: 2, error: 3 };
export class ConnLogger {
    scope;
    buffer = [];
    seq = 0;
    max;
    /** 节流表：key -> 上次放行时间（毫秒），用于高频事件降噪。 */
    throttle = new Map();
    constructor(scope, max = 2000) {
        this.scope = scope;
        this.max = max;
    }
    log(level, tag, message) {
        this.seq += 1;
        const entry = { seq: this.seq, ts: Date.now(), level, tag, message };
        this.buffer.push(entry);
        if (this.buffer.length > this.max)
            this.buffer.splice(0, this.buffer.length - this.max);
        // console 镜像：warn/error 必现；debug/info 仅在 DSH_REMOTE_DEBUG_LOG=1 时输出
        const prefix = `[${this.scope}] [${tag}]`;
        if (level === 'warn')
            console.warn(prefix, message);
        else if (level === 'error')
            console.error(prefix, message);
        else if (process.env.DSH_REMOTE_DEBUG_LOG === '1')
            console.log(prefix, message);
    }
    debug(tag, message) { this.log('debug', tag, message); }
    info(tag, message) { this.log('info', tag, message); }
    warn(tag, message) { this.log('warn', tag, message); }
    error(tag, message) { this.log('error', tag, message); }
    /**
     * 节流日志：同一 key 在 windowMs 内只放行一次（用于事件流等高频场景）。
     * 被节流丢弃的计数会并入放行时的消息（`xN`）。
     */
    throttled(level, tag, key, windowMs, message) {
        const now = Date.now();
        const last = this.throttle.get(key) ?? 0;
        if (now - last < windowMs)
            return;
        this.throttle.set(key, now);
        this.log(level, tag, message());
    }
    /** 按级别过滤 + 截断的最近条目（供 /remote/logs）。 */
    entries(level, limit = 300) {
        const floor = level === undefined ? -1 : LEVEL_ORDER[level];
        const filtered = level === undefined ? this.buffer : this.buffer.filter((e) => LEVEL_ORDER[e.level] >= floor);
        return filtered.slice(-limit);
    }
}
