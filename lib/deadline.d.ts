/**
 * 给一个 Promise 加「软 deadline」：超时返回 onTimeout()，先完成则清定时器。
 *
 * 用途：Agent 工具的 await 路径兜底。同一进程内的代码无法被硬杀，真正的根因是
 * 「进程/连接已死时 pending Promise 永不落定」——这里保证**调用方**在 ms 内必然返回，
 * 绝不无限挂起（生产事故：lsp_query 对已退出的 Kotlin 服务器 await 卡死 agent 回合 400+ 分钟）。
 *
 * 软 deadline 不取消底层工作：超时后底层 promise 仍在后台跑，其后续 settle 被 settled
 * 标志吞掉（同时已挂 .then 的 onRejected，不会产生未处理拒绝）。
 */
export declare function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => T): Promise<T>;
