/**
 * 结果交付通知台账：会话×轮次的交付通知事件持久化（重连补发，不丢）。
 *
 * 文件：$DSH_HOME/remote-control-deliveries.json（0600）。
 * 写入方：桥在 agent 轮次完成（turn/end）且本轮有实质产出时追加一条；手机回 confirm_delivery 后删除。
 * 读取方：桥启动时加载 + hello 下发未确认记录（pendingDeliveries）+ /remote 内部。
 *
 * 结构：{ version: 1, deliveries: DeliveryRecord[] }，按 completedAt 升序追加，
 * 写盘时保留最新 MAX_DELIVERIES 条（淘汰最旧），防无限增长。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** 单条交付通知记录（与协议 DeliveryNoticeWire 同构，独立声明避免协议耦合）。 */
export interface DeliveryRecord {
  sessionId: string
  turnKey: string
  title: string
  body: string
  isSubagent: boolean
  completedAt: number
}

/** 台账上限：超出后写盘时淘汰最旧（completedAt 升序的头部）。 */
export const MAX_DELIVERIES = 200

export function loadDeliveries(file: string): DeliveryRecord[] {
  try {
    if (!existsSync(file)) return []
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { deliveries?: unknown }
    if (parsed === null || typeof parsed !== 'object' || !Array.isArray(parsed.deliveries)) return []
    const out: DeliveryRecord[] = []
    for (const it of parsed.deliveries) {
      if (it === null || typeof it !== 'object') continue
      const r = it as Partial<DeliveryRecord>
      // 幂等键必须完整，缺 sessionId/turnKey 的记录丢弃
      if (typeof r.sessionId !== 'string' || typeof r.turnKey !== 'string') continue
      out.push({
        sessionId: r.sessionId,
        turnKey: r.turnKey,
        title: typeof r.title === 'string' ? r.title : '结果已就绪',
        body: typeof r.body === 'string' ? r.body : '',
        isSubagent: r.isSubagent === true,
        completedAt: typeof r.completedAt === 'number' ? r.completedAt : 0,
      })
    }
    return out
  } catch {
    return []
  }
}

export function writeDeliveries(file: string, records: DeliveryRecord[]): void {
  // 保留最新（按插入序 = completedAt 升序），超出上限淘汰最旧
  const capped = records.length > MAX_DELIVERIES ? records.slice(records.length - MAX_DELIVERIES) : records
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify({ version: 1, deliveries: capped }, null, 2), { mode: 0o600 })
}
