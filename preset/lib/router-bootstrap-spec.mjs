/**
 * router-bootstrap-spec —— router-spec 预设的稳定入口（thin wrapper）。
 *
 * 与 lib/router-bootstrap.mjs 同构：真实实现 ../router-spec/router-bootstrap-v10.mjs
 * 按「代」动态导入，配合 agentPresets.recompose() 实现热重载。
 */

import { readGeneration } from './generation.mjs'

const IMPL = '../router-spec/router-bootstrap-v10.mjs'

export const name = 'router-bootstrap'
export const inject = ['systemPrompt', 'tools', 'llm']

export async function apply(ctx, config) {
  const generation = readGeneration('router-spec')
  const impl = await import(`${IMPL}?gen=${generation}`)
  return impl.apply(ctx, config)
}
