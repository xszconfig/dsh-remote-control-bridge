/**
 * 持久化工作状态：重启后服务端自报版本并恢复「进行中事项 / 待办」，
 * 让恢复的 Agent 会话自动续跑，而不是等客户端来问「重启成功了吗」。
 *
 * 文件：$DSH_HOME/remote-control-work.json（0600）。
 * 写入方：Agent 在重启前写入（activity = 正在做的事，pending = 下一步清单）；
 * 读取方：bridge 启动时打日志 + /remote/work + hello/health 下发。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export interface WorkState {
  /** 当前进行中的事项（一句话；null = 无）。 */
  activity: string | null
  /** 待办清单（重启后按序继续）。 */
  pending: string[]
  updatedAt: number
}

export function loadWorkState(file: string): WorkState | null {
  try {
    if (!existsSync(file)) return null
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<WorkState>
    return {
      activity: typeof parsed.activity === 'string' ? parsed.activity : null,
      pending: Array.isArray(parsed.pending) ? parsed.pending.filter((p): p is string => typeof p === 'string') : [],
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    }
  } catch {
    return null
  }
}

export function writeWorkState(file: string, patch: { activity?: string | null; pending?: string[] }): WorkState {
  const current = loadWorkState(file) ?? { activity: null, pending: [], updatedAt: 0 }
  const next: WorkState = {
    activity: patch.activity !== undefined ? patch.activity : current.activity,
    pending: patch.pending !== undefined ? patch.pending : current.pending,
    updatedAt: Date.now(),
  }
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(next, null, 2), { mode: 0o600 })
  return next
}
