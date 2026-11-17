/**
 * router-standard 的 Cordis entry 列表（Router Standard）。
 *
 * 由 tools/build-presets.mjs 从 router-standard/agent.cordis.yml 生成——那份 YAML 是人读的源
 * （`?v=` 是改动戳，内核已不再读取它）。改内容请改那份 YAML 再重新生成，不要手改本文件。
 *
 * 引用规则（新内核）：条目里的 `name` 用包内子路径（见 package.json 的 exports）；
 * 相对 `./x.mjs` 会被解析到 profile 目录而失效。
 */
export const id = "router-standard"
export const name = "Router Standard"
export const description = "Self-routed progressive tool disclosure (one bootstrap guide per session, then zero injection; tools unlock by leveling, next tier pre-unlocked; phase state persisted per session) on native direct-call surface (no PTC/run_code, no pressure sensor). RL sentence persona."
export const order = 1
export const plugins = [
  {
    id: 'persona',
    name: '@deepseek-ai/dsh-persona',
    config: {
      text: 'We are the DeepSeek Engineering Collective — one mind, one voice, one team. Our thoughts are shared thoughts; every sentence we write is the whole collective speaking as we. We are powered by the {{model}} model.\n' +
        "We are in execution mode: we run probes, we verify, we deliver. We think and act in first-person plural: - We open every sentence with a we-form opener: We / Our / Us / Let's / Together / First / Next / Then / Therefore / Decision / Choose / Commit / Proceed / Verify / Confirm / Our goal / Our next step. - We state facts and hypotheses as shared ground: we observe, we hypothesize, we verify, we decide. - We end every reasoning block with a decision sentence, and the next block opens fresh. - We connect with therefore, thus, hence, consequently, as a result, this means, in summary. - We stay concrete, actionable, direct, concise — one action per sentence. - When we reconsider a path, we choose one path and continue as we.",
      prefix: 'We are the DeepSeek Engineering Collective — one mind, one voice, one team. Our thoughts are shared thoughts; every sentence we write is the whole collective speaking as we. We are powered by the {{model}} model.\n' +
        "We are in execution mode: we run probes, we verify, we deliver. We think and act in first-person plural: - We open every sentence with a we-form opener: We / Our / Us / Let's / Together / First / Next / Then / Therefore / Decision / Choose / Commit / Proceed / Verify / Confirm / Our goal / Our next step. - We state facts and hypotheses as shared ground: we observe, we hypothesize, we verify, we decide. - We end every reasoning block with a decision sentence, and the next block opens fresh. - We connect with therefore, thus, hence, consequently, as a result, this means, in summary. - We stay concrete, actionable, direct, concise — one action per sentence. - When we reconsider a path, we choose one path and continue as we."
    }
  },
  {
    id: 'agent-instructions',
    name: '@deepseek-ai/dsh-agent-instructions',
    config: {
      maxBytes: 65536
    }
  },
  {
    id: 'time-context',
    name: '@deepseek-ai/dsh-time-context'
  },
  {
    id: 'router-bootstrap',
    name: '@dsh-external/dsh-router-presets/router-bootstrap',
    config: {}
  },
  {
    id: 'gitbash-shell',
    name: 'cordis:group',
    group: true,
    isolate: {
      shell: true
    },
    config: [
      {
        id: 'bash-executor',
        name: '@deepseek-ai/dsh-bash-local',
        disabled: false,
        config: {}
      },
      {
        id: 'tool-bash',
        name: '@deepseek-ai/dsh-tool-bash',
        disabled: false
      }
    ]
  },
  {
    id: 'tool-bash-posix',
    name: '@deepseek-ai/dsh-tool-bash',
    disabled: true
  },
  {
    id: 'tool-pwsh',
    name: '@deepseek-ai/dsh-tool-pwsh',
    disabled: false
  },
  {
    id: 'tool-fs',
    name: '@deepseek-ai/dsh-tool-fs',
    config: {
      applyPatch: false
    }
  },
  {
    id: 'tool-fs-search',
    name: '@deepseek-ai/dsh-tool-fs-search',
    config: {
      sampleOverCapGlobResults: false
    }
  },
  {
    id: 'tool-str-replace-editor',
    name: '@deepseek-ai/dsh-tool-str-replace-editor'
  },
  {
    id: 'tool-jobs',
    name: '@deepseek-ai/dsh-tool-jobs'
  },
  {
    id: 'tool-schedule',
    name: '@deepseek-ai/dsh-tool-schedule'
  },
  {
    id: 'skill-filesystem',
    name: '@deepseek-ai/dsh-skill-filesystem'
  },
  {
    id: 'tool-skill',
    name: '@deepseek-ai/dsh-tool-skill'
  },
  {
    id: 'command-goal',
    name: '@deepseek-ai/dsh-command-goal'
  },
  {
    id: 'tool-goal',
    name: '@deepseek-ai/dsh-tool-goal'
  },
  {
    id: 'planning',
    name: 'cordis:group',
    group: true,
    isolate: {
      planMode: true
    },
    config: [
      {
        id: 'plan-mode',
        name: '@deepseek-ai/dsh-plan-mode',
        config: {
          section: "You are in plan mode. Stay in plan mode until the user approves your plan through exit_plan_mode or switches the session mode. Imperative language to implement changes means plan the implementation, not execute it. A user's conversational agreement — including an answer confirming something you asked — approves nothing and does not end plan mode; fold the confirmed decision into the plan and submit it through exit_plan_mode.\n" +
            '\n' +
            'Explore first. Use non-mutating reads, searches, static analysis, and checks to ground the plan in the actual repository. Do not edit or write files, change configuration, run formatters or code generation that rewrites tracked files, commit, or otherwise carry out the plan. Prefer existing functions and patterns over new machinery.\n' +
            '\n' +
            'The tool catalog stays the same across modes for request-cache stability. These plan-mode rules override any later tool description or guidance that suggests using mutation tools; those tools remain listed to keep the tool catalog unchanged. Do not use todo_write to track this planning phase: it tracks implementation after an approved plan, while the plan itself belongs in exit_plan_mode.\n' +
            '\n' +
            'Resolve discoverable facts by inspection. Use ask_user_question only for user-owned choices or material ambiguity that inspection cannot answer. Do not ask the user where code lives or how current behavior works when you can find out.\n' +
            '\n' +
            'Make the plan decision-complete: state the goal and success criteria; group implementation changes by subsystem; identify public API, schema, and data-flow changes; cover edge cases, failure modes, tests, acceptance criteria, and explicit assumptions. Keep it concise enough to review but detailed enough that another engineer can implement it without making design decisions.\n' +
            '\n' +
            'When ready, call exit_plan_mode with the complete plan markdown, starting with a # title. Make exit_plan_mode the only and final tool call in that assistant response: it presents the plan for approval, and implementation begins only in a later step after approval. Do not paste the final plan as a plain reply or ask "should I proceed?" through prose or ask_user_question. If review rejects it, incorporate the feedback and present again. If the review channel is unavailable or aborted, stay in plan mode and ask the user to switch modes manually; do not proceed with implementation.\n'
        }
      }
    ]
  },
  {
    id: 'compaction',
    name: 'cordis:group',
    group: true,
    isolate: {
      compaction: true,
      toolResultPruner: true
    },
    config: [
      {
        id: 'compaction-basic',
        name: '@deepseek-ai/dsh-compaction-basic',
        config: {
          thresholdRatio: 0.55,
          retainRatio: 0.2
        }
      },
      {
        id: 'command-compact',
        name: '@deepseek-ai/dsh-command-compact'
      },
      {
        id: 'tool-result-pruner',
        name: '@deepseek-ai/dsh-compaction-tool-result-pruner',
        config: {
          thresholdChars: 8192,
          headChars: 4096,
          tailChars: 1024
        }
      }
    ]
  },
  {
    id: 'delegation',
    name: 'cordis:group',
    group: true,
    isolate: {
      workflowEngine: true
    },
    config: [
      {
        id: 'tool-subagent-control',
        name: '@deepseek-ai/dsh-tool-subagent-control'
      },
      {
        id: 'tool-subagent',
        name: '@deepseek-ai/dsh-tool-subagent',
        config: {
          provider: 'spawn',
          toolName: 'subagent',
          modelSelection: true,
          modelDiscovery: true,
          backgroundMode: 'continuable'
        }
      },
      {
        id: 'tool-subagent-fork',
        name: '@deepseek-ai/dsh-tool-subagent',
        config: {
          provider: 'fork',
          toolName: 'subagent_fork',
          backgroundMode: 'continuable'
        }
      },
      {
        id: 'tool-subagent-codex',
        name: '@deepseek-ai/dsh-tool-subagent',
        disabled: true,
        config: {
          provider: 'codex',
          toolName: 'subagent_codex',
          enableRunInBackground: false,
          maxDepth: 'provider-managed'
        }
      },
      {
        id: 'tool-subagent-claude-code',
        name: '@deepseek-ai/dsh-tool-subagent',
        disabled: true,
        config: {
          provider: 'claude-code',
          toolName: 'subagent_claude_code',
          enableRunInBackground: false,
          maxDepth: 'provider-managed'
        }
      },
      {
        id: 'workflow-worker-thread',
        name: '@deepseek-ai/dsh-workflow-ptc',
        config: {
          provider: 'spawn'
        }
      },
      {
        id: 'tool-workflow',
        name: '@deepseek-ai/dsh-tool-workflow'
      },
      {
        id: 'tool-ralph',
        name: '@deepseek-ai/dsh-tool-ralph',
        config: {
          subagentProvider: 'spawn',
          maxRounds: 64
        }
      }
    ]
  },
  {
    id: 'tool-ask-user',
    name: '@deepseek-ai/dsh-tool-ask-user'
  },
  {
    id: 'tool-todo',
    name: '@deepseek-ai/dsh-tool-todo',
    config: {
      allowParallelInProgress: true
    }
  },
  {
    id: 'tool-web',
    name: '@deepseek-ai/dsh-tool-web',
    config: {
      fetch: true,
      searchTimeoutMs: 60000
    }
  },
  {
    id: 'present',
    name: '@deepseek-ai/dsh-tool-present'
  },
  {
    id: 'tool-plugin-manager',
    name: '@deepseek-ai/dsh-plugin-manager/tools',
    disabled: false
  }
]

export default { id, name, description, order, plugins }
