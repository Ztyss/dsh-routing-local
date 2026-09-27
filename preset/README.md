# preset —— dsh-router-presets（router-standard / router-spec 的装配入口）

本目录既是两个 preset 的**实现源**，也是一个可被 dsh 直接消费的**插件包**
（`@dsh-external/dsh-router-presets`）。本机以 github 直装消费：

```powershell
dsh plugin --profile web add "github:Ztyss/dsh-routing-local#path:preset"
# 重启 DSH 生效；装配后 loader 树里应出现 [active] router-presets (@dsh-external/dsh-router-presets)
```

## 装配方式

`lib/index.mjs` 是唯一入口，用 `ctx.agentPresets.register()` 注册两份定义
（`router-standard` / `router-spec`）；`cordis.patch.yml` 给宿主启动一个插入行。
宿主启动装配与热装配（super-injector 的 `dev_install_package` → `loader.create`）共用这一入口，
所以 `apply()` 做两级幂等：模块级引用计数（同实例多行只注册一次）+ 重名容忍（别的行已注册时「借用」而非报错）。

## 目录结构

```
preset/
├── package.json            # 包名 / exports / dsh.bundle.patch（无构建步骤，git 直装免 prepare）
├── cordis.patch.yml        # 宿主启动行：insert 一行本包
├── lib/
│   ├── index.mjs           # 宿主入口：注册两个 preset（幂等）
│   ├── generation.mjs      # 代计数器（热重载用）
│   ├── router-bootstrap.mjs       # router-standard 稳定入口（thin wrapper）
│   ├── router-bootstrap-spec.mjs  # router-spec 稳定入口
│   └── presets/            # 预设内容（由 tools/build-presets.mjs 从 <id>/agent.cordis.yml 生成）
├── router-standard/        # bootstrap/core/executor + 双 selftest + agent.cordis.yml（人读源）
├── router-spec/            # 同上
└── tools/
    ├── build-presets.mjs   # agent.cordis.yml → lib/presets/<id>.mjs
    ├── verify-presets.mjs  # 核验每条引用的可解析性（内核升级后先跑这个）
    ├── kernel-roots.mjs    # 内核 node_modules 根探测（profile / app）
    └── selftest.mjs        # 包级离线自检（幂等注册 / 代计数器 / 动态导入）
```

## 机制要点

- **引用口径**：条目 `name` 用包内子路径（`exports` 映射）；预设声明的解析基准是 profile 目录，
  相对 `./x.mjs` 不成立。插件名对齐当期内核（现有 `@deepseek-ai/dsh-workflow-ptc`）。
- **热重载**：`lib/router-bootstrap*.mjs` 每次 `apply` 按
  `$DSH_HOME/router-presets/generation.json` 的代数 `import('<实现>.mjs?gen=N')`——代一变即新模块 URL，
  绕开 ESM 缓存。预设自带工具 `dev_reload_preset_live` 做 `bumpGeneration()` + `recompose()`。
- **装机自检**：`$DSH_HOME/router-presets/status.json` 记录 outcome / failed / roster。

## 维护动作

```powershell
cd <本仓>\preset
node tools/build-presets.mjs      # 改完 <id>/agent.cordis.yml 后必须重跑（--check 只报告）
node tools/verify-presets.mjs     # 65 条引用核验；内核升级后先跑这个
node tools/selftest.mjs           # 包级自检 8 项
node router-standard/router-bootstrap-v34.selftest.mjs   # 台账要求的原位 selftest
node router-standard/gitbash-executor.selftest.mjs
```

- `<id>/agent.cordis.yml` 是**人读的源**，`?v=` 是改动戳（bump 纪律不变，selftest 会断言它递增）；
  内核不读这份 YAML——改完必须 `build-presets` 重新生成 `lib/presets/<id>.mjs` 再提交。
- 别名文件（`router-bootstrap.mjs` / `router-bootstrap.selftest.mjs` / `router-core*.mjs`）改完用字节复制同步。
- 预设 id 保持 `router-standard` / `router-spec`：会话头记的就是它们，改名等于历史会话无法恢复。
- 本包**不声明 peerDependencies**：profile 的兼容性预检只看 `@deepseek-ai/dsh*` 的 peer 范围，
  写死范围会被整行禁用。
- `router-core-*.mjs` 被 bootstrap 静态 import、不在预设条目里，所以换代只刷新 bootstrap 本身。
