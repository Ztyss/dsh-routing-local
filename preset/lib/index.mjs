/**
 * router-presets —— 本 bundle 的宿主入口插件。
 *
 * 做什么：把两个本地 agent preset（router-standard / router-spec）注册进
 * AgentPresetRegistry。0.1.7-rc.2 起 preset 不再是磁盘目录里的
 * `.agent-presets/<id>/agent.cordis.yml`，而是宿主组合里的一个声明
 * （`@deepseek-ai/dsh-agent-preset` 的 config）——本插件用同样的 config 形状
 * 调 `ctx.agentPresets.register()`，等价于一条声明行，但让「热装配」路径
 * （插件安装触发的 loader.create('<包名>')）也能立即生效。
 *
 * 双路径并存，所以 apply() 必须幂等：安装那一刻 patch 行与 loader.create 行会
 * 同时挂载本包（同 id 注册第二次会抛 Duplicate agent preset）。这里用两级兜底：
 *   1. 模块级引用计数：同一个模块实例被多行挂载时只注册一次，最后一个反注册；
 *   2. 重名容忍：若注册抛 duplicate 且名册里已有该 id，则视为“借用”别的行
 *      （不反注册），避免把已注册的 preset 拆掉。
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { dshHome } from './generation.mjs'
import routerSpec from './presets/router-spec.mjs'
import routerStandard from './presets/router-standard.mjs'

export const name = 'router-presets'

/** 需要宿主服务：preset 注册表。 */
export const inject = ['agentPresets']

/** 注册顺序即名册里未排序项的相对顺序。 */
const DEFINITIONS = [routerStandard, routerSpec]

/** id → { count, unregister }：本模块实例持有的注册（引用计数）。 */
const owned = new Map()

/** 把数据模块整理成 AgentPreset 声明的 config 形状（缺省字段不写，避免 schema 报错）。 */
function definitionOf(module) {
  const definition = { id: module.id, plugins: module.plugins }
  if (typeof module.name === 'string' && module.name.length > 0) definition.name = module.name
  if (typeof module.description === 'string' && module.description.length > 0) definition.description = module.description
  if (typeof module.order === 'number' && Number.isFinite(module.order)) definition.order = module.order
  return definition
}

/** 名册里是否已有该 id（重名容忍用）。 */
async function isRegistered(ctx, id) {
  try {
    return (await ctx.agentPresets.list()).some((row) => row.id === id)
  } catch {
    return false
  }
}

/**
 * 取得一次注册（幂等）。
 * @returns 'registered' | 'shared' | 'borrowed' | 'failed'
 */
async function acquire(ctx, definition) {
  const existing = owned.get(definition.id)
  if (existing !== undefined) {
    existing.count += 1
    return 'shared'
  }
  try {
    const unregister = await ctx.agentPresets.register(definition)
    owned.set(definition.id, { count: 1, unregister })
    return 'registered'
  } catch (error) {
    // 另一个行（或另一个模块实例）已经注册同名 preset：借用，不重复注册。
    if (await isRegistered(ctx, definition.id)) return 'borrowed'
    throw error
  }
}

/** 释放一次注册；计数归零才真正反注册。 */
async function release(id) {
  const record = owned.get(id)
  if (record === undefined) return
  record.count -= 1
  if (record.count > 0) return
  owned.delete(id)
  await record.unregister()
}

/** 落一份装机自检（同目录 status.json），便于事后核对注册结果。 */
function recordStatus(entry) {
  try {
    const dir = join(dshHome(), 'router-presets')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'status.json'), `${JSON.stringify(entry, null, 2)}\n`, 'utf8')
  } catch {
    /* 诊断写失败不影响注册 */
  }
}

export async function apply(ctx) {
  const outcome = {}
  const failed = []
  for (const module of DEFINITIONS) {
    const definition = definitionOf(module)
    try {
      outcome[definition.id] = await acquire(ctx, definition)
      // 借用来的注册不归本行所有：反注册交给真正的持有者。
      if (outcome[definition.id] !== 'borrowed') ctx.effect(() => () => release(definition.id), `router-presets:${definition.id}`)
    } catch (error) {
      outcome[definition.id] = 'failed'
      failed.push(`${definition.id}: ${error?.message ?? String(error)}`)
    }
  }

  let roster = []
  try {
    roster = (await ctx.agentPresets.list()).map((row) => row.id)
  } catch {
    /* 诊断用，失败忽略 */
  }
  recordStatus({
    at: new Date().toISOString(),
    source: 'bundle:@dsh-external/dsh-router-presets',
    outcome,
    failed,
    roster,
  })

  if (failed.length > 0) throw new Error(`router-presets 注册失败: ${failed.join('; ')}`)
}
