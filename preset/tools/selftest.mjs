/**
 * selftest —— 不依赖宿主的离线自检（node tools/selftest.mjs）。
 *
 * 覆盖本次迁移新增/改动的三处逻辑：
 *   1. lib/index.mjs 的幂等注册：同一模块被两行挂载时只 register 一次，
 *      最后一次反注册才真正 unregister；
 *   2. lib/generation.mjs 的代计数器：读缺省 0、递增、可回读；
 *   3. lib/router-bootstrap*.mjs 的稳定入口：按代动态导入实现模块，
 *      代变化 → 模块 URL 变化（ESM 缓存击穿的前提）。
 */

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
let passed = 0
const check = (label, fn) => {
  fn()
  passed += 1
  console.log(`  PASS  ${label}`)
}
const checkAsync = async (label, fn) => {
  await fn()
  passed += 1
  console.log(`  PASS  ${label}`)
}

// ── 1. 幂等注册 ────────────────────────────────────────────────────────────
console.log('== lib/index.mjs 幂等注册')
const sandbox = mkdtempSync(join(tmpdir(), 'router-presets-selftest-'))
process.env.DSH_HOME = sandbox

const { default: plugin, apply } = await import(pathToFileURL(join(ROOT, 'lib', 'index.mjs')).href)

/** 最小 ctx 替身：只提供插件用到的 agentPresets / effect 接口。 */
function makeCtx() {
  const state = { registered: new Map(), registerCalls: 0, unregisterCalls: 0, disposers: [] }
  const ctx = {
    agentPresets: {
      async register(definition) {
        if (state.registered.has(definition.id)) throw new Error(`Duplicate agent preset: ${definition.id}`)
        state.registerCalls += 1
        state.registered.set(definition.id, definition)
        return async () => {
          state.unregisterCalls += 1
          state.registered.delete(definition.id)
        }
      },
      async list() {
        return [...state.registered.values()].map((definition) => ({ id: definition.id, name: definition.name }))
      },
    },
    effect(callback) {
      const disposer = callback()
      state.disposers.push(disposer)
      return disposer
    },
  }
  return { ctx, state }
}

const first = makeCtx()
await apply(first.ctx)
await checkAsync('第一次挂载：两个 preset 都注册成功', () => {
  assert.deepEqual([...first.state.registered.keys()].sort(), ['router-spec', 'router-standard'])
  assert.equal(first.state.registerCalls, 2)
})

const second = makeCtx()
// 第二个 ctx 模拟“第二个行”：共用同一个模块实例（同一 URL），
// disposer 统一收进 first.state.disposers 便于按挂载顺序释放。
const sharedCtx = {
  agentPresets: first.ctx.agentPresets,
  effect: (callback) => {
    const disposer = callback()
    first.state.disposers.push(disposer)
    return disposer
  },
}
await checkAsync('第二次挂载（同模块实例）：不重复注册', async () => {
  await apply(sharedCtx)
  assert.equal(first.state.registerCalls, 2, '不应产生新的 register 调用')
  assert.deepEqual([...first.state.registered.keys()].sort(), ['router-spec', 'router-standard'])
})

await checkAsync('两个行各自 dispose 后：只 unregister 一次', async () => {
  const disposers = first.state.disposers
  assert.equal(disposers.length, 4, '两次挂载 × 两个 preset = 4 个 disposer')
  await disposers[0]()
  await disposers[1]()
  assert.equal(first.state.unregisterCalls, 0, '第一轮 dispose 后计数仍 > 0，不应真正反注册')
  await disposers[2]()
  await disposers[3]()
  assert.equal(first.state.unregisterCalls, 2, '最后一个引用释放后每个 preset 反注册一次')
  assert.equal(first.state.registered.size, 0)
})

await checkAsync('重名容忍：别的行已注册同名 preset 时借用而非报错', async () => {
  const foreign = makeCtx()
  await foreign.ctx.agentPresets.register({ id: 'router-standard', plugins: [] })
  const callsBefore = foreign.state.registerCalls
  const { apply: freshApply } = await import(`${pathToFileURL(join(ROOT, 'lib', 'index.mjs')).href}?fresh=1`)
  await freshApply(foreign.ctx)
  assert.equal(foreign.state.registerCalls, callsBefore + 1, '只补注册缺失的 router-spec')
  assert.equal(foreign.state.unregisterCalls, 0)
})

// ── 2. 代计数器 ────────────────────────────────────────────────────────────
console.log('== lib/generation.mjs 代计数器')
const generation = await import(pathToFileURL(join(ROOT, 'lib', 'generation.mjs')).href)

check('缺省代 = 0', () => {
  assert.equal(generation.readGeneration('router-standard'), 0)
})
check('bump 后回读 = 1，且两个 preset 各自独立', () => {
  assert.equal(generation.bumpGeneration('router-standard'), 1)
  assert.equal(generation.readGeneration('router-standard'), 1)
  assert.equal(generation.readGeneration('router-spec'), 0)
  assert.equal(generation.bumpGeneration('router-spec'), 1)
  assert.equal(generation.bumpGeneration('router-standard'), 2)
})

// ── 3. 稳定入口 → 按代动态导入 ──────────────────────────────────────────────
console.log('== lib/router-bootstrap*.mjs 稳定入口')
await checkAsync('导出形状：name/inject/apply 与实现一致', async () => {
  const wrapper = await import(pathToFileURL(join(ROOT, 'lib', 'router-bootstrap.mjs')).href)
  const impl = await import(pathToFileURL(join(ROOT, 'router-standard', 'router-bootstrap-v34.mjs')).href)
  assert.equal(wrapper.name, impl.name)
  assert.deepEqual(wrapper.inject, impl.inject)
  assert.equal(typeof wrapper.apply, 'function')
})

await checkAsync('代变化 → 动态导入的模块 URL 不同（缓存击穿前提）', async () => {
  const implPath = pathToFileURL(join(ROOT, 'router-standard', 'router-bootstrap-v34.mjs')).href
  const a = await import(`${implPath}?gen=1`)
  const b = await import(`${implPath}?gen=1`)
  const c = await import(`${implPath}?gen=2`)
  assert.equal(a, b, '同代应命中缓存（同一个模块实例）')
  assert.notEqual(a, c, '换代必须拿到新模块实例')
})

rmSync(sandbox, { recursive: true, force: true })
console.log(`\n== ${passed} 项自检全部通过`)
