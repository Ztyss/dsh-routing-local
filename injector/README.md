# @dsh-external/dsh-super-injector

超级模组注入器（fork 自 [yjh051108/dsh-super-injector](https://github.com/yjh051108/dsh-super-injector) tag v0.3.5，私有维护版）。

- 本地定制：`src/index.ts`（A1 loadCache 可选链）、`src/client/index.ts`（A3 UI 置空）——完整台账见仓库根 [docs/定制指南.md](../docs/定制指南.md)
- github 直装：`dsh plugin --profile web add "github:Ztyss/dsh-routing-local#path:injector"`（安装时 `prepare` 自动构建，重启 DSH 生效）
- 发布 tgz：`node scripts/prepare.mjs && node scripts/local-pack.mjs <版本> [输出目录]`
