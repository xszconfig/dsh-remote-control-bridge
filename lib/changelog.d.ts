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
export declare const CHANGELOG: Record<string, string[]>;
/** 兜底说明：无对应版本条目时显示，绝不串版本。 */
export declare const CHANGELOG_FALLBACK: string[];
/** 按版本号取「新增功能说明」：精确匹配 → minor 版本回退（patch 归并）→ 兜底。 */
export declare function notesForVersion(version: string): string[];
