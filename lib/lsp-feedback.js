/**
 * LSP 被动诊断 → Agent 注入的自动闭环（纯决策逻辑，可单测）。
 *
 * 背景：Agent 改代码后语言服务器被动检查出的编译错误，过去只广播到手机，
 * Agent 自己完全不知情。本模块把「该注入什么、何时注入、注入几次」的决策从
 * index.ts 的 Agent/broadcast 胶水层里抽出来，让闭环语义可被单元测试覆盖。
 *
 * 规则：
 * 1. 只注入 severity==1（error）；warning/info/hint 不注入（防噪音）；
 * 2. 同一编辑批次的诊断 ~1s 防抖合并（tsserver 跨文件诊断先后到达也并进同一批）；
 * 3. 同批错误用指纹（文件集合 + 首错误 message + 行号集合）去重，同一批只注入一次；
 * 4. 每轮（turn）注入上限 3 次，防死循环；turn/start 时重置；
 * 5. 第二次及以后的注入带进展（"已消除 X 个，剩余 N 个"）；清零静默（仅 onCleared 回调）。
 *
 * 本模块不碰 Agent / 广播 / wire 协议：注入与清零动作一律经构造参数回调，
 * 由 index.ts 决定「运行中 agent.inject / 空闲 agent.followup」的官方注入语义。
 * 逃生门 DSH_REMOTE_LSP_FEEDBACK（默认开启，0/false 关闭）由 index.ts 读取后
 * 经 `enabled` 传入；关闭时本模块的 handle 直接空转。
 */
/** 逃生门判定：DSH_REMOTE_LSP_FEEDBACK 未设置/空 = 开启；'0'/'false'（不区分大小写）= 关闭。 */
export function lspFeedbackEnabledFromEnv(env = process.env) {
    const v = env.DSH_REMOTE_LSP_FEEDBACK;
    if (v === undefined || v === '')
        return true;
    return v !== '0' && v.toLowerCase() !== 'false';
}
/** 同批错误指纹：文件集合 + 首错误 message + 行号集合（需求指定）。 */
export function lspFeedbackFingerprint(errors) {
    const sorted = [...errors].sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.column - b.column || a.message.localeCompare(b.message));
    const files = [...new Set(sorted.map((e) => e.path))].sort().join('\u0000');
    const first = sorted[0]?.message ?? '';
    const lines = [...new Set(sorted.map((e) => e.line))].sort((a, b) => a - b).join(',');
    return `${files}\u0001${first}\u0001${lines}`;
}
export class LspFeedback {
    opts;
    debounceMs;
    maxPerTurn;
    states = new Map();
    constructor(opts) {
        this.opts = opts;
        this.debounceMs = opts.debounceMs ?? 1000;
        this.maxPerTurn = opts.maxInjectPerTurn ?? 3;
    }
    /** 诊断到达：只记 error，按会话防抖合并后决定是否注入。 */
    handle(path, sessionId, diagnostics) {
        if (!this.opts.enabled)
            return;
        if (sessionId === undefined || sessionId === '')
            return;
        const errors = diagnostics
            .filter((d) => d.severity === 1)
            .map((d) => ({ path: d.path, line: d.line, column: d.column, message: d.message }))
            .sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.column - b.column);
        const state = this.stateOf(sessionId);
        state.errorsByPath.set(path, errors);
        this.schedule(state, sessionId);
    }
    /** 轮次边界：重置该会话的注入上限与批次指纹（新一轮重新计数）。 */
    markTurnStart(sessionId) {
        const state = this.states.get(sessionId);
        if (state === undefined)
            return;
        if (state.timer !== null) {
            clearTimeout(state.timer);
            state.timer = null;
        }
        this.states.delete(sessionId);
    }
    /** 立即处理该会话累积的诊断（测试/收敛用，绕开防抖）。 */
    flush(sessionId) {
        const state = this.states.get(sessionId);
        if (state === undefined || state.timer === null)
            return;
        clearTimeout(state.timer);
        state.timer = null;
        this.process(sessionId, state);
    }
    dispose() {
        for (const state of this.states.values()) {
            if (state.timer !== null)
                clearTimeout(state.timer);
        }
        this.states.clear();
    }
    stateOf(sessionId) {
        let state = this.states.get(sessionId);
        if (state === undefined) {
            state = { lastErrorCount: 0, lastFingerprint: null, injectCount: 0, errorsByPath: new Map(), timer: null };
            this.states.set(sessionId, state);
        }
        return state;
    }
    schedule(state, sessionId) {
        if (state.timer !== null)
            clearTimeout(state.timer);
        state.timer = setTimeout(() => {
            state.timer = null;
            this.process(sessionId, state);
        }, this.debounceMs);
        state.timer.unref?.();
    }
    process(sessionId, state) {
        const errors = [];
        for (const list of state.errorsByPath.values())
            errors.push(...list);
        errors.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.column - b.column);
        if (errors.length === 0) {
            if (state.lastErrorCount > 0) {
                this.opts.log?.(`[lsp-feedback] 会话 ${sessionId.slice(0, 12)} 本轮编辑引入的编译错误已全部消除`);
                this.opts.onCleared?.(sessionId, '【LSP 编译错误】已全部消除');
                state.lastErrorCount = 0;
                state.lastFingerprint = null;
            }
            return;
        }
        const fp = lspFeedbackFingerprint(errors);
        if (fp === state.lastFingerprint)
            return; // 同批去重：同一批错误只注入一次
        if (state.injectCount >= this.maxPerTurn)
            return; // 每轮上限：防死循环
        const removed = state.injectCount === 0 ? 0 : Math.max(0, state.lastErrorCount - errors.length);
        const text = this.format(errors, removed, state.injectCount === 0);
        this.opts.log?.(`[lsp-feedback] 会话 ${sessionId.slice(0, 12)} 注入 ${errors.length} 条编译错误（本轮第 ${state.injectCount + 1} 次）`);
        this.opts.inject(sessionId, text);
        state.lastFingerprint = fp;
        state.lastErrorCount = errors.length;
        state.injectCount += 1;
    }
    format(errors, removed, first) {
        const header = first
            ? `【LSP 编译错误】检测到 ${errors.length} 个编译错误，请修复：`
            : `【LSP 编译错误】已消除 ${removed} 个，剩余 ${errors.length} 个编译错误，请继续修复：`;
        return [header, ...errors.map((e) => `- ${e.path}:${e.line}:${e.column} ${e.message}`)].join('\n');
    }
}
