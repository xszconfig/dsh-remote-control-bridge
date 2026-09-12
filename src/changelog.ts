/**
 * 版本 changelog：BRIDGE_VERSION → 「新增功能说明」要点（server_boot.notes 的权威数据源）。
 *
 * 背景（bug 修复）：此前 server_boot.notes 误读 $DSH_HOME/remote-control-work.json 的
 * work.notes——那是「自动续跑」机制的活动台账，最后一次写 notes 停在 0.12.0 开发期，之后
 * 从未更新，导致「服务端已重启」横幅标题版本 0.17.x、正文却显示 0.12.0 时代的说明。
 * 现改为读本 changelog，按 BRIDGE_VERSION 精确索引；无对应版本条目时兜底「本次更新见服务端
 * changelog」，绝不串版本。
 *
 * 维护约定：每次 BRIDGE_VERSION 递增（尤其 minor 新功能）时，在此补对应版本要点；
 * 要点面向手机用户，精炼 1~3 条可读描述，不写实现细节。
 */
export const CHANGELOG: Record<string, string[]> = {
  '0.13.0': [
    '支持斜杠命令：输入 /命令 直接路由到桌面端同一执行链',
    '对休眠会话发消息会自动打开并投递',
    '中断会话可选保留排队消息并自动续消费',
    '服务端支持热插拔升级（免重启换新版本）',
  ],
  '0.14.0': [
    '消息必达：发送确认 ack + 幂等去重，弱网不丢不重',
    '应用层心跳判活：假连接秒级判死',
    '新增局域网直连入口',
  ],
  '0.15.0': [
    '结果交付通知不丢：服务端台账 + 重连补发',
  ],
  '0.16.0': [
    '输入区操作条：模型选择 + 上下文占用展示',
  ],
  '0.17.0': [
    '技能目录推送：手机可浏览可用技能',
    '模型目录/上下文变更实时广播',
  ],
}

/** 兜底说明：无对应版本条目时显示，绝不串版本。 */
export const CHANGELOG_FALLBACK = ['本次更新见服务端 changelog']

/** 按版本号取「新增功能说明」：精确匹配 → minor 版本回退（patch 归并）→ 兜底。 */
export function notesForVersion(version: string): string[] {
  const exact = CHANGELOG[version]
  if (exact !== undefined) return exact
  const minor = version.split('.').slice(0, 2).join('.') + '.0'
  const minorNotes = CHANGELOG[minor]
  if (minorNotes !== undefined) return minorNotes
  return CHANGELOG_FALLBACK
}
