// ReloadController 离线单测（node:test，无真实 DSH ctx）：
// 覆盖初始加载 / 热换新版本 + 旧 fiber dispose / import 失败保留旧版 / apply 抛错回滚 /
// reload 重入 busy / staging 剪枝只留两代。
// 运行：node test/hotreload.test.mjs（或随 pnpm test 先跑本单测再跑 smoke）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
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
