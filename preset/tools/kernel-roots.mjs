/**
 * kernel-roots —— 定位「内核包」的 node_modules 根目录（离线工具共用）。
 *
 * 为什么需要：preset 条目引用的是内核包（@deepseek-ai/dsh-*）。本机有两处来源：
 *   - profile 的 node_modules（社区插件、以及 pnpm 物化下来的包）
 *   - DSH Desktop 安装目录里的 app/node_modules（内核本体）
 * 安装路径随机器/版本变化，所以按候选列表探测，别写死。
 */

import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** dsh 主目录（可用 DSH_HOME 覆盖）。 */
export function dshHome() {
  return process.env.DSH_HOME ?? join(homedir(), '.dsh')
}

/** 候选 node_modules 根（按优先级）。 */
export function kernelModuleRoots(profile = 'web') {
  const roots = [
    join(dshHome(), 'profiles', profile, 'node_modules'),
    process.env.DSH_APP_NODE_MODULES,
    'D:/ProgramFiles/DSH NEXT/resources/app/node_modules',
    process.env.DSH_CHECKOUT === undefined ? undefined : join(process.env.DSH_CHECKOUT, 'node_modules'),
  ]
  return [...new Set(roots.filter((root) => typeof root === 'string' && root.length > 0 && existsSync(root)))]
}

/**
 * 加载 YAML 解析器：优先用 profile 里那份（内核依赖），退回 app 那份。
 * @returns yaml 的 parse 函数
 */
export async function loadYaml(profile = 'web') {
  const candidates = [
    ...kernelModuleRoots(profile).map((root) => join(root, 'yaml', 'dist', 'index.js')),
    join(dshHome(), 'profiles', profile, 'node_modules', 'yaml', 'dist', 'index.js'),
  ]
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue
    try {
      const mod = await import(pathToFileURL(candidate).href)
      const parse = mod.parse ?? mod.default?.parse
      if (typeof parse === 'function') return parse
    } catch {
      continue
    }
  }
  throw new Error('找不到可用的 yaml 解析器（检查 profile node_modules 或 DSH_APP_NODE_MODULES）')
}
