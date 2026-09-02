/**
 * 自举热重载控制器（纯 Node，依赖注入便于单测）。
 *
 * 机制：把部署目录（libDir）里的全部 *.js 复制到版本化暂存目录
 * `stagingRoot/<时间戳>/`，再用 `await import(<该目录>/core.js)` 整体换新——
 * 模块缓存按文件 URL 键控，新目录 = 全新缓存键，core.js 及其相对静态依赖
 * （./protocol.js、./lsp.js、./work.js …）一并换新，core 内部 import 一行不用改。
 *
 * 回滚：保留上一代版本化目录与模块引用；新代码 apply 失败时用旧模块重新挂载。
 * 暂存目录只留「当前 + 上一代」，其余删除。每次 reload 的旧 ESM 模块图会留在
 * 进程模块表（不可回收，开发期已知可接受开销，见 docs/hot-reload.md）。
 */
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync, symlinkSync, watch as fsWatch, } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
/** 从 core 模块命名空间里取版本号（优先 BRIDGE_VERSION，回退 version）。 */
function versionOf(mod) {
    const m = mod;
    const v = m?.BRIDGE_VERSION ?? m?.version;
    return typeof v === 'string' ? v : null;
}
/**
 * 从 from 起向上收集**每一个**祖先 node_modules（最近优先）。
 *
 * 为什么必须收集全部而不是最近的第一个：pnpm 把依赖分层存放——近层
 * （`~/.dsh/profiles/web/node_modules`）只有 qrcode/ws 等，远层
 * （`~/.dsh/profiles/node_modules`）才有 @deepseek-ai/* 运行时包。若只链最近的，
 * staging 目录里的 `import '@deepseek-ai/cordis'` 会解析失败（ERR_MODULE_NOT_FOUND），
 * 导致首次激活 core 加载失败。合并所有层才能让「staging 目录外的 import」解析等价于
 * 「部署包原位」的解析（Node 逐层向上检查每个祖先 node_modules）。
 */
function collectNodeModules(from) {
    const found = [];
    let dir = from;
    while (true) {
        const nm = join(dir, 'node_modules');
        if (existsSync(nm))
            found.push(nm);
        const parent = dirname(dir);
        if (parent === dir)
            return found;
        dir = parent;
    }
}
/** 判断 p 处是否已存在任意条目（不跟随符号链接，悬空链接也算已存在）。 */
function entryExists(p) {
    try {
        lstatSync(p);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * 默认复制实现：把 libDir 里的全部 *.js 平铺复制进 destDir。
 * 关键：staging 目录位于部署包目录树之外，core.js 的 bare import（ws / qrcode /
 * @deepseek-ai/*）不会沿 staging 向上解析到部署包的 node_modules。因此把**所有**
 * 祖先 node_modules 的顶层条目合并式 symlink 进 destDir/node_modules（真实目录）：
 * 按最近→最远遍历，同名条目先到先得、后到的跳过——近层优先，与 Node 从导入文件向上
 * 逐层检查 node_modules 的「最近命中」语义一致。相对依赖（./x.js）随目录热换，bare
 * 依赖保持固定共享。找不到任何 node_modules 时静默跳过（测试 fixture 的 core.js
 * 无 bare import）。单个 symlink 失败（EEXIST/EPERM/平台不支持）只跳过该条目，不中断复制。
 */
async function defaultCopyFiles(srcDir, destDir) {
    mkdirSync(destDir, { recursive: true });
    for (const name of readdirSync(srcDir)) {
        if (!name.endsWith('.js'))
            continue;
        copyFileSync(join(srcDir, name), join(destDir, name));
    }
    const nms = collectNodeModules(dirname(srcDir));
    if (nms.length === 0)
        return;
    const nmDest = join(destDir, 'node_modules');
    try {
        mkdirSync(nmDest, { recursive: true });
    }
    catch {
        return; // 建目录失败（权限等）：放弃链接，不中断复制
    }
    for (const nm of nms) {
        let names;
        try {
            names = readdirSync(nm);
        }
        catch {
            continue;
        }
        for (const entry of names) {
            const linkPath = join(nmDest, entry);
            if (entryExists(linkPath))
                continue; // 同名已存在：近层优先，跳过远层同名条目
            try {
                symlinkSync(join(nm, entry), linkPath, 'dir');
            }
            catch {
                // EEXIST / EPERM / 平台不支持符号链接：跳过该条目，不中断复制
            }
        }
    }
}
export class ReloadController {
    libDir;
    stagingRoot;
    applyPlugin;
    copyFiles;
    now;
    currentFiber = null;
    currentMod = null;
    currentDir = null;
    prevDir = null;
    reloading = false;
    watcher = null;
    watchTimer = null;
    stagingSeq = 0;
    // ---- 对外状态字段 ----
    reloads = 0;
    lastReloadAt = null;
    lastError = null;
    watching = false;
    currentVersion = null;
    constructor(options) {
        this.libDir = options.libDir;
        this.stagingRoot = options.stagingRoot;
        this.applyPlugin = options.applyPlugin;
        this.copyFiles = options.copyFiles ?? defaultCopyFiles;
        this.now = options.now ?? (() => Date.now());
    }
    status() {
        return {
            reloads: this.reloads,
            lastReloadAt: this.lastReloadAt,
            lastError: this.lastError,
            watching: this.watching,
            coreVersion: this.currentVersion,
        };
    }
    /**
     * 启动时初始加载：copy → import → 挂载。失败只记 lastError（不抛），
     * 等下一次 watcher / 端点触发重试。幂等：已有活跃 fiber 时直接返回 ok。
     */
    async initialLoad() {
        if (this.currentFiber !== null)
            return 'ok';
        try {
            const dir = await this.stage();
            let mod;
            try {
                mod = await this.importCore(dir);
            }
            catch (e) {
                this.lastError = `import 失败: ${String(e)}`;
                return 'failed';
            }
            try {
                this.currentFiber = await this.applyPlugin(mod);
                this.currentMod = mod;
                this.currentDir = dir;
                this.prevDir = null;
                this.currentVersion = versionOf(mod);
                this.lastError = null;
                return 'ok';
            }
            catch (e) {
                this.lastError = `apply 失败: ${String(e)}`;
                this.currentDir = null;
                this.prevDir = null;
                return 'failed';
            }
        }
        catch (e) {
            this.lastError = `stage 失败: ${String(e)}`;
            return 'failed';
        }
        finally {
            this.prune();
        }
    }
    /** 事务式 reload；重入返回 busy。 */
    async reload() {
        if (this.reloading)
            return 'busy';
        this.reloading = true;
        try {
            return await this.doReload();
        }
        finally {
            this.reloading = false;
        }
    }
    /** 启动 fs.watch 监听 libDir，debounce 后触发 reload。重复调用无副作用。 */
    startWatcher(debounceMs = 400) {
        if (this.watcher !== null)
            return;
        try {
            this.watcher = fsWatch(this.libDir, () => {
                if (this.watchTimer !== null)
                    clearTimeout(this.watchTimer);
                this.watchTimer = setTimeout(() => {
                    this.watchTimer = null;
                    void this.reload();
                }, debounceMs);
                this.watchTimer.unref?.();
            });
            this.watching = true;
        }
        catch {
            this.watching = false;
        }
    }
    stopWatcher() {
        if (this.watchTimer !== null) {
            clearTimeout(this.watchTimer);
            this.watchTimer = null;
        }
        if (this.watcher !== null) {
            this.watcher.close();
            this.watcher = null;
        }
        this.watching = false;
    }
    /** 卸载当前 core fiber 并停止 watcher（shell ctx.effect 清理路径调用）。 */
    async dispose() {
        this.stopWatcher();
        const fiber = this.currentFiber;
        this.currentFiber = null;
        if (fiber !== null)
            await fiber.dispose();
    }
    // ---- 内部 ----
    async doReload() {
        let dir;
        try {
            dir = await this.stage();
        }
        catch (e) {
            this.lastError = `stage 失败: ${String(e)}`;
            this.prune();
            return 'failed';
        }
        let mod;
        try {
            mod = await this.importCore(dir);
        }
        catch (e) {
            // import 失败：不动旧实例，只记 lastError
            this.lastError = `import 失败: ${String(e)}`;
            this.prune();
            return 'failed';
        }
        const prevFiber = this.currentFiber;
        const prevMod = this.currentMod;
        const prevDir = this.currentDir;
        try {
            // 先卸载旧 fiber（Phase A 清理路径生效：路由 disposer 逆序释放），再挂新 core
            if (prevFiber !== null)
                await prevFiber.dispose();
            const fiber = await this.applyPlugin(mod);
            this.currentFiber = fiber;
            this.currentMod = mod;
            this.prevDir = prevDir;
            this.currentDir = dir;
            this.currentVersion = versionOf(mod);
            this.lastError = null;
            this.reloads += 1;
            this.lastReloadAt = this.now();
            this.prune();
            return 'ok';
        }
        catch (e) {
            // 新 apply 抛错：回滚到旧模块（旧 fiber 重新可用）
            this.lastError = `apply 失败: ${String(e)}`;
            if (prevMod !== null) {
                try {
                    this.currentFiber = await this.applyPlugin(prevMod);
                    this.currentMod = prevMod;
                    this.currentVersion = versionOf(prevMod);
                    // 目录保持 prevDir / currentDir 不变：旧模块仍是活跃代
                }
                catch (e2) {
                    this.lastError = `apply 失败: ${String(e)}；回滚也失败: ${String(e2)}`;
                    this.currentFiber = null;
                    this.currentMod = null;
                    this.currentVersion = null;
                }
            }
            else {
                this.currentFiber = null;
                this.currentMod = null;
                this.currentDir = null;
                this.prevDir = null;
                this.currentVersion = null;
            }
            this.prune();
            return 'failed';
        }
    }
    async stage() {
        const ts = this.now();
        let name = String(ts);
        while (existsSync(join(this.stagingRoot, name))) {
            this.stagingSeq += 1;
            name = `${ts}-${this.stagingSeq}`;
        }
        const dir = join(this.stagingRoot, name);
        await this.copyFiles(this.libDir, dir);
        return dir;
    }
    async importCore(dir) {
        const url = pathToFileURL(join(dir, 'core.js')).href;
        return await import(url);
    }
    /** 只保留「当前 + 上一代」目录，其余删除（含失败的 staging 目录）。 */
    prune() {
        const keep = new Set();
        if (this.currentDir !== null)
            keep.add(this.currentDir);
        if (this.prevDir !== null)
            keep.add(this.prevDir);
        let names;
        try {
            names = readdirSync(this.stagingRoot);
        }
        catch {
            return;
        }
        for (const n of names) {
            const full = join(this.stagingRoot, n);
            if (keep.has(full))
                continue;
            try {
                rmSync(full, { recursive: true, force: true });
            }
            catch {
                // 忽略：下次 prune 再清理
            }
        }
    }
}
