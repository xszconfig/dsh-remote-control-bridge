/** 挂载后返回的可卸载 fiber（真实环境即 Cordis 的 ctx.plugin 返回值）。 */
export interface HotFiber {
    dispose: () => void | Promise<void>;
}
/** 挂载一个 core 模块命名空间（{ name, inject, apply }），返回带 dispose() 的 fiber。 */
export type ApplyPlugin = (mod: unknown) => HotFiber | Promise<HotFiber>;
/** 把 srcDir 里的可运行代码搬进 destDir（可注入，测试用）。 */
export type CopyFiles = (srcDir: string, destDir: string) => Promise<void>;
export interface ReloadControllerOptions {
    /** 部署目录（shell 自身所在目录，即 lib/）。 */
    libDir: string;
    /** 版本化暂存根目录（~/.dsh/bridge-reload）。 */
    stagingRoot: string;
    /** 把导入的 core 模块挂载成 fiber；真实环境 = ctx.plugin(mod)。 */
    applyPlugin: ApplyPlugin;
    /** 可注入的复制实现；默认用 node:fs 复制 libDir 里的 *.js。 */
    copyFiles?: CopyFiles;
    /** 可注入的时间源；默认 Date.now。 */
    now?: () => number;
}
export interface ReloadStatus {
    reloads: number;
    lastReloadAt: number | null;
    lastError: string | null;
    watching: boolean;
    coreVersion: string | null;
}
export declare class ReloadController {
    readonly libDir: string;
    readonly stagingRoot: string;
    private readonly applyPlugin;
    private readonly copyFiles;
    private readonly now;
    private currentFiber;
    private currentMod;
    private currentDir;
    private prevDir;
    private reloading;
    private watcher;
    private watchTimer;
    private stagingSeq;
    reloads: number;
    lastReloadAt: number | null;
    lastError: string | null;
    watching: boolean;
    currentVersion: string | null;
    constructor(options: ReloadControllerOptions);
    status(): ReloadStatus;
    /**
     * 启动时初始加载：copy → import → 挂载。失败只记 lastError（不抛），
     * 等下一次 watcher / 端点触发重试。幂等：已有活跃 fiber 时直接返回 ok。
     */
    initialLoad(): Promise<'ok' | 'failed'>;
    /** 事务式 reload；重入返回 busy。 */
    reload(): Promise<'ok' | 'busy' | 'failed'>;
    /** 启动 fs.watch 监听 libDir，debounce 后触发 reload。重复调用无副作用。 */
    startWatcher(debounceMs?: number): void;
    stopWatcher(): void;
    /** 卸载当前 core fiber 并停止 watcher（shell ctx.effect 清理路径调用）。 */
    dispose(): Promise<void>;
    private doReload;
    private stage;
    private importCore;
    /** 只保留「当前 + 上一代」目录，其余删除（含失败的 staging 目录）。 */
    private prune;
}
