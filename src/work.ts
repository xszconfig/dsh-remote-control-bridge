/**
 * 持久化工作状态：重启后服务端自报版本并恢复「进行中事项 / 待办」，
 * 让恢复的 Agent 会话自动续跑，而不是等客户端来问「重启成功了吗」。
 *
 * 文件：$DSH_HOME/remote-control-work.json（0600）。
 * 写入方：Agent 在重启前写入（activity = 正在做的事，pending = 下一步清单）；
 * 读取方：bridge 启动时打日志 + /remote/work + hello/health 下发。
 * 另外 bridge 会把各会话的排队消息快照进 queues（重启后对比恢复，防丢失）。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** 排队消息快照条目（与协议 QueueItemWire 同构，独立声明避免协议耦合）。 */
export interface QueueSnapshotItem {
  id: string
  placement: string
  text: string
}
export interface QueueSnapshot {
  items: QueueSnapshotItem[]
  at: number
}

export interface WorkState {
  /** 当前进行中的事项（一句话；null = 无）。 */
  activity: string | null
  /** 待办清单（重启后按序继续）。 */
  pending: string[]
  /** 最近一次重启的新增功能说明（推送给重连客户端展示）。 */
  notes: string[]
  /** 会话排队消息快照：sessionId → 快照（重启后与活队列对比，丢了才恢复）。 */
  queues?: Record<string, QueueSnapshot>
  updatedAt: number
}

function parseQueues(raw: unknown): Record<string, QueueSnapshot> | undefined {
  if (raw === null || raw === undefined) return undefined
  if (typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const out: Record<string, QueueSnapshot> = {}
  for (const [sid, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === null || typeof v !== 'object') continue
    const snap = v as Partial<QueueSnapshot>
    if (!Array.isArray(snap.items)) continue
    const items: QueueSnapshotItem[] = []
    for (const it of snap.items) {
      if (it === null || typeof it !== 'object') continue
      const i = it as Partial<QueueSnapshotItem>
      if (typeof i.text !== 'string') continue
      items.push({
        id: typeof i.id === 'string' ? i.id : '',
        placement: typeof i.placement === 'string' ? i.placement : 'queued',
        text: i.text,
      })
    }
    out[sid] = { items, at: typeof snap.at === 'number' ? snap.at : 0 }
  }
  return out
}

export function loadWorkState(file: string): WorkState | null {
  try {
    if (!existsSync(file)) return null
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<WorkState>
    return {
      activity: typeof parsed.activity === 'string' ? parsed.activity : null,
      pending: Array.isArray(parsed.pending) ? parsed.pending.filter((p): p is string => typeof p === 'string') : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes.filter((p): p is string => typeof p === 'string') : [],
      ...(parsed.queues !== undefined ? { queues: parseQueues(parsed.queues) } : {}),
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    }
  } catch {
    return null
  }
}

export function writeWorkState(
  file: string,
  patch: {
    activity?: string | null
    pending?: string[]
    notes?: string[]
    queues?: Record<string, QueueSnapshot>
  },
): WorkState {
  const current = loadWorkState(file) ?? { activity: null, pending: [], notes: [], updatedAt: 0 }
  const next: WorkState = {
    activity: patch.activity !== undefined ? patch.activity : current.activity,
    pending: patch.pending !== undefined ? patch.pending : current.pending,
    notes: patch.notes !== undefined ? patch.notes : current.notes,
    ...((patch.queues !== undefined || current.queues !== undefined)
      ? { queues: patch.queues !== undefined ? patch.queues : current.queues }
      : {}),
    updatedAt: Date.now(),
  }
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(next, null, 2), { mode: 0o600 })
  return next
}
