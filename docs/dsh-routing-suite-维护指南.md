# dsh-routing-suite 维护指南（injector + preset）

> **本文件是 dsh-routing-suite 在本机的唯一维护参考。**
> 日后 DSH 升级、或上游更新时，先读本文件，再动手。
> 维护原则：tarball 是 injector 唯一真源；preset 改动必须 bump `?v=` 并跑 selftest；
> 同步上游前先核对第二节定制清单是否已被上游吸收，避免重复打补丁。

- 上游：https://github.com/yjh051108/dsh-routing-suite （`injector/` + `preset/` + `graded/`）
  发行仓库：https://github.com/yjh051108/dsh-super-injector （release 挂预构建 tgz 资产）
- 本机安装：injector + preset（router-standard / router-spec），不含 graded
- 基线：DSH Desktop 2.0.10 / 内核 `@deepseek-ai/dsh@0.1.5-rc.2`（2026-09-20 复核仍为 rc.2）
- 状态口径：上游 issue/PR 的"已吸收/未合入"均以 2026-09-20 为准，同步时先重新核实

---

## 一、当前落地形态（2026-09-20 复核）

| 组件 | 形态 | 位置 |
|---|---|---|
| **injector 0.3.5** | tarball（预构建包，唯一真源） | `~/.dsh/storages/vendor/dsh-super-injector-0.3.5.tgz` |
| **preset router-standard** | 目录（DSH 只扫一级子目录） | `~/.dsh/.agent-presets/router-standard/` |
| **preset router-spec** | 目录 | `~/.dsh/.agent-presets/router-spec/` |
| **graded** | 未安装 | — |

- 旧版 0.3.3 tarball 已从 vendor 移除；如需回滚，从 release 重取 `v0.3.3` 资产按第三节重装。
- profile 依赖（`~/.dsh/profiles/web/package.json`）：`"@dsh-external/dsh-super-injector": "file:…/dsh-super-injector-0.3.5.tgz"`，并列于 `dsh.profile.bundles`。
- preset 生效戳现值（会腐化，以 `agent.cordis.yml` 实际值为准）：std bootstrap `?v=94`、executor `?v=52`、spec `?v=2`。
- **私有维护仓**：https://github.com/Ztyss/dsh-routing-local （PRIVATE）——injector v0.3.5 源码（A1/A3 已烘进 src，A2/A4 走 `injector/scripts/local-pack.mjs`）+ 本机定制 presets + 本指南副本。本地工作副本 `%TEMP%\dsh-routing-local`（随用随弃，权威在远端，git 需 `http.sslBackend schannel` 穿 TLS 重置）。同步上游先在仓里做 diff/重放，push 后再落回本机。

**为什么用 tarball**：源码目录形态约 1.2 MB 且长期占位；tarball 形态 ~140 KB、`node_modules`
内只有一份实体、删源码目录后完全自洽。上游 `lib/` 不入 git，release 资产由 `prepare.mjs`
构建；从源码重建需 `node scripts/prepare.mjs`（纯 node，不需要 DSH 检出）。

**关键机制**：

1. tarball 是唯一真源——直接改 `node_modules` 活副本会在下次 install 被覆盖；正确改法：解包 tgz → 改 → 重打包 → 重装（第三节）。
2. 本包是预构建产物，重打包时必须剥 `devDependencies`/`peerDependencies`/sourcemap/客户端 UI（第二节 A 组）。
3. 注入器运行时只 import `node:*`，dist 自包含；能工作全靠宿主 ctx 注入的服务。
4. 改 injector host 侧代码必须重启 DSH；preset 侧只需 bump `?v=` 由新会话挂载，无需重启。

---

## 二、本地定制总清单（同步/重打包时必须逐项保住）

### injector：基于远程 0.3.5 资产的四项后处理

| # | 定制 | 依据 | 上游状态 |
|---|---|---|---|
| A1 | `lib/index.js` loadCache 裸访问 → 可选链 `internal?.loadCache?.keys() ?? []`（守卫：唯一命中才改，0.3.5 在 L9119） | dev_plugin_status 崩溃 | 未吸收 |
| A2 | 剥 sourcemap（`//# sourceMappingURL=` 注释 + `.map` 文件），改完 `node --check` 双文件 | 发布瘦身 | 0.3.5 带 2 个 .map，需剥 |
| A3 | `lib/client.js` 整文件换本机 shim（`inject=["slots"]` + 空 `apply`；换前断言上游包装头 `window.__ModuleLoader__.load({`） | 不需要插件管理设置页 | 0.3.5 带 160 行 UI，需换 |
| A4 | package.json 剥 devDeps/peerDeps、version 对齐 tag、description 沿用本机文案 | 私有包 404 / 口径统一 | 未吸收 |

### preset router-standard（bootstrap / agent.cordis.yml）

| # | 定制 | 依据 | 上游状态 |
|---|---|---|---|
| B1 | persona 双键：同一段文案挂 `text` + `prefix`（0.1.2 取 text、0.1.5+ 取 prefix） | issue #112 / PR #110 | PR open 未合 |
| B2 | `sessionEvents(session)` shim：0.1.5 起 Session 无 `.events`，唯一读口 `snapshotEvents()` | 同上 | 同上 |
| B3 | 阶段 0 纳入 MCP 工具：codegraph_explore 紧跟 grep，wiki 两件随后，web_search 退最后 | 本机口味 | 无上游诉求 |
| B4 | engram 整体退役（工具名/白名单/memory-mute 机制全删；`categorizeDomain` 的 memory 分支是通用域分类，保留） | 15 个 engram 名 13 个不存在 | 无上游诉求 |
| B5 | `skill` 进 META_TOOLS + GLOBAL_SAFE 常驻层（否则阶段 0–2 门控把技能目录清空） | PR #117（close #116） | open 未合 |
| B6 | 委派会话豁免阶段门控：pre-step / applyStageRestrict / installMetaShim 三处 `parentSession` 守卫（连同 assemble 原有共四处，selftest 断言 >=4） | PR #120（close #119） | open 未合 |
| B7 | 验证档 stage guide 的 shell 纪律行（v1.27）：>60s 命令走 `run_in_background:true` + `job_output` 轮询；探针自退出；未确认退出勿前台接 `| tail` | issue #36 附带 | open 未合 |

### preset router-standard/gitbash-executor.mjs

| # | 定制 | 依据 | 上游状态 |
|---|---|---|---|
| C1 | `run()` 信号融合：外部中止 relay 进同一 AbortController（已中止则立即 relay）；`timerFired` 标志位分类——超时→`timedOut`、停轮→`aborted`；finally 清定时器+摘监听。修 `timeoutMs` 被 `spec.signal ||` 短路永不生效 + 中止误分类 | issue #36（含配套 selftest 四组断言） | open 未合 |

### preset router-spec

| # | 定制 | 依据 | 上游状态 |
|---|---|---|---|
| D1 | persona 双键 + sessionEvents shim（与 B1/B2 同款，live 入口 `-v10` 上游本已修好） | 同 B1/B2 | 同上 |
| D2 | 读图判定用能力查询（`imageCapableRoute()` + `modlens_read_image` 桥回退）取代模型名启发式（本机 5 个图像模型 4 个名字不含 vision） | 本机能力事实 | 无上游诉求 |

**selftest 纪律**：`router-bootstrap-v34.selftest.mjs` 与 `gitbash-executor.selftest.mjs`
必须原位运行保持 PASS；bootstrap 有别名文件（`router-bootstrap.mjs` /
`router-bootstrap.selftest.mjs`），改完用字节复制同步。给 executor 写注释时勿原样引用
旧写法字面量——D 组守卫按字面量扫源码，注释里出现即误报。

---

## 三、injector 重打包工作流（解包 → 改 → 重打包 → 重装）

```powershell
$v = "$env:USERPROFILE\.dsh\storages\vendor"
$work = "$env:TEMP\spi-work"
# 1) 取远程资产——release 直连会 TLS 断连，必须 curl --ssl-no-revoke；真实资产名查 expanded_assets/<tag> 或 api.github.com
curl.exe -sL --ssl-no-revoke -o "$work\pkg.tgz" <release 资产 URL>
# 2) 解包（tar 有两品种：System32 bsdtar 不认 --force-local 但直接吃 Windows 路径；
#    Git Bash GNU tar 相反——按 `tar --version` 是否含 bsdtar 选旗标）
# 3) 在解出的 package/ 里套第二节 A1–A4
# 4) 剥 sourcemap + node --check 双文件
# 5) 重打包（必须 package/ 顶层；不带 devDeps/peerDeps）
Set-Location $work; tar -czf "$v\dsh-super-injector-<ver>.tgz" package
# 6) 重装（cwd 不能在 vendor）
dsh plugin --profile web add "@dsh-external/dsh-super-injector@file:…/dsh-super-injector-<ver>.tgz"
# 7) 改了 host 侧代码 → 重启 DSH 后新会话验证
```

**格式约束**：tarball 内必须 `package/` 顶层目录；不带 devDeps/peerDeps（私有包公共 registry 404）。

**环境坑（2026-09-20 实踩，复现先看）**：

1. tar 两品种：bsdtar 遇 `--force-local` 报 Unknown option → exit 1；GNU tar 需要 `--force-local` 才吃 Windows 盘符路径。
2. Windows PowerShell 5.1：原生命令 stderr 走 `2>&1` 会被 `Stop` 方言抬成终止错误——原生调用放 `Continue` 护栏里，用 `$LASTEXITCODE` 判成败。
3. release 下载：Invoke-WebRequest / pnpm 直连 `releases/download/*` 断连；用 `curl.exe --ssl-no-revoke`。

---

## 四、升级流程

### DSH 内核升级后

1. 记录新内核版本（`resources\app\node_modules\@deepseek-ai\dsh\package.json`）。
2. 重跑 persona 双键验证：比对 `@deepseek-ai/dsh-persona` 的 Config schema 还认不认 `prefix`；字段变了按 B1 手法加键。
3. 重跑 `session.events` 检查（`Select-String -Path "$env:USERPROFILE\.dsh\.agent-presets\*\*.mjs" -Pattern "session\??\.events"`），确认 `snapshotEvents()` 与 `header` 仍在。
4. 用内核 `discoverPresets` 确认无 `broken`；`dev_plugin_status` 再报错按 A1 思路找裸访问。
5. 重启 DSH，新会话选 Router Standard 实发一条消息确认全链路。

### 上游更新后

1. **preset**：取 `preset/router-standard` 与 `preset/router-spec` → 对照第二节 B/C/D 清单（上游已吸收的跳过）→ 平铺同步到 `.agent-presets/<name>/`（不要整目录多套一层）→ bump `?v=` → 双 selftest → 新会话验证。PR #110/#117/#120 与 issue #36 合入后，B1/B2、B5、B6、B7/C1 可从清单退役。
2. **injector**：取 release 资产 → 第三节流程 → A1–A4 逐项核对（上游若已修 A1 即跳过）→ 重装 → 重启 DSH。

---

## 五、验证与卸载

```powershell
# 注入器进入组装树
dsh --profile web --dump-config | Select-String "dsh-super-injector"
# 预设落地（每个一级目录必须直接含 agent.cordis.yml）
Test-Path "$env:USERPROFILE\.dsh\.agent-presets\router-standard\agent.cordis.yml"
# 预设内代码自检（必须原位运行）
node "$env:USERPROFILE\.dsh\.agent-presets\router-standard\router-bootstrap-v34.selftest.mjs"
node "$env:USERPROFILE\.dsh\.agent-presets\router-standard\gitbash-executor.selftest.mjs"
```

卸载：

```powershell
dsh plugin --profile web remove @dsh-external/dsh-super-injector
Remove-Item "$env:USERPROFILE\.dsh\.agent-presets\router-standard" -Recurse
Remove-Item "$env:USERPROFILE\.dsh\.agent-presets\router-spec" -Recurse
```

---

## 六、简史

| 日期 | 动作 | 依据 |
|---|---|---|
| 2026-09-14 | 首装 0.3.3：内核适配（B1/B2/A1）+ 打包瘦身（A2–A4）+ preset 本机口味（B3/B4/D2） | issue #112、engram 三版本考证 |
| 2026-09-15 | 上游产出 #116/#117（skill 常驻）、#119/#120（委派豁免），均为 open PR | 上游 |
| 2026-09-19 | 上游产出 issue #36（executor 信号短路，open，无 PR） | 上游 |
| 2026-09-20 | injector 0.3.3→0.3.5（A1–A4 重放，release 资产直取）；同步 #117/#120（B5/B6）；修复 #36（C1+B7）；清临时文件；本指南精简重写 | release v0.3.5 |
| 2026-09-20 | 建私有维护仓 Ztyss/dsh-routing-local：injector 0.3.5 源码 fork（A1/A3 烘入 src + local-pack 打包脚本）+ presets 同仓；root commit 365c2a6 | 用户指令 |
