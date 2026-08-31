/**
 * dsh-remote-control-bridge —— 稳定薄壳（此后几乎不再改）。
 *
 * DSH 以 Cordis 插件方式加载本包（profile bundles 里的 'dsh-remote-control-bridge'，
 * 入口 lib/index.js，导出 { name, inject, apply }；loader 把模块命名空间当插件对象用）。
 * 本壳只做三件事：
 *   1. boot 时启动 ReloadController 初始加载 core（业务整体在 src/core.ts，可热换）；
 *   2. 注册两个自举端点 POST /remote/reload、GET /remote/hot（鉴权与 core 同款）；
 *   3. fs.watch 部署 lib 目录，文件变化 debounce 后自动 reload。
 *
 * 除 node 内建与类型 import 外，本壳只静态 import ./auth.js 与 ./reloader.js（稳定平面，
 * 改动需重启进程）。core 通过 ReloadController 动态 import，从不静态引用。
 */
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allowLocalOrEnvToken, denied, json } from './auth.js';
import { ReloadController } from './reloader.js';
export const name = 'dsh-remote-control-bridge';
export const inject = ['webServer', 'sessions', 'agents', 'workspaceRegistry', 'sessionTitle', 'sessionPersistence', 'tools'];
/** 稳定薄壳版本：/remote/hot 的 shell 字段。改动 shell/auth/reloader 需重启才生效。 */
const SHELL_VERSION = '0.13.0';
export async function apply(ctx) {
    const envToken = process.env.DSH_REMOTE_TOKEN ?? '';
    // 部署目录 = shell 自身所在目录（lib/）；每次 reload 把这里的 *.js 复制到版本化暂存目录
    const libDir = dirname(fileURLToPath(import.meta.url));
    const stagingRoot = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'bridge-reload');
    const controller = new ReloadController({
        libDir,
        stagingRoot,
        applyPlugin: async (mod) => {
            // 把动态 import 的 core 模块命名空间（{ name, inject, apply }）挂成 Cordis 子 fiber；
            // await 让其 settle（core apply 启动错误在此抛出，交给控制器回滚到旧模块）。
            const fiber = ctx.plugin(mod);
            await fiber;
            return fiber;
        },
    });
    // boot 时初始加载 core：core.js 缺失 / import 失败只记 lastError，进程不崩，
    // 等下一次 watcher / 端点触发重试。
    try {
        await controller.initialLoad();
    }
    catch {
        // initialLoad 内部已记 lastError；此处兜底，绝不让 boot 失败拖垮进程
    }
    const reloadRoute = {
        kind: 'exact',
        path: '/remote/reload',
        handler: async (req, res) => {
            if (!allowLocalOrEnvToken(req, res, envToken))
                return denied(res);
            if (req.method !== 'POST')
                return json(res, { error: 'use POST' }, 405);
            const result = await controller.reload();
            if (result === 'busy')
                return json(res, { ok: false, error: 'busy' }, 409);
            if (result === 'failed')
                return json(res, { ok: false, error: controller.lastError ?? 'reload failed' }, 500);
            return json(res, { ok: true, ...controller.status() });
        },
    };
    const hotRoute = {
        kind: 'exact',
        path: '/remote/hot',
        handler: (req, res) => {
            if (!allowLocalOrEnvToken(req, res, envToken))
                return denied(res);
            return json(res, { ok: true, shell: SHELL_VERSION, ...controller.status() });
        },
    };
    const routeDisposers = [];
    routeDisposers.push(ctx.webServer.register(reloadRoute));
    routeDisposers.push(ctx.webServer.register(hotRoute));
    // fs.watch 部署 lib 目录（debounce ~400ms）；DSH_REMOTE_HOT_RELOAD=0 只关 watcher，端点仍可用
    if (process.env.DSH_REMOTE_HOT_RELOAD !== '0') {
        controller.startWatcher(400);
    }
    ctx.effect(() => () => {
        // 逆序释放两个路由 → 关 watcher → dispose core fiber（Phase A 清理路径生效）
        for (let i = routeDisposers.length - 1; i >= 0; i -= 1)
            routeDisposers[i]();
        void controller.dispose();
    });
}
