# preset —— dsh-router-presets（router-standard / router-spec 的声明制入口）

本目录既是两个 preset 的**实现源**，也是一个可被 dsh 直接消费的**插件包**
（`@dsh-external/dsh-router-presets`）。本机以 github 直装消费：

```powershell
dsh plugin --profile web add "github:Ztyss/dsh-routing-local#path:preset"
# 重启 DSH 生效；装配后 loader 树里应出现 [active] router-presets (@dsh-external/dsh-router-presets)
```

## 为什么需要这一层（0.1.7 的机制变更）

| | 旧内核（≤ 0.1.6） | 新内核（0.1.7-rc.2 起） |
|---|---|---|
| preset 定义 | 目录 `$DSH_HOME/.agent-presets/<id>/`（`preset.yml` + `agent.cordis.yml`） | 组合里的 `@deepseek-ai/dsh-agent-preset` 声明（或等价的 `ctx.agentPresets.register()`） |
| 加载 | 内核扫描目录 | **不扫目录、不接受 preset 路径**；只认声明 |

内核自带文档的原文（`@deepseek-ai/dsh-agent-preset/skills/editing-cordis-compositions/SKILL.md:70`）：
*Nothing reads that directory any more.* —— 所以 `.agent-presets/` 那套在 0.1.7 下不再生效，
本目录把它换成「包 + 声明注册」。

## 两条装配路径（同一入口，行为一致）

`lib/index.mjs` 是唯一入口，用 `ctx.agentPresets.register()` 注册两份定义：

- **冷路径**：宿主启动按 profile 的 `dsh.profile.bundles` 读本包 `cordis.patch.yml`，
  插入一行 `@dsh-external/dsh-router-presets` → 挂载 `lib/index.mjs`。
- **热路径**：注入器 `dev_install_package` 建 junction 后 `loader.create('<包名>')` → 挂载同一入口。

两条路径在安装那一刻会并存，所以 `apply()` 做两级幂等：模块级引用计数（同实例多行只注册一次）
+ 重名容忍（别的行已注册时「借用」而非报错）。

## 目录结构

```
preset/
├── package.json            # 包名 / exports / dsh.bundle.patch（无构建步骤，git 直装免 prepare）
├── cordis.patch.yml        # 冷路径：insert 一行本包
├── lib/
│   ├── index.mjs           # 宿主入口：注册两个 preset（幂等）
│   ├── generation.mjs      # 代计数器（热重载用）
│   ├── router-bootstrap.mjs       # router-standard 稳定入口（thin wrapper）
│   ├── router-bootstrap-spec.mjs  # router-spec 稳定入口
│   └── presets/            # ★ 预设内容（由 tools/build-presets.mjs 从 <id>/agent.cordis.yml 生成）
├── router-standard/        # 运行副本：bootstrap/core/executor + 双 selftest + agent.cordis.yml（人读源）
├── router-spec/            # 运行副本（同上）
└── tools/
    ├── build-presets.mjs   # agent.cordis.yml → lib/presets/<id>.mjs
    ├── verify-presets.mjs  # 核验每条引用的可解析性（内核升级后先跑这个）
    ├── kernel-roots.mjs    # 内核 node_modules 根探测（profile / app）
    └── selftest.mjs        # 包级离线自检（幂等注册 / 代计数器 / 动态导入）
```

## 相对旧形态改了三处

1. **引用方式**：`./router-bootstrap-v34.mjs?v=94` → `@dsh-external/dsh-router-presets/router-bootstrap`。
   预设声明的解析基准是 profile 目录，相对路径会指错地方，所以走包内子路径（见 `package.json` 的 `exports`）。
2. **改名插件**：`@deepseek-ai/dsh-workflow-worker-thread` → `@deepseek-ai/dsh-workflow-ptc`
   （新内核里唯一不存在的包名；config 形状不变，仍是 `provider: spawn`）。
3. **热重载载体**：旧版靠改 `agent.cordis.yml` 里的 `?v=N` 让 ESM 换 URL；新内核不再读那份 YAML，
   于是改用「代」：`lib/router-bootstrap*.mjs` 每次 `apply` 按
   `$DSH_HOME/router-presets/generation.json` 的代数 `import('<实现>.mjs?gen=N')`——代一变就是新 URL、新模块。
   配合 `dev_reload_preset_live`（preset 自带工具）：改 `router-standard/*.mjs` → 调工具 → 代 +1 并 recompose → 下一轮生效。

## 维护动作

```powershell
cd <本仓>\preset
node tools/build-presets.mjs      # 改完 <id>/agent.cordis.yml 后必须重跑（--check 只报告）
node tools/verify-presets.mjs     # 65 条引用核验；内核升级后先跑这个
node tools/selftest.mjs           # 包级自检 8 项
node router-standard/router-bootstrap-v34.selftest.mjs   # 台账要求的原位 selftest
node router-standard/gitbash-executor.selftest.mjs
```

- `agent.cordis.yml` 仍是**人读的源**，`?v=` 仍是改动戳（bump 纪律不变，selftest 会断言它递增）；
  但它已不被内核读取——改完必须 `build-presets` 重新生成 `lib/presets/<id>.mjs` 再提交。
- 别名文件（`router-bootstrap.mjs` / `router-bootstrap.selftest.mjs` / `router-core*.mjs`）改完用字节复制同步。
- 预设 id 必须保持 `router-standard` / `router-spec`：历史会话头记的就是它们，改名等于旧会话无法恢复。
- 本包刻意**不声明 peerDependencies**：profile 的兼容性预检只看 `@deepseek-ai/dsh*` 的 peer 范围，
  写死范围反而会在内核升级时被整行禁用。
- `router-core-*.mjs` 被 bootstrap 静态 import、不在预设条目里，所以换代只刷新 bootstrap 本身
  （与旧版 `?v=N` 的语义一致）。
