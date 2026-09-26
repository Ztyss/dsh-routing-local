/**
 * verify-presets —— 静态核验两份 preset 定义里的每个条目引用。
 *
 * 检查项：
 *   1. `cordis:*` 内置（group / include）→ 放行；
 *   2. 本包子路径（<包名>/xxx）→ 必须出现在 package.json 的 exports 里且目标文件存在；
 *   3. 其余裸包名（含 `pkg/subpath`）→ 必须在 profile 或 app 的 node_modules 里
 *      解析得到（子路径校验 exports/main）；
 *   4. disabled 必须都是布尔（非布尔会被 loader 当真值 → 行被误禁用）。
 *
 * 用法：node tools/verify-presets.mjs
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { kernelModuleRoots } from './kernel-roots.mjs'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
/** 内核包候选根：[profile 的 node_modules, app 的 node_modules, ...]。 */
const MODULE_ROOTS = kernelModuleRoots().map((root, index) => [index === 0 ? 'profile' : `root${index}`, root])

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const SELF = pkg.name

function resolvePackage(root, specifier) {
  const parts = specifier.split('/')
  const packageName = specifier.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]
  const subpath = specifier.startsWith('@') ? parts.slice(2).join('/') : parts.slice(1).join('/')
  const dir = join(root, ...packageName.split('/'))
  return { dir, packageName, subpath }
}

function checkSpecifier(specifier) {
  if (specifier.startsWith('cordis:')) return { ok: true, note: 'builtin' }

  if (specifier === SELF || specifier.startsWith(`${SELF}/`)) {
    const subpath = specifier === SELF ? '.' : `./${specifier.slice(SELF.length + 1)}`
    const target = pkg.exports?.[subpath]
    if (target === undefined) return { ok: false, note: `package.json exports 缺 ${subpath}` }
    const file = join(ROOT, target)
    return existsSync(file) ? { ok: true, note: `self → ${target}` } : { ok: false, note: `self 目标不存在: ${target}` }
  }

  for (const [label, root] of MODULE_ROOTS) {
    const { dir, subpath } = resolvePackage(root, specifier)
    if (!existsSync(dir)) continue
    if (subpath === '') return { ok: true, note: `${label}` }
    const manifestPath = join(dir, 'package.json')
    if (!existsSync(manifestPath)) return { ok: false, note: `${label}: 包内无 package.json` }
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const exportsField = manifest.exports
    const key = `./${subpath}`
    const candidates = []
    if (typeof exportsField === 'string') candidates.push(join(dir, exportsField))
    else if (exportsField && typeof exportsField === 'object') {
      const entry = exportsField[key] ?? exportsField[`./${subpath}.js`]
      if (typeof entry === 'string') candidates.push(join(dir, entry))
      else if (entry && typeof entry === 'object') {
        for (const value of Object.values(entry)) if (typeof value === 'string') candidates.push(join(dir, value))
      }
    }
    if (candidates.length === 0) return { ok: false, note: `${label}: exports 未声明 ${key}` }
    if (candidates.some((candidate) => existsSync(candidate))) return { ok: true, note: `${label} → ${subpath}` }
    return { ok: false, note: `${label}: ${key} 目标文件不存在` }
  }
  return { ok: false, note: 'app/profile 均未解析到该包' }
}

const results = []
const problems = []

function walk(entries, presetId) {
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue
    const where = `${presetId}/${entry.id ?? '?'}`
    if (typeof entry.name === 'string') {
      const outcome = checkSpecifier(entry.name)
      results.push({ where, name: entry.name, ...outcome })
      if (!outcome.ok) problems.push(`${where}: ${entry.name} — ${outcome.note}`)
    } else {
      problems.push(`${where}: 缺 name`)
    }
    if (entry.disabled !== undefined && typeof entry.disabled !== 'boolean') problems.push(`${where}: disabled 非布尔`)
    if (Array.isArray(entry.config)) walk(entry.config, where)
  }
}

for (const id of ['router-standard', 'router-spec']) {
  const module = await import(pathToFileURL(join(ROOT, 'lib', 'presets', `${id}.mjs`)).href)
  walk(module.plugins, id)
}

console.log(`== ${results.length} 条引用核验`)
const missing = results.filter((row) => !row.ok)
for (const row of results.filter((r) => r.ok)) console.log(`  OK  ${row.where.padEnd(34)} ${row.name}`)
for (const row of missing) console.log(`  !!  ${row.where.padEnd(34)} ${row.name} — ${row.note}`)

if (problems.length > 0) {
  console.error(`\n!! 失败 ${problems.length} 条`)
  for (const line of problems) console.error(`- ${line}`)
  process.exit(1)
}
console.log('\n== 全部通过')
