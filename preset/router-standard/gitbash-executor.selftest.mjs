/**
 * gitbash-executor.selftest — issue #36 修复回归（假 subprocess seam，不启动真 Git Bash）。
 *
 * 四组断言：
 *   A 超时强制：timeoutMs=80ms、自然退出点 400ms → 提前被杀、timedOut=true、spawn 收到的 signal 已 aborted
 *   B 外部中止：30ms 外部 abort → 快速返回、aborted=true、timedOut=false（不误报超时）
 *   C 自然退出：timedOut=false / aborted=false、stdout 正常收集
 *   D 回归守卫：源码不得再含 `signal: spec.signal || ac.signal`，融合与清理在场
 *
 * 运行（原位）：node gitbash-executor.selftest.mjs → SELFTEST PASS / FAIL
 */
import { apply } from './gitbash-executor.mjs'
import { readFileSync } from 'node:fs'

const check = (name, ok) => {
  if (!ok) { console.error('SELFTEST FAIL: ' + name); process.exit(1) }
  console.log('  ok  ' + name)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const textReader = (text) => ({ readFrom: () => ({ text, truncated: false }) })

/** seam：自然退出 naturalMs 后 resolve；signal 中止则 5ms 内 resolve（模拟宿主杀子进程）。 */
const killOnAbort = (naturalMs, exitCode = 0) => (spec, resolve) => {
  const t = setTimeout(() => resolve({ exitCode, signal: null }), naturalMs)
  spec.signal?.addEventListener('abort', () => {
    clearTimeout(t)
    setTimeout(() => resolve({ exitCode: 1, signal: null }), 5)
  }, { once: true })
}

/** 组装 executor：apply() 注入假 subprocess + 捕获 provide('shell')。 */
function build(onSpawn, stdoutText = '') {
  const spawned = []
  const provided = {}
  const ctx = {
    provide: (name, svc) => { provided[name] = svc },
    subprocess: {
      spawn(spec) {
        spawned.push(spec)
        return {
          pid: 424242,
          collected: { stdout: textReader(stdoutText), stderr: textReader('') },
          done: new Promise((resolve) => onSpawn(spec, resolve)),
        }
      },
    },
  }
  apply(ctx, {})
  return { shell: provided.shell, spawned }
}

const withTimeout = (p, ms) => Promise.race([
  p,
  sleep(ms).then(() => { throw new Error('case hung — 修复未生效') }),
])

// ---- A 超时强制（修复前：timeoutMs 被短路，挂满自然退出点 400ms）----
{
  const { shell, spawned } = build(killOnAbort(400), 'A-out')
  const t0 = Date.now()
  const r = await withTimeout(shell.run({ command: 'probe --forever', timeoutMs: 80 }), 5000)
  const dt = Date.now() - t0
  check('A1 timeout-kills-before-natural-exit (dt<300ms, 实测 ' + dt + 'ms)', dt < 300)
  check('A2 timedOut=true', r.timedOut === true)
  check('A3 aborted=false（超时不该报成中止）', r.aborted === false)
  check('A4 spawn 收到的 signal 已 aborted', spawned[0].signal?.aborted === true)
}

// ---- B 外部中止（用户停轮；修复前：外部信号短路 + 分类误报）----
{
  const { shell } = build(killOnAbort(10000))
  const external = new AbortController()
  const p = shell.run({ command: 'long job', timeoutMs: 10000, signal: external.signal })
  await sleep(30)
  external.abort()
  const r = await withTimeout(p, 3000)
  check('B1 external-abort 后快速返回（不挂死）', r != null)
  check('B2 aborted=true', r.aborted === true)
  check('B3 timedOut=false（外部中止不得误报成超时）', r.timedOut === false)
}

// ---- C 自然退出 ----
{
  const { shell } = build(killOnAbort(20, 0), 'hello-natural')
  const r = await shell.run({ command: 'echo hi', timeoutMs: 10000 })
  check('C1 timedOut=false', r.timedOut === false)
  check('C2 aborted=false', r.aborted === false)
  check('C3 stdout 正常收集', r.stdout?.text === 'hello-natural')
  check('C4 exitCode=0', r.exitCode === 0)
}

// ---- D 回归守卫（源码级）----
{
  const src = readFileSync(new URL('./gitbash-executor.mjs', import.meta.url), 'utf8')
  check('D1 不再含 signal: spec.signal || ac.signal', !src.includes('signal: spec.signal || ac.signal'))
  check('D2 spawn 使用融合后的 ac.signal', src.includes('signal: ac.signal'))
  check('D3 timerFired 标志位在（分类不读事后信号）', src.includes('timerFired'))
  check('D4 外部监听在 finally 清理', src.includes("removeEventListener('abort', relay)"))
}

console.log('SELFTEST PASS')
