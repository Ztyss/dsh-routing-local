/**
 * 本包有意不注册任何 UI：上游 0.3.5 在此占用宿主的 settings 槽位（插件管理页：
 * 列表 / 卸载 / 拖入内化），本部署不需要该页面——运行时注入与卸载全部走
 * `dev_*` 工具面，故入口只声明注入 `slots` 而不注册任何槽位内容。
 *
 * host 侧的 `/super-injector/api` 端点不在本文件内，`dev_*` 工具不受影响。
 *
 * 本文件为 dsh-routing-local 本地定制 A3（整文件替代上游 src/client/index.ts，
 * 上游原版见 release v0.3.5 或 git 历史）。
 */

type ClientContext = Record<string, unknown>

export const inject = ['slots']

export function apply(_ctx: ClientContext): void {}
