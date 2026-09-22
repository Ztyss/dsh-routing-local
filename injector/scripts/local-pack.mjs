#!/usr/bin/env node
/**
 * local-pack.mjs — dsh-routing-local 本地打包（定制 A2 + A4）
 *
 * 用法：node scripts/local-pack.mjs <版本，如 0.3.5> [输出目录，缺省 injector/]
 * 前置：lib/ 已构建（node scripts/prepare.mjs 或等价构建）
 *
 * 步骤（全部作用于打包副本，不污染源码树）：
 *   1. 复制源码树到 .local-pack/package（排除 node_modules / .local-pack）
 *   2. A2：剥 lib 内 sourceMappingURL 注释 + 删 .map
 *   3. A4：package.json 剥 devDependencies/peerDependencies、version 对齐参数
 *   4. A3 校验：lib/client.js 必须是本机 shim（含空 apply 且体积 < 2KB）
 *   5. tar 出 package/ 顶层 tgz（pnpm/DSH 可直接 file: 安装）
 */
import { cpSync, rmSync, readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const ver = process.argv[2]
if (!ver) {
  console.error('用法: node scripts/local-pack.mjs <版本，如 0.3.5> [输出目录]')
  process.exit(1)
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(process.argv[3] || root)
const stage = join(root, '.local-pack')

rmSync(stage, { recursive: true, force: true })
cpSync(root, join(stage, 'package'), {
  recursive: true,
  filter: (s) => !s.includes('node_modules') && !s.includes('.local-pack'),
})

const pkgDir = join(stage, 'package')
const lib = join(pkgDir, 'lib')
if (!existsSync(join(lib, 'index.js'))) {
  console.error('FAIL: lib/index.js 不存在——先跑 node scripts/prepare.mjs 构建再打包')
  process.exit(1)
}

// A2 剥 sourcemap
let stripped = 0
for (const f of readdirSync(lib)) {
  const p = join(lib, f)
  if (!f.endsWith('.js')) continue
  const t = readFileSync(p, 'utf8')
  const t2 = t.replace(/^\/\/# sourceMappingURL=.*\r?\n?/gm, '')
  if (t2 !== t) { writeFileSync(p, t2); stripped++ }
}
for (const f of readdirSync(lib)) {
  if (f.endsWith('.map')) { rmSync(join(lib, f)); stripped++ }
}

// A3 校验
const cli = readFileSync(join(lib, 'client.js'), 'utf8')
if (!cli.includes('function apply') || Buffer.byteLength(cli) > 2000) {
  console.error('FAIL: lib/client.js 不是本机 shim（过大或缺空 apply）——检查 src/client/index.ts')
  process.exit(1)
}

// A4 净化打包副本的 package.json
const pjPath = join(pkgDir, 'package.json')
const j = JSON.parse(readFileSync(pjPath, 'utf8'))
delete j.devDependencies
delete j.peerDependencies
j.version = ver
writeFileSync(pjPath, JSON.stringify(j, null, 2) + '\n')

// 出包（package/ 顶层）
const out = join(outDir, `dsh-super-injector-${ver}.tgz`)
rmSync(out, { force: true })
execSync(`tar -czf "${out}" package`, { cwd: stage, stdio: 'inherit' })
const size = statSync(out).size
if (size < 50000) { console.error(`FAIL: 包体积异常（${size} B）`); process.exit(1) }
console.log(`PACK   ${out} (${size} B)  剥 sourcemap ${stripped} 处`)
console.log(`INSTALL dsh plugin --profile web add "@dsh-external/dsh-super-injector@file:${out.replace(/\\/g, '/')}"`)
console.log('NOTE   host 侧代码变更——重启 DSH 后生效')
