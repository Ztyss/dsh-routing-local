# dsh-routing-local

dsh-routing-suite 的**私有维护仓**：同款组织方式（`injector/` + `preset/`），
收拢 injector v0.3.5 源码（含本地定制）与本机定制版 presets。

- 上游源：https://github.com/yjh051108/dsh-super-injector （injector，fork 自 tag v0.3.5）
- 组织参照：https://github.com/yjh051108/dsh-routing-suite
- 维护参考：**[docs/本地定制台账.md](docs/本地定制台账.md)**（唯一维护参考，权威副本在本仓）
- 内核基线：`@deepseek-ai/dsh@0.2.0-rc.2`（DSH Desktop 2.0.17-next）——已核验：65 条引用全部可解析、两 preset 注册成功

## 布局

```
injector/                      dsh-super-injector v0.3.5 源码 + 本地定制（本机以 github 直装消费）
  src/index.ts                 A1 loadCache 可选链（listPlugins）
  src/client/index.ts          A3 客户端 UI 置空 shim（整文件替代上游设置页）
  .npmrc                       auto-install-peers=false（git 直装 prepare 保命，见台账三节）
  scripts/local-pack.mjs       A2+A4 本地打包：剥 sourcemap + 剥 devDeps/peerDeps → package/ 顶层 tgz
preset/                        dsh-router-presets 包（本机以 github 直装消费，见 preset/README.md）
  package.json                 E1 包外壳：exports + dsh.bundle.patch（无构建步骤，免 prepare）
  cordis.patch.yml             E1 宿主启动行：insert 一行本包
  lib/index.mjs                E1/E4 宿主入口：注册两个 preset（幂等）
  lib/router-bootstrap*.mjs    E3 稳定入口：按「代」动态导入实现
  lib/presets/*.mjs            E2 预设内容（由 tools/build-presets.mjs 生成）
  tools/                       生成 / 核验 / 自检（build-presets · verify-presets · selftest）
  router-standard/             bootstrap/core/executor + 双 selftest + agent.cordis.yml（人读源，B1–B7/C1）
  router-spec/                 同上（D1/D2）
docs/本地定制台账.md            唯一维护参考（现状台账 + 安装/升级/验证流程）
```

`.gitignore`：`node_modules/`、`lib/*.map`、`*.tgz`、`.local-pack/` 不入库
（injector 的 `lib/` 入库走免构建直装；preset 包的 `lib/` 是手写源码，必须入库）。

## 定制台账（详见 docs 台账第二节）

| 组 | 定制 |
|---|---|
| injector A1–A4 | loadCache 可选链 · 剥 sourcemap（打包脚本）· 客户端 UI 置空 shim · 打包剥 devDeps/peerDeps |
| preset 外壳 E1–E4 | 装配入口（`agentPresets.register` + bundle patch）· 包内子路径引用 · 「代」热重载 · 幂等注册 |
| standard B1–B7 | persona 双键 · sessionEvents shim · MCP 工具进阶段 0 · 不接入 engram · skill 常驻 · 委派豁免阶段门控 · shell 纪律行 |
| executor C1 | 信号融合（含 selftest） |
| spec D1/D2 | persona 双键 + sessionEvents shim · 读图能力查询 |

## 安装（本机消费本仓）

```bash
# github 直装（pnpm 走 git 拉私有仓；injector 装时 prepare 自动构建 lib/）
# 前置：全局 git schannel + gh 凭据
dsh plugin --profile web add "github:Ztyss/dsh-routing-local#path:injector"
dsh plugin --profile web add "github:Ztyss/dsh-routing-local#path:preset"
# preset 包免重启：内核热感知装配变化，装完即注册；injector 仍需重启 DSH 生效
```

## 从源码重建发布 tgz（需要发布件时才走这条）

```bash
cd injector
npm install                 # devDeps 全为公共包
node scripts/prepare.mjs    # 构建 lib/（含发布面脱敏）
node scripts/local-pack.mjs 0.3.5 <输出目录>
dsh plugin --profile web add "@dsh-external/dsh-super-injector@file:<输出目录>/dsh-super-injector-0.3.5.tgz"
# 重启 DSH 生效
```

## 同步上游

- **injector**：取上游新 release 源码覆盖 `injector/` → 对照台账第二节核对 A1/A3 是否已被上游吸收（未吸收则重放）→ commit/push → 本机重跑 github 直装 → 重启 DSH。
- **preset**：取上游 `preset/router-standard` 与 `preset/router-spec` → 对照 B/C/D 清单重放本地定制 → 覆盖本仓 `preset/<id>/` → bump `?v=` → `node tools/build-presets.mjs` 重新生成 `lib/presets/` → 双 selftest + 包级 selftest → commit/push → 本机重跑 github 直装 → 重启 DSH → 新会话验证。
- 上游吸收情况每次同步时重新核对（以台账第二节为准）。
