// ReloadController 离线单测（node:test，无真实 DSH ctx）：
// 覆盖初始加载 / 热换新版本 + 旧 fiber dispose / import 失败保留旧版 / apply 抛错回滚 /
// reload 重入 busy / staging 剪枝只留两代。
// 运行：node test/hotreload.test.mjs（或随 pnpm test 先跑本单测再跑 smoke）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ReloadController } from '../lib/reloader.js'

/** 把一代 core.js 写进 libDir（apply 把自身版本推进 ctx.applyLog，记录副作用）。 */
function writeCore(libDir, version, { throwOnApply = false } = {}) {
  const body = throwOnApply
    ? `export const name = 'fixture-core'\nexport const inject = []\nexport const BRIDGE_VERSION = '${version}'\nexport function apply(ctx) { throw new Error('apply boom') }\n`
    : `export const name = 'fixture-core'\nexport const inject = []\nexport const BRIDGE_VERSION = '${version}'\nexport function apply(ctx) { ctx.applyLog.push(BRIDGE_VERSION) }\n`
  writeFileSync(join(libDir, 'core.js'), body)
}

/** 写一个语法错误的 core.js，模拟 import 失败。 */
function writeBrokenCore(libDir) {
  writeFileSync(join(libDir, 'core.js'), 'export const name = "x"\nthis is a syntax error {')
}

/** 最小 fake：applyPlugin 由测试注入（调用 mod.apply 记录副作用 + 返回带 dispose 的 fiber）。 */
function makeRecorder() {
  const applyLog = []
  const disposed = []
  const ctx = { applyLog }
  const applyPlugin = async (mod) => {
    await mod.apply(ctx)
    return {
      dispose: async () => {
        disposed.push(mod.BRIDGE_VERSION)
      },
    }
  }
  return { ctx, applyLog, disposed, applyPlugin }
}

function setup(version) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-hotreload-'))
  const libDir = join(root, 'lib')
  const stagingRoot = join(root, 'staging')
  mkdirSync(libDir, { recursive: true })
  writeCore(libDir, version)
  const recorder = makeRecorder()
  const controller = new ReloadController({ libDir, stagingRoot, applyPlugin: recorder.applyPlugin })
  return { root, libDir, stagingRoot, controller, ...recorder }
}

function cleanup(root) {
  rmSync(root, { recursive: true, force: true })
}

test('初始加载成功；reload 换新版本并 dispose 旧 fiber', async (t) => {
  const { root, libDir, controller, applyLog, disposed } = setup('v1')
  t.after(() => cleanup(root))

  assert.equal(await controller.initialLoad(), 'ok')
  assert.deepEqual(applyLog, ['v1'])
  assert.equal(controller.currentVersion, 'v1')
  assert.equal(controller.reloads, 0)

  writeCore(libDir, 'v2')
  assert.equal(await controller.reload(), 'ok')
  assert.deepEqual(applyLog, ['v1', 'v2'])
  assert.deepEqual(disposed, ['v1'], '旧 fiber 应在新版本生效前被 dispose')
  assert.equal(controller.currentVersion, 'v2')
  assert.equal(controller.reloads, 1)
  assert.equal(controller.lastError, null)
})

test('import 失败（语法错）保留旧版本运行并记 lastError', async (t) => {
  const { root, libDir, controller, applyLog } = setup('v1')
  t.after(() => cleanup(root))
  assert.equal(await controller.initialLoad(), 'ok')

  writeBrokenCore(libDir)
  assert.equal(await controller.reload(), 'failed')
  assert.ok((controller.lastError ?? '').includes('import'), controller.lastError)
  assert.equal(controller.currentVersion, 'v1', '旧版本仍应活跃')
  assert.deepEqual(applyLog, ['v1'], 'import 失败不应触发任何新 apply')
})

test('新 apply 抛错回滚到旧模块（旧 fiber 重新可用）', async (t) => {
  const { root, libDir, controller, applyLog, disposed } = setup('v1')
  t.after(() => cleanup(root))
  assert.equal(await controller.initialLoad(), 'ok')

  writeCore(libDir, 'v2', { throwOnApply: true })
  assert.equal(await controller.reload(), 'failed')
  assert.ok((controller.lastError ?? '').includes('apply boom'), controller.lastError)
  assert.equal(controller.currentVersion, 'v1', '回滚后应回到旧版本')
  assert.deepEqual(applyLog, ['v1', 'v1'], '回滚应重新挂载旧模块（旧 fiber 重新可用）')
  assert.deepEqual(disposed, ['v1'], '换新前旧 fiber 已 dispose')
})

test('reload 重入返回 busy', async (t) => {
  const { root, libDir, controller } = setup('v1')
  t.after(() => cleanup(root))
  assert.equal(await controller.initialLoad(), 'ok')

  writeCore(libDir, 'v2')
  const p1 = controller.reload()
  const p2 = controller.reload()
  assert.equal(await p2, 'busy')
  assert.equal(await p1, 'ok')
  assert.equal(controller.currentVersion, 'v2')
})

test('staging 剪枝只留两代目录', async (t) => {
  const { root, libDir, stagingRoot, controller } = setup('v1')
  t.after(() => cleanup(root))
  assert.equal(await controller.initialLoad(), 'ok')
  writeCore(libDir, 'v2')
  assert.equal(await controller.reload(), 'ok')
  writeCore(libDir, 'v3')
  assert.equal(await controller.reload(), 'ok')

  assert.equal(controller.currentVersion, 'v3')
  assert.equal(readdirSync(stagingRoot).length, 2, '应只保留当前 + 上一代')
})

/** 造一个 ESM 伪包（node_modules 顶层条目）：package.json(type:module) + index.js 导出 marker。 */
function writeFakePackage(pkgDir, marker) {
  mkdirSync(pkgDir, { recursive: true })
  const name = pkgDir.split('/').pop()
  writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ name, type: 'module', version: '1.0.0', main: 'index.js' }))
  writeFileSync(join(pkgDir, 'index.js'), `export const marker = ${JSON.stringify(marker)}\n`)
}

test('两层 node_modules 合并：远层依赖可解析、近层同名优先', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-hotreload-'))
  t.after(() => cleanup(root))

  // 远层 root/node_modules：只有这里有 far-only-dep；shared-dep 的 marker 为 'far'。
  const farNm = join(root, 'node_modules')
  writeFakePackage(join(farNm, 'far-only-dep'), 'from-far-layer')
  writeFakePackage(join(farNm, 'shared-dep'), 'far')

  // 近层 root/a/node_modules：不含 far-only-dep，但含 shared-dep（marker 为 'near'）。
  const nearNm = join(root, 'a', 'node_modules')
  writeFakePackage(join(nearNm, 'shared-dep'), 'near')

  // libDir 位于近层之下：root/a/lib；srcDir 向上第一个 node_modules 是近层。
  const libDir = join(root, 'a', 'lib')
  const stagingRoot = join(root, 'staging')
  mkdirSync(libDir, { recursive: true })

  const recorder = makeRecorder()
  const controller = new ReloadController({ libDir, stagingRoot, applyPlugin: recorder.applyPlugin })

  // fixture 自洽：近层不含 far-only-dep（否则测不到「远层被合并」这条路径）
  assert.equal(existsSync(join(nearNm, 'far-only-dep')), false, '近层不应含 far-only-dep')

  const writeMergedCore = (version) => {
    writeFileSync(
      join(libDir, 'core.js'),
      `import { marker as farOnly } from 'far-only-dep'\n` +
        `import { marker as shared } from 'shared-dep'\n` +
        `export const name = 'fixture-core'\n` +
        `export const inject = []\n` +
        `export const BRIDGE_VERSION = '${version}'\n` +
        `export function apply(ctx) { ctx.applyLog.push(BRIDGE_VERSION + '|' + farOnly + '|' + shared) }\n`,
    )
  }

  writeMergedCore('v1')
  assert.equal(await controller.initialLoad(), 'ok')
  assert.deepEqual(recorder.applyLog, ['v1|from-far-layer|near'], '远层依赖应可解析，近层同名优先')

  writeMergedCore('v2')
  assert.equal(await controller.reload(), 'ok')
  assert.deepEqual(recorder.applyLog, ['v1|from-far-layer|near', 'v2|from-far-layer|near'])
})
