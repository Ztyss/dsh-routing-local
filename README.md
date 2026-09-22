# dsh-routing-local

dsh-routing-suite 的**私有维护仓**：同款组织方式（`injector/` + `preset/`），
收拢 injector v0.3.5 源码（含本地定制）与本机定制版 presets。

- 上游源：https://github.com/yjh051108/dsh-super-injector （injector，fork 自 tag v0.3.5）
- 组织参照：https://github.com/yjh051108/dsh-routing-suite
- 维护参考：**[docs/本地定制台账.md](docs/本地定制台账.md)**（唯一维护参考，权威副本在本仓）

## 布局

```
injector/                      dsh-super-injector v0.3.5 源码 + 本地定制（本机以 github 直装消费）
  src/index.ts                 A1 loadCache 可选链修复（listPlugins，已烘进源码）
  src/client/index.ts          A3 客户端 UI 置空 shim（整文件替代上游设置页）
  .npmrc                       auto-install-peers=false（git 直装 prepare 保命，见指南三）
  scripts/local-pack.mjs       A2+A4 本地打包：剥 sourcemap + 剥 devDeps/peerDeps → package/ 顶层 tgz
preset/router-standard/        本机运行副本原样入仓（B1–B7 定制 + 双 selftest，?v= 见 agent.cordis.yml）
preset/router-spec/            本机运行副本原样入仓（D1/D2 定制）
docs/本地定制台账.md            唯一维护参考（现状台账 + 安装/升级/验证流程）
```

`.gitignore`：`lib/`、`node_modules/`、`*.tgz` 不入库（同上游口径，构建产物用 local-pack 现打）。

## 定制台账（详见 docs 台账第二节）

| 组 | 定制 |
|---|---|
| injector A1–A4 | loadCache 可选链（已烘进 src）· 剥 sourcemap（打包脚本）· 客户端 UI 置空（已烘进 src）· 打包剥 devDeps/peerDeps（打包脚本） |
| standard B1–B7 | persona 双键 · sessionEvents shim · MCP 工具进阶段 0 · engram 退役 · skill 常驻(#117) · 委派豁免(#120) · shell 纪律行(#36) |
| executor C1 | 信号融合(#36，含 selftest) |
| spec D1/D2 | persona 双键 + sessionEvents shim · 读图能力查询 |

## 安装（本机消费本仓）

```bash
# 首选：github 直装（pnpm 走 git 拉私有仓，prepare 自动构建 lib/；需全局 git schannel + gh 凭据）
dsh plugin --profile web add "github:Ztyss/dsh-routing-local#path:injector"
# 重启 DSH 生效
```

## 从源码重建发布 tgz（可选：需要发布件时才走这条）

```bash
cd injector
npm install                 # devDeps 全为公共包
node scripts/prepare.mjs    # 构建 lib/（含发布面脱敏）
node scripts/local-pack.mjs 0.3.5 <输出目录>
dsh plugin --profile web add "@dsh-external/dsh-super-injector@file:<输出目录>/dsh-super-injector-0.3.5.tgz"
# 重启 DSH 生效
```

## 同步上游

- **injector**：取上游新 release 源码覆盖 `injector/` → 对照 docs 台账第二节核对 A1/A3 是否已被上游吸收（未吸收则重放）→ commit/push → 本机重跑 github 直装 → 重启 DSH。
- **preset**：取上游 `preset/` → 对照 B/C/D 清单重放本地定制 → 覆盖 `preset/` → bump `?v=` → 双 selftest → 新会话验证。
- 上游吸收情况每次同步时重新核对（以 docs 台账第二节为准）。
