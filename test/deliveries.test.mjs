// 结果交付通知台账（deliveries.ts）单测：读写回环 / 上限淘汰 / 解析容错 / 缺文件。
// 运行：node test/deliveries.test.mjs（随 pnpm test 执行）
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { loadDeliveries, writeDeliveries, MAX_DELIVERIES } = await import(
  new URL('../lib/deliveries.js', import.meta.url).href
)

const rec = (sessionId, turnKey, overrides = {}) => ({
  sessionId,
  turnKey,
  title: '结果已就绪',
  body: `「${sessionId}」本轮已完成`,
  isSubagent: false,
  completedAt: 1000,
  ...overrides,
})

test('loadDeliveries：缺文件返回空数组', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-deliveries-'))
  assert.deepEqual(loadDeliveries(join(dir, 'none.json')), [])
  rmSync(dir, { recursive: true, force: true })
})

test('writeDeliveries + loadDeliveries：读写回环', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-deliveries-'))
  const file = join(dir, 'd.json')
  const rows = [rec('s1', 'k1'), rec('s2', 'k2', { isSubagent: true, completedAt: 2000 })]
  writeDeliveries(file, rows)
  const loaded = loadDeliveries(file)
  assert.equal(loaded.length, 2)
  assert.equal(loaded[0].sessionId, 's1')
  assert.equal(loaded[0].turnKey, 'k1')
  assert.equal(loaded[1].isSubagent, true)
  assert.equal(loaded[1].completedAt, 2000)
  rmSync(dir, { recursive: true, force: true })
})

test('writeDeliveries：超出 MAX_DELIVERIES 淘汰最旧', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-deliveries-'))
  const file = join(dir, 'cap.json')
  const rows = []
  for (let i = 0; i < MAX_DELIVERIES + 20; i++) rows.push(rec('s', `k${i}`, { completedAt: i }))
  writeDeliveries(file, rows)
  const loaded = loadDeliveries(file)
  assert.equal(loaded.length, MAX_DELIVERIES)
  assert.equal(loaded[0].turnKey, 'k20') // 淘汰最旧 20 条，保留最新 MAX_DELIVERIES 条
  assert.equal(loaded[loaded.length - 1].turnKey, `k${MAX_DELIVERIES + 19}`)
  rmSync(dir, { recursive: true, force: true })
})

test('loadDeliveries：解析容错（缺幂等键丢弃、非数组/坏 JSON 返回空）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-deliveries-'))
  // 混合：合法 1 条 + 缺 turnKey 1 条 + 缺 sessionId 1 条 + 非对象 1 条
  const file = join(dir, 'robust.json')
  writeFileSync(file, JSON.stringify({ version: 1, deliveries: [
    rec('s1', 'k1'),
    { sessionId: 's2', title: '缺 turnKey' },
    { turnKey: 'k3', title: '缺 sessionId' },
    'not-an-object',
    null,
  ] }))
  const loaded = loadDeliveries(file)
  assert.equal(loaded.length, 1)
  assert.equal(loaded[0].turnKey, 'k1')
  // 坏 JSON → 空数组
  writeFileSync(join(dir, 'bad.json'), '{not json')
  assert.deepEqual(loadDeliveries(join(dir, 'bad.json')), [])
  // deliveries 非数组 → 空数组
  writeFileSync(join(dir, 'nonarr.json'), JSON.stringify({ version: 1, deliveries: 'nope' }))
  assert.deepEqual(loadDeliveries(join(dir, 'nonarr.json')), [])
  rmSync(dir, { recursive: true, force: true })
})

test('writeDeliveries：幂等键去重职责由调用方承担（台账本身不做去重，仅落盘）', () => {
  // 台账是纯持久化层：不去重、不判定——重复键是否覆盖由 core.ts 的 confirm/filter 负责。
  const dir = mkdtempSync(join(tmpdir(), 'dsh-deliveries-'))
  const file = join(dir, 'dup.json')
  writeDeliveries(file, [rec('s1', 'k1'), rec('s1', 'k1')])
  assert.equal(loadDeliveries(file).length, 2)
  rmSync(dir, { recursive: true, force: true })
})

console.log(`deliveries.test.mjs 完成（MAX_DELIVERIES=${MAX_DELIVERIES}）`)
