/**
 * 代（generation）计数器 —— 本地 preset 的热重载机制。
 *
 * 旧内核（目录制 preset）靠改 YAML 里的 `?v=N` 让 ESM 产生新 URL 来绕过模块缓存；
 * 新内核里 preset 定义来自组合声明（本 bundle），YAML 不再被读取，所以把「代」
 * 提到一个独立的 JSON：稳定入口（lib/router-bootstrap*.mjs）每次 apply 都用
 * `?gen=<代>` 动态导入 lib/impl/ 下的真实实现——代一变就是新 URL、新模块。
 *
 * 文件：`$DSH_HOME/router-presets/generation.json`（可用 DSH_ROUTER_GENERATION_FILE 覆盖）
 * 递增：preset 自带的 dev_reload_preset_live 调 bumpGeneration() 后 recompose。
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** dsh 主目录：宿主通常注入 DSH_HOME，缺省退回家目录下的 .dsh。 */
export function dshHome() {
  return process.env.DSH_HOME ?? join(homedir(), '.dsh')
}

/** 代计数器文件路径。 */
export function generationFile() {
  return process.env.DSH_ROUTER_GENERATION_FILE ?? join(dshHome(), 'router-presets', 'generation.json')
}

/**
 * 读一个 preset 当前的代。
 * @param id preset id（router-standard / router-spec）
 * @returns 非负整数；文件缺失或损坏时回 0。
 */
export function readGeneration(id) {
  try {
    const data = JSON.parse(readFileSync(generationFile(), 'utf8'))
    const value = Number(data?.[id])
    return Number.isFinite(value) && value >= 0 ? value : 0
  } catch {
    return 0
  }
}

/**
 * 把一个 preset 的代 +1 并落盘。
 * @param id preset id
 * @returns 递增后的代
 */
export function bumpGeneration(id) {
  let data = {}
  try {
    const parsed = JSON.parse(readFileSync(generationFile(), 'utf8'))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed
  } catch {
    data = {}
  }
  const current = Number(data[id])
  const next = (Number.isFinite(current) && current >= 0 ? current : 0) + 1
  data[id] = next
  mkdirSync(dirname(generationFile()), { recursive: true })
  writeFileSync(generationFile(), `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  return next
}
