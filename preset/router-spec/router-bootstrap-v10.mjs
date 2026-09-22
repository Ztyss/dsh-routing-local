/**
 * router-bootstrap: task-aware reasoning-mode router with a continuous
 * react↔spec axis.
 *
 * Reads the session's first REAL user message, classifies the task into a
 * continuous mode in [0,1] (0 = spec plan-first, 1 = react doer), and on the
 * first model request injects the matching persona and first-turn core tool
 * set. After the first durable tool/call the full preset catalog is exposed
 * and nothing is touched again; the mode derives from durable session events,
 * so resume/reload keeps it.
 *
 * The agent can read and tune its own routing through `dev_router_status` and
 * `dev_router_mode` (self-optimization loop) — mode accepts band names
 * (spec/spec-lean/balanced/react-lean/react), 0-100 numbers, or 0.0-1.0.
 *
 * Zero external imports on purpose: relative preset rows resolve bare
 * specifiers from the user home, where `@deepseek-ai/*` is not installed.
 * The router tools therefore inline a minimal schema compiler instead of
 * importing `defineTool` from `@deepseek-ai/dsh-tools`.
 *
 * ── v0.3.0: real-assembly-chain fixes ─────────────────────────────────────
 *
 * See the identical notes in `router-standard/router-bootstrap.mjs`:
 * first-turn classification now runs off `agent/inbox/claimed` (#13), and
 * near-field guidance is injected at `agent/pre-step` into the SAME request
 * as the user message (#34/#36/#55). The promoted branch restores the full
 * assembly in the RL-standard mode (#44).
 */

import {
  applyPersona, bandFor, bandOf, coreFor, parseMode, personaFor, sessionMode, testinessFor, clamp01,
  classifyTask, extractText, isComplexTask, sessionEvents
} from './router-core-v10.mjs'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'router-bootstrap'

/** Prompt assembly, the tools registry, and the LLM route must exist. */
export const inject = ['systemPrompt', 'tools', 'llm']

/** Minimal spec → JSON Schema compiler (subset of defineTool's work). */
function toJsonSchema(spec) {
  const properties = {}
  const required = []
  for (const [key, meta] of Object.entries(spec || {})) {
    const prop = { type: meta.type }
    if (Array.isArray(meta.enum)) prop.enum = meta.enum
    if (meta.description) prop.description = meta.description
    properties[key] = prop
    if (meta.required) required.push(key)
  }
  return { type: 'object', properties, required, additionalProperties: false }
}

export function apply(ctx, config) {
  const overrides = new Map() // session id -> explicit mode (number 0..1)
  const agents = new Map() // session id -> Agent (live handle, in-process only)
  const firstUserText = new Map() // session id -> first REAL user message text (#13)
  const sessionModels = new Map() // session id -> { provider, model } from assembled.variables (#9)

  // ── 路由模式（v0.2.0 命名，用户定义）───────────────────────────────────────
  // standard（默认，新）: RL 接口还原——首轮只有 RL 训练句 + shell/str_replace_editor，
  //   模型"想一段、做一段"（实测 25 步 / 24 工具调用 / 产出文件）。
  // spec（旧）: 深度思考优先——分类 persona（w7/REACT/SPEC）+ 保留全部 sections，
  //   模型首轮长思维链（101K 推理 0 行动是其特征，不是缺陷）。
  const routerMode = config.routerMode === 'spec' ? 'spec' : 'standard'
  const RL_PERSONA = 'You are a helpful software engineer assistant.'

  /** spec 路由模式的首轮工具面（旧行为；weak 也走 default 面）。 */
  function legacyCore(mode) {
    switch (bandOf(mode)) {
      case 'spec': return ['read', 'edit', 'glob', 'grep']
      default: return ['read', 'write', 'edit']
    }
  }

  /** 外部视觉桥工具候选：走外部引擎读图，不要求模型声明原生 image 输入。
   *  modlens 是本机已装的视觉桥；将来若有同类工具，往这里加名字即可。 */
  const BRIDGE_IMAGE_TOOLS = ['modlens_read_image']

  /** 路由读图能力缓存：同一 provider+model 只查一次（组装期不重复打 adapter）。 */
  const imageCapableCache = new Map()

  /**
   * 当前 model route 是否声明了原生 image 输入。
   *
   * 权威来源是 provider 的模型信息（`llm.resolveModelInfo().inputModalities`），
   * 与内核 `read_image` 自己的执行门控（dsh-tool-fs 的 assertImageCapableRoute）
   * 读的是同一份数据——所以这里的判断不会和执行时的判定打架。
   * 用模型名猜（曾用 /vision/i）会两向出错：名字含 vision 但不声明图像输入的会被
   * 误判为可用（调用时才报错），而声明了图像输入但名字不含 vision 的永远拿不到工具。
   *
   * @returns {Promise<boolean>} 无法判定时返回 false（保持首轮面不变，不猜测）。
   */
  async function imageCapableRoute(agent, providerArg, modelArg) {
    const routed = agent?.session?.requestHeader?.()?.config
    const provider = providerArg ?? routed?.provider ?? agent?.options?.provider
    const model = modelArg ?? routed?.model ?? agent?.options?.model
    if (!provider || !model) return false
    const key = provider + '\u0000' + model
    if (imageCapableCache.has(key)) return imageCapableCache.get(key)
    const info = await agent?.ctx?.get?.('llm')?.resolveModelInfo?.(provider, model)
    const capable = Array.isArray(info?.inputModalities) && info.inputModalities.includes('image')
    imageCapableCache.set(key, capable)
    return capable
  }

  /** Resolve the session's routing mode: explicit override > classification of
   *  the captured first real user message > durable transcript (resume).
   *  `firstUserText` holds RAW TEXT — it must be classified here, never fed to
   *  bandOf directly (Number(rawText) → NaN → spec). */
  function currentMode(session) {
    const override = overrides.get(session.id)
    if (override !== undefined) return override
    const text = firstUserText.get(session.id)
    if (text !== undefined) return classifyTask(text)
    return sessionMode(session)
  }

  // ── first-turn routing: agent/inbox/claimed (#13/#17/#32) ────────────────
  // The loop claims the inbox BEFORE assembling the system prompt
  // (dsh-agent-loop preStep: inbox.claim() → assemble()), and claim()
  // dispatches this agent-scoped event synchronously per claimed message —
  // so the FIRST request already sees the REAL classification. Filter
  // source.kind === 'user' so plugin-injected steering (approval notices,
  // runtime-context snapshots, agent-instructions) can never pin the band.
  ctx.on('agent/inbox/claimed', ({ agent, message }) => {
    if (message?.source?.kind !== 'user') return
    const text = extractText(message)
    if (!text.trim()) return
    const session = agent?.session
    if (session !== undefined && !firstUserText.has(session.id)) {
      firstUserText.set(session.id, text.trim())
    }
  })

  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const assembled = await next()
    const agent = context.agent
    if (agent === undefined) return assembled
    // Spawned subagents are clean child tasks with their own scoped tool sets;
    // the router governs root (user) sessions only (#5).
    if (agent.session?.header?.parentSession !== undefined) return assembled
    const session = agent.session
    agents.set(session.id, agent)

    const mode = currentMode(session)
    // #9 fix: the session-selected model rides assembled.variables, NOT agent.options.
    const selectedModel = assembled.variables?.model
      ? { provider: assembled.variables?.provider, model: assembled.variables.model }
      : undefined
    if (selectedModel?.model) sessionModels.set(session.id, selectedModel)
    const modelId = selectedModel?.model ?? agent.options?.model

    // ── 模式分派 ──
    // standard（RL 接口还原）: 首轮 system = 只有 RL 训练句；身份/Web 定位/工具引导/
    // 规则 sections 全部移除（minimal 的 complete:true 语义，实测 46 字符 system →
    // 25 步迭代工作流）。
    // spec（深度思考优先）: 分类 persona + 保留全部 sections（首轮超长思维链是特征）。
    const planSection = (assembled.sections || []).find((s) => /plan/i.test(s.name))
    let sections
    let core
    let persona
    if (routerMode === 'standard') {
      persona = RL_PERSONA
      sections = planSection
        ? [planSection, { name: 'router-persona', text: persona, order: 0 }]
        : [{ name: 'router-persona', text: persona, order: 0 }]
      core = new Set(['str_replace_editor']) // RL shape: shell + editor
    } else {
      persona = personaFor(mode, modelId)
      sections = applyPersona(assembled.sections, persona) // keep all other sections
      core = new Set(legacyCore(mode))
    }

    if (sessionEvents(session).some((event) => event.type === 'tool/call')) {
      // Promoted (#44): the RL-standard first-turn trim was a FIRST-REQUEST-ONLY
      // minimization. After the first durable tool/call the router stops
      // touching anything — standard mode restores the full sections/contexts;
      // spec mode keeps its classified persona over the untrimmed list.
      if (routerMode === 'standard') return assembled
      return { ...assembled, sections, contexts: [] }
    }

    const available = new Set(assembled.tools.map((tool) => tool.name))
    const shell = available.has('pwsh') ? 'pwsh' : available.has('bash') ? 'bash' : null
    if (shell === null) {
      throw new Error(`${name}: no platform shell in catalog`)
    }
    core.add(shell)
    // 读图能力（v0.2 修正）：不再靠模型名含 "vision" 这种启发式——问 provider 要权威答案。
    // 与内核 read_image 自己的门控同一数据源（llm.resolveModelInfo().inputModalities）。
    // 原生不支持读图时，退回外部视觉桥工具（若目录里有），它不依赖模型原生图像输入。
    try {
      const declared = await imageCapableRoute(agent, selectedModel?.provider, modelId)
      if (declared && available.has('read_image')) core.add('read_image')
      else if (!declared) for (const bridge of BRIDGE_IMAGE_TOOLS) {
        if (available.has(bridge)) { core.add(bridge); break }
      }
    } catch { /* 能力查询失败：保持首轮面不变，不做猜测 */ }

    return {
      ...assembled,
      sections,
      contexts: [],
      tools: assembled.tools.filter((tool) => core.has(tool.name)),
    }
  })

  // ── near-field routing guidance for weak mode (P14/P16/P17/P19/P20) ─────
  // Every REAL user message in a weak-mode session gets ONE fixed guidance
  // message placed immediately after it in the SAME request (near field,
  // cache-neutral, zero extra API calls — see header notes).
  // v19: depth-adaptive — SIMPLE tasks get the fast-convergence guide;
  // COMPLEX tasks get the deep-exploration guide (depth-first, information-
  // driven stop signal). The persona carries no hard converge anchor
  // (P27: information-driven convergence beats step-driven; user feedback:
  // flash was over-confident / too shallow on complex tasks).
  const GUIDE_WEAK =
    '\nRouter: classify this task (build or fix) now, then adopt the matching style — build: direct production; fix: inspect-first. Think deeply first, then commit and act.'
  const GUIDE_DEEP =
    '\nRouter: classify this task (build or fix) now, then adopt the matching style — build: direct production; fix: inspect-first. Think deeply about the architecture, edge cases, and integration points. Do not spend reasoning on the environment or tooling. Produce when your information is complete. End each reasoning block with a decision or an information need.'

  // Legacy capture fallback (host-plane deployments where session/event is
  // reachable). Guidance itself is NOT injected here — that would append a
  // pending next-step message and force an extra model round-trip (#55).
  ctx.on('session/event', (session, event) => {
    if (event.type !== 'user/message') return
    const data = event.data ?? {}
    if (data.source?.kind !== 'user') return // only real user messages
    const text = extractText(data)
    if (!firstUserText.has(session.id) && text.trim()) {
      firstUserText.set(session.id, text.trim())
    }
  })

  // Real-chain guidance injection: agent/pre-step is an agent-scoped
  // waterfall fired after assembly and BEFORE the claimed messages are
  // appended as user/message — inserting the guide into decision.messages
  // puts it directly behind the user message in the outgoing request.
  ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next()
    if (decision.kind !== 'enter') return decision
    const agent = payload.agent
    const session = agent?.session
    if (session === undefined) return decision
    const mode = currentMode(session)
    if (bandOf(mode) !== 'weak') return decision // strong modes need no guidance
    const messages = decision.messages ?? []
    if (messages.length === 0) return decision
    // The claimed batch sits at the head of decision.messages (runtime
    // context, when present, follows). Insert one guide after each REAL
    // user message, walking backwards so positions stay valid.
    const claimed = payload.messages ?? []
    const guides = []
    for (let i = claimed.length - 1; i >= 0; i--) {
      const message = claimed[i]
      if (message?.source?.kind !== 'user') continue
      const text = extractText(message)
      if (!text.trim()) continue
      const id = `router-guide-${message.id}`
      // Resume safety: a previously appended guide for the same message id
      // is already durable in the transcript — never inject twice.
      if (sessionEvents(session).some((event) => event.type === 'user/message' && event.data?.id === id)) continue
      guides.push({
        id,
        role: 'user',
        source: { kind: 'plugin', plugin: 'router-bootstrap' },
        content: [{ type: 'text', text: isComplexTask(text) ? GUIDE_DEEP : GUIDE_WEAK }],
      })
    }
    if (guides.length === 0) return decision
    const out = [...messages]
    for (const guide of guides) {
      const anchor = out.findIndex((message) => message.id === guide.id.slice('router-guide-'.length))
      if (anchor === -1) continue
      out.splice(anchor + 1, 0, guide)
    }
    return { ...decision, messages: out }
  })

  // ── router visibility & tuning (agent self-optimization) ────────────────
  const registerTool = (tool) => {
    ctx.effect(() => ctx.tools.register({
      ...tool,
      parameters: toJsonSchema(tool.parameters),
      // output.schema is already a plain JSON Schema; keep it as-is
    }))
  }

  const modeSpec = {
    mode: {
      type: 'string',
      required: true,
      description: 'band name (spec / weak / mixed / react), a 0-100 number, a 0.0-1.0 number, or auto to clear the override',
    },
  }

  function fmtMode(mode) {
    return typeof mode === 'string' ? mode : mode.toFixed(2)
  }

  registerTool({
    name: 'dev_router_status',
    description: 'Show this session\'s reasoning-mode routing: mode, band, persona, first-turn core tools, test-suppression, and whether an override is active.',
    parameters: {},
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    execute() {
      const session = currentSession()
      if (session === undefined) return 'no agent session'
      const mode = currentMode(session)
      const modelId = sessionModels.get(session.id)?.model ?? currentAgent()?.options?.model
      return [
        `router-mode=${routerMode} (standard=RL接口还原 / spec=深度思考优先)`,
        `mode=${fmtMode(mode)} (band=${bandFor(mode)})`,
        `persona=${personaFor(mode, modelId).replace(/\n/g, ' / ')}`,
        `core=[${coreFor(mode).join(', ')}]`,
        `testiness=${testinessFor(mode)}`,
        `override=${overrides.has(session.id) ? 'yes' : 'no'}`,
      ].join('\n')
    },
  })

  registerTool({
    name: 'dev_router_mode',
    description: 'Set this session\'s reasoning mode: spec (plan-first) / weak (internal routing, model decides per task) / mixed (transition, trap) / react (doer). Accepts band names, 0-100, or 0.0-1.0; use auto to return to task classification. The next request applies it.',
    parameters: modeSpec,
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    execute(args) {
      const parsed = parseMode(args.mode)
      if (parsed === null) return `invalid mode "${args.mode}": use spec/weak/mixed/react, 0-100, 0.0-1.0, or auto`
      const session = currentSession()
      if (session === undefined) return 'no agent session'
      if (parsed === 'auto') overrides.delete(session.id)
      else overrides.set(session.id, parsed === 'weak' ? 'weak' : clamp01(parsed))
      const current = currentMode(session)
      return `mode=${fmtMode(current)} (band=${bandFor(current)}) — next request applies`
    },
  })

  // ── mode-isolated subagent: run a task in a DIFFERENT reasoning mode,
  //    without touching this session's trajectory (P6 showed tail persona
  //    is ineffective; DSH's native subagent inherits this persona, so the
  //    only working isolation is a fresh LLM call with its own system). ──
  registerTool({
    name: 'dev_mode_subagent',
    description: 'Run one task in a DIFFERENT reasoning mode than this session, in a fresh isolated context (own system prompt). The current session trajectory is untouched. Mode: spec (plan-first) / weak (internal routing) / react (doer) / balanced. Returns the subagent\'s answer text.',
    parameters: {
      mode: { type: 'string', required: true, description: 'spec / weak / react / balanced (or 0-100)' },
      task: { type: 'string', required: true, description: 'the task to hand to the mode-isolated subagent' },
      maxTokens: { type: 'number', description: 'output cap (default 1024)' },
    },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) {
      const parsed = parseMode(args.mode)
      if (parsed === null || parsed === 'auto') return `invalid mode "${args.mode}"`
      const session = currentSession()
      const agent = session === undefined ? undefined : [...agents.values()].find((a) => a.session === session)
      if (agent === undefined || agent.options === undefined) return 'no agent route available'
      const { provider, model } = agent.options
      if (!provider || !model) return 'agent route missing provider/model'

      const persona = personaFor(parsed, model)
      const maxTokens = Number(args.maxTokens || 1024)
      let text = ''
      let reasoningChars = 0
      try {
        const stream = ctx.llm.stream({
          provider,
          model,
          system: persona,
          messages: [{ role: 'user', content: [{ type: 'text', text: String(args.task) }] }],
          maxTokens,
        })
        for await (const chunk of stream) {
          if (chunk.type === 'text-delta') text += chunk.text
          else if (chunk.type === 'reasoning-delta') reasoningChars += chunk.text.length
        }
      } catch (error) {
        return `subagent error: ${error && error.message ? error.message : String(error)}`
      }
      const head = text.slice(0, 3000)
      return `[mode-subagent ${bandFor(parsed)} | reasoning ${reasoningChars} chars]\n${head}${text.length > 3000 ? '\n…(truncated)' : ''}`
    },
  })

  function currentSession() {
    const agent = ctx.get('agent')
    if (agent !== undefined && agent.session !== undefined) return agent.session
    const last = [...agents.values()].at(-1)
    return last?.session
  }

  function currentAgent() {
    const session = currentSession()
    return session === undefined ? undefined : [...agents.values()].find((a) => a.session === session)
  }
}
