/**
 * build-presets — 把 `<id>/agent.cordis.yml`（旧内核的目录制 preset 定义）转换成
 * 新内核（dsh 0.1.7+）能用的 JS 预设定义模块。
 *
 * 为什么需要它：0.1.7-rc.2 起 agent preset 不再是「目录 + YAML 文件」，而是
 * `@deepseek-ai/dsh-agent-preset` 声明行的 `config`（等价于把 YAML 里的 entry
 * 列表原样交给 AgentPresetRegistry）。本脚本做三件事：
 *   1. 解析 agent.cordis.yml（含 `!!js` 条件表达式，按当前平台求值成布尔）；
 *   2. 改写失效引用：相对 `./x.mjs` → 包内子路径；改名插件 → 现名；
 *   3. 输出 `lib/presets/<id>.mjs`（纯 JS 字面量，无运行时依赖）。
 *
 * agent.cordis.yml 仍是**人读的源**（`?v=` 仍是改动戳），但它不再被内核读取——
 * 改完必须跑本脚本重新生成 lib/presets/<id>.mjs，再提交。
 *
 * 用法：node tools/build-presets.mjs [--check]
 *   --check 只报告不写文件。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspect } from 'node:util'

import { loadYaml } from './kernel-roots.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = dirname(HERE)
const CHECK = process.argv.includes('--check')

const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const SELF = PKG.name

/** `!!js <expr>` → `{ __js: <expr> }`，其余标量照常。
 * 注意：`!!js` 在 YAML 里展开成 `tag:yaml.org,2002:js`，注册短名 `!!js` 不生效
 * （会退化成普通字符串，再被当成真值 → 行被误禁用）。 */
const jsTag = {
  tag: 'tag:yaml.org,2002:js',
  resolve: (value) => ({ __js: String(value) }),
}

function parseEntryList(parse, text) {
  return parse(text, { customTags: [jsTag], logLevel: 'silent' })
}

/** 校验：任何残留的字符串 disabled / 相对 ./ 引用都必须让生成失败。 */
function audit(entries, where) {
  const problems = []
  const walk = (list, path) => {
    if (!Array.isArray(list)) return
    for (const entry of list) {
      if (!entry || typeof entry !== 'object') continue
      const label = `${path}/${entry.id ?? '?'}`
      if (entry.disabled !== undefined && typeof entry.disabled !== 'boolean') problems.push(`${label}: disabled 不是布尔（${JSON.stringify(entry.disabled)}）`)
      if (typeof entry.name === 'string' && entry.name.startsWith('.')) problems.push(`${label}: 残留相对引用 ${entry.name}`)
      if (Array.isArray(entry.config)) walk(entry.config, label)
    }
  }
  walk(entries, where)
  return problems
}

/** 旧引用 → 新引用。返回 null 表示保持不变。 */
function mapName(name) {
  if (typeof name !== 'string') return null
  const bare = name.replace(/\?v=\d+$/, '')
  const table = {
    './router-bootstrap-v34.mjs': `${SELF}/router-bootstrap`,
    './router-bootstrap-v10.mjs': `${SELF}/router-bootstrap-spec`,
    '@deepseek-ai/dsh-workflow-worker-thread': '@deepseek-ai/dsh-workflow-ptc',
  }
  return Object.hasOwn(table, bare) ? table[bare] : null
}

const changes = []

/** 递归改写一个 entry 列表（group 的 config 里还有子列表）。 */
function transform(entries, where) {
  if (!Array.isArray(entries)) return entries
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue
    const mapped = mapName(entry.name)
    if (mapped !== null) {
      changes.push(`${where}: ${entry.name} → ${mapped}`)
      entry.name = mapped
    }
    if (entry.disabled && typeof entry.disabled === 'object' && '__js' in entry.disabled) {
      const expr = entry.disabled.__js
      const value = Boolean(new Function(`return (${expr})`)())
      changes.push(`${where}: !!js ${expr} → ${value}`)
      entry.disabled = value
    }
    if (Array.isArray(entry.config)) transform(entry.config, `${where}/${entry.id ?? '?'}`)
  }
  return entries
}

/** 读 `<id>/preset.yml` 的展示字段（name / description / order）。 */
function readPresetMeta(id) {
  const text = readFileSync(join(ROOT, id, 'preset.yml'), 'utf8')
  const name = /^name:\s*(.+)$/m.exec(text)?.[1]?.trim().replace(/^["']|["']$/g, '')
  const description = /^description:\s*(.+)$/m.exec(text)?.[1]?.trim().replace(/^["']|["']$/g, '')
  const order = /^order:\s*(\d+)\s*$/m.exec(text)?.[1]
  return { name, description, order: order === undefined ? undefined : Number(order) }
}

const parse = await loadYaml()
const ids = ['router-standard', 'router-spec']
const summary = []
const problems = []

for (const id of ids) {
  const source = join(ROOT, id, 'agent.cordis.yml')
  const plugins = transform(parseEntryList(parse, readFileSync(source, 'utf8')), id)
  problems.push(...audit(plugins, id))
  const meta = readPresetMeta(id)
  const body = inspect(plugins, { depth: null, maxArrayLength: null, maxStringLength: null, breakLength: 100, compact: false })
  const out = `/**
 * ${id} 的 Cordis entry 列表（${meta.name ?? id}）。
 *
 * 由 tools/build-presets.mjs 从 ${id}/agent.cordis.yml 生成——那份 YAML 是人读的源
 * （\`?v=\` 是改动戳，内核已不再读取它）。改内容请改那份 YAML 再重新生成，不要手改本文件。
 *
 * 引用规则（新内核）：条目里的 \`name\` 用包内子路径（见 package.json 的 exports）；
 * 相对 \`./x.mjs\` 会被解析到 profile 目录而失效。
 */
export const id = ${JSON.stringify(id)}
export const name = ${JSON.stringify(meta.name ?? id)}
export const description = ${JSON.stringify(meta.description ?? '')}
export const order = ${JSON.stringify(meta.order ?? null)}
export const plugins = ${body}

export default { id, name, description, order, plugins }
`
  const target = join(ROOT, 'lib', 'presets', `${id}.mjs`)
  summary.push({ id, source, target, entries: plugins.length, meta })
  if (!CHECK) {
    if (!existsSync(dirname(target))) throw new Error(`缺少目录: ${dirname(target)}`)
    writeFileSync(target, out, 'utf8')
  }
}

console.log(CHECK ? '== check（未写文件）' : '== 已生成')
for (const row of summary) console.log(`- ${row.id}: ${row.entries} 顶层条目, name=${row.meta.name ?? '(缺)'}, order=${row.meta.order ?? '(缺)'}\n  ${row.source} → ${row.target}`)
console.log(`\n== 引用改写（${changes.length} 处）`)
for (const line of changes) console.log(`- ${line}`)

if (problems.length > 0) {
  console.error(`\n!! 校验失败（${problems.length} 条）`)
  for (const line of problems) console.error(`- ${line}`)
  process.exit(1)
}
console.log('\n== 校验通过：无残留相对引用，disabled 全为布尔')
