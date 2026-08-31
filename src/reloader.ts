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
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  symlinkSync,
  watch as fsWatch,
  type FSWatcher,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** 挂载后返回的可卸载 fiber（真实环境即 Cordis 的 ctx.plugin 返回值）。 */
export interface HotFiber {
  dispose: () => void | Promise<void>
}

/** 挂载一个 core 模块命名空间（{ name, inject, apply }），返回带 dispose() 的 fiber。 */
export type ApplyPlugin = (mod: unknown) => HotFiber | Promise<HotFiber>

/** 把 srcDir 里的可运行代码搬进 destDir（可注入，测试用）。 */
export type CopyFiles = (srcDir: string, destDir: string) => Promise<void>

export interface ReloadControllerOptions {
  /** 部署目录（shell 自身所在目录，即 lib/）。 */
  libDir: string
  /** 版本化暂存根目录（~/.dsh/bridge-reload）。 */
  stagingRoot: string
  /** 把导入的 core 模块挂载成 fiber；真实环境 = ctx.plugin(mod)。 */
  applyPlugin: ApplyPlugin
  /** 可注入的复制实现；默认用 node:fs 复制 libDir 里的 *.js。 */
  copyFiles?: CopyFiles
  /** 可注入的时间源；默认 Date.now。 */
  now?: () => number
}

export interface ReloadStatus {
  reloads: number
  lastReloadAt: number | null
  lastError: string | null
  watching: boolean
  coreVersion: string | null
}

/** 从 core 模块命名空间里取版本号（优先 BRIDGE_VERSION，回退 version）。 */
function versionOf(mod: unknown): string | null {
  const m = mod as { BRIDGE_VERSION?: unknown; version?: unknown } | null | undefined
  const v = m?.BRIDGE_VERSION ?? m?.version
  return typeof v === 'string' ? v : null
}

/** 从 from 起向上找最近的 node_modules（供 staging 目录链接 bare import 用）。 */
function findNodeModules(from: string): string | null {
  let dir = from
  while (true) {
    const nm = join(dir, 'node_modules')
    if (existsSync(nm)) return nm
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/**
 * 默认复制实现：把 libDir 里的全部 *.js 平铺复制进 destDir。
 * 关键：staging 目录位于部署包目录树之外，core.js 的 bare import（ws / qrcode /
 * @deepseek-ai/*）不会沿 staging 向上解析到部署包的 node_modules，故额外在
 * destDir 内建一个 node_modules 符号链接指向部署包最近的 node_modules——相对依赖
 * （./x.js）随目录热换，bare 依赖保持固定共享。找不到 node_modules 时静默跳过
 * （测试 fixture 的 core.js 无 bare import）。
 */
async function defaultCopyFiles(srcDir: string, destDir: string): Promise<void> {
  mkdirSync(destDir, { recursive: true })
  for (const name of readdirSync(srcDir)) {
    if (!name.endsWith('.js')) continue
    copyFileSync(join(srcDir, name), join(destDir, name))
  }
  const nm = findNodeModules(dirname(srcDir))
  if (nm !== null) {
    try {
      symlinkSync(nm, join(destDir, 'node_modules'), 'dir')
    } catch {
      // 已存在或平台不支持符号链接：忽略，等下一次 reload 重试
    }
  }
}

export class ReloadController {
  readonly libDir: string
  readonly stagingRoot: string
  private readonly applyPlugin: ApplyPlugin
  private readonly copyFiles: CopyFiles
  private readonly now: () => number

  private currentFiber: HotFiber | null = null
  private currentMod: unknown = null
  private currentDir: string | null = null
  private prevDir: string | null = null
  private reloading = false
  private watcher: FSWatcher | null = null
  private watchTimer: ReturnType<typeof setTimeout> | null = null
  private stagingSeq = 0

  // ---- 对外状态字段 ----
  reloads = 0
  lastReloadAt: number | null = null
  lastError: string | null = null
  watching = false
  currentVersion: string | null = null

  constructor(options: ReloadControllerOptions) {
    this.libDir = options.libDir
    this.stagingRoot = options.stagingRoot
    this.applyPlugin = options.applyPlugin
    this.copyFiles = options.copyFiles ?? defaultCopyFiles
    this.now = options.now ?? (() => Date.now())
  }

  status(): ReloadStatus {
    return {
      reloads: this.reloads,
      lastReloadAt: this.lastReloadAt,
      lastError: this.lastError,
      watching: this.watching,
      coreVersion: this.currentVersion,
    }
  }

  /**
   * 启动时初始加载：copy → import → 挂载。失败只记 lastError（不抛），
   * 等下一次 watcher / 端点触发重试。幂等：已有活跃 fiber 时直接返回 ok。
   */
  async initialLoad(): Promise<'ok' | 'failed'> {
    if (this.currentFiber !== null) return 'ok'
    try {
      const dir = await this.stage()
      let mod: unknown
      try {
        mod = await this.importCore(dir)
      } catch (e) {
        this.lastError = `import 失败: ${String(e)}`
        return 'failed'
      }
      try {
        this.currentFiber = await this.applyPlugin(mod)
        this.currentMod = mod
        this.currentDir = dir
        this.prevDir = null
        this.currentVersion = versionOf(mod)
        this.lastError = null
        return 'ok'
      } catch (e) {
        this.lastError = `apply 失败: ${String(e)}`
        this.currentDir = null
        this.prevDir = null
        return 'failed'
      }
    } catch (e) {
      this.lastError = `stage 失败: ${String(e)}`
      return 'failed'
    } finally {
      this.prune()
    }
  }

  /** 事务式 reload；重入返回 busy。 */
  async reload(): Promise<'ok' | 'busy' | 'failed'> {
    if (this.reloading) return 'busy'
    this.reloading = true
    try {
      return await this.doReload()
    } finally {
      this.reloading = false
    }
  }

  /** 启动 fs.watch 监听 libDir，debounce 后触发 reload。重复调用无副作用。 */
  startWatcher(debounceMs = 400): void {
    if (this.watcher !== null) return
    try {
      this.watcher = fsWatch(this.libDir, () => {
        if (this.watchTimer !== null) clearTimeout(this.watchTimer)
        this.watchTimer = setTimeout(() => {
          this.watchTimer = null
          void this.reload()
        }, debounceMs)
        this.watchTimer.unref?.()
      })
      this.watching = true
    } catch {
      this.watching = false
    }
  }

  stopWatcher(): void {
    if (this.watchTimer !== null) {
      clearTimeout(this.watchTimer)
      this.watchTimer = null
    }
    if (this.watcher !== null) {
      this.watcher.close()
      this.watcher = null
    }
    this.watching = false
  }

  /** 卸载当前 core fiber 并停止 watcher（shell ctx.effect 清理路径调用）。 */
  async dispose(): Promise<void> {
    this.stopWatcher()
    const fiber = this.currentFiber
    this.currentFiber = null
    if (fiber !== null) await fiber.dispose()
  }

  // ---- 内部 ----

  private async doReload(): Promise<'ok' | 'failed'> {
    let dir: string
    try {
      dir = await this.stage()
    } catch (e) {
      this.lastError = `stage 失败: ${String(e)}`
      this.prune()
      return 'failed'
    }

    let mod: unknown
    try {
      mod = await this.importCore(dir)
    } catch (e) {
      // import 失败：不动旧实例，只记 lastError
      this.lastError = `import 失败: ${String(e)}`
      this.prune()
      return 'failed'
    }

    const prevFiber = this.currentFiber
    const prevMod = this.currentMod
    const prevDir = this.currentDir
    try {
      // 先卸载旧 fiber（Phase A 清理路径生效：路由 disposer 逆序释放），再挂新 core
      if (prevFiber !== null) await prevFiber.dispose()
      const fiber = await this.applyPlugin(mod)
      this.currentFiber = fiber
      this.currentMod = mod
      this.prevDir = prevDir
      this.currentDir = dir
      this.currentVersion = versionOf(mod)
      this.lastError = null
      this.reloads += 1
      this.lastReloadAt = this.now()
      this.prune()
      return 'ok'
    } catch (e) {
      // 新 apply 抛错：回滚到旧模块（旧 fiber 重新可用）
      this.lastError = `apply 失败: ${String(e)}`
      if (prevMod !== null) {
        try {
          this.currentFiber = await this.applyPlugin(prevMod)
          this.currentMod = prevMod
          this.currentVersion = versionOf(prevMod)
          // 目录保持 prevDir / currentDir 不变：旧模块仍是活跃代
        } catch (e2) {
          this.lastError = `apply 失败: ${String(e)}；回滚也失败: ${String(e2)}`
          this.currentFiber = null
          this.currentMod = null
          this.currentVersion = null
        }
      } else {
        this.currentFiber = null
        this.currentMod = null
        this.currentDir = null
        this.prevDir = null
        this.currentVersion = null
      }
      this.prune()
      return 'failed'
    }
  }

  private async stage(): Promise<string> {
    const ts = this.now()
    let name = String(ts)
    while (existsSync(join(this.stagingRoot, name))) {
      this.stagingSeq += 1
      name = `${ts}-${this.stagingSeq}`
    }
    const dir = join(this.stagingRoot, name)
    await this.copyFiles(this.libDir, dir)
    return dir
  }

  private async importCore(dir: string): Promise<unknown> {
    const url = pathToFileURL(join(dir, 'core.js')).href
    return await import(url)
  }

  /** 只保留「当前 + 上一代」目录，其余删除（含失败的 staging 目录）。 */
  private prune(): void {
    const keep = new Set<string>()
    if (this.currentDir !== null) keep.add(this.currentDir)
    if (this.prevDir !== null) keep.add(this.prevDir)
    let names: string[]
    try {
      names = readdirSync(this.stagingRoot)
    } catch {
      return
    }
    for (const n of names) {
      const full = join(this.stagingRoot, n)
      if (keep.has(full)) continue
      try {
        rmSync(full, { recursive: true, force: true })
      } catch {
        // 忽略：下次 prune 再清理
      }
    }
  }
}
