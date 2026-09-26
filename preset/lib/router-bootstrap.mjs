/**
 * router-bootstrap —— router-standard 预设的稳定入口（thin wrapper）。
 *
 * 真实实现在 ../router-standard/router-bootstrap-v34.mjs（与该 preset 的运行副本同文件）。这里不静态
 * 导入它，而是按「代」动态导入（`?gen=N`）：代一变，模块 URL 就变，ESM 缓存自然失效，于是
 * `agentPresets.recompose()` 重挂本行时拿到的是磁盘上的最新代码——这就是新内核
 * 下替代旧 `?v=N`（改 YAML）的热重载路径，见 lib/generation.mjs。
 *
 * 换实现文件（v35...）时只改下面的 IMPL 常量。
 */

import { readGeneration } from './generation.mjs'

const IMPL = '../router-standard/router-bootstrap-v34.mjs'

export const name = 'router-bootstrap'
export const inject = ['systemPrompt', 'tools', 'llm']

export async function apply(ctx, config) {
  const generation = readGeneration('router-standard')
  const impl = await import(`${IMPL}?gen=${generation}`)
  return impl.apply(ctx, config)
}
