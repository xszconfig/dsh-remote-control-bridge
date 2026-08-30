/**
 * 持久化工作状态：重启后服务端自报版本并恢复「进行中事项 / 待办」，
 * 让恢复的 Agent 会话自动续跑，而不是等客户端来问「重启成功了吗」。
 *
 * 文件：$DSH_HOME/remote-control-work.json（0600）。
 * 写入方：Agent 在重启前写入（activity = 正在做的事，pending = 下一步清单）；
 * 读取方：bridge 启动时打日志 + /remote/work + hello/health 下发。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
export function loadWorkState(file) {
    try {
        if (!existsSync(file))
            return null;
        const parsed = JSON.parse(readFileSync(file, 'utf8'));
        return {
            activity: typeof parsed.activity === 'string' ? parsed.activity : null,
            pending: Array.isArray(parsed.pending) ? parsed.pending.filter((p) => typeof p === 'string') : [],
            notes: Array.isArray(parsed.notes) ? parsed.notes.filter((p) => typeof p === 'string') : [],
            updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
        };
    }
    catch {
        return null;
    }
}
export function writeWorkState(file, patch) {
    const current = loadWorkState(file) ?? { activity: null, pending: [], notes: [], updatedAt: 0 };
    const next = {
        activity: patch.activity !== undefined ? patch.activity : current.activity,
        pending: patch.pending !== undefined ? patch.pending : current.pending,
        notes: patch.notes !== undefined ? patch.notes : current.notes,
        updatedAt: Date.now(),
    };
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(next, null, 2), { mode: 0o600 });
    return next;
}
