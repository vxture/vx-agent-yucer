/** The DOM id app-shell.tsx renders an empty slot under, on an account detail
 *  route, instead of the generic NavBoard - and the id account-sidebar-
 *  portal.tsx portals 栏1's own content into. One shared constant so the two
 *  files can never drift apart on the string.
 *
 *  owner, 2026-09-20: 死死记住这次的要求 - 客户详情页的栏1(单位信息/联系人/
 *  决策链摘要/档案缺口)搬进页面边的 sidebar 位置, 跟 /account 列表页的
 *  阵地经营域共用同一个 slot(同一块留白, 同一条独立滚动), 不是在内容区里
 *  再摆一条假装是侧栏的窄列 - 保持边栏的布局(宽度、独立滚动、贴页面边),
 *  只是这个特定路由下改放这个客户自己的档案而不是通用的模块导航。
 */
export const ACCOUNT_SIDEBAR_SLOT_ID = "account-detail-sidebar-slot";

// A second slot used to exist here for the sidebar's own top function bar's
// edit trigger ("客户总编辑"). That whole function bar (返回/收起展开/客户
// 总编辑) was removed on 2026-09-21 (owner: 聚焦客户全景图页面 - the global
// header's board toggle covers 返回/收起展开's job now) - 客户总编辑 moved to
// the content column's breadcrumb row instead, rendered directly by page.tsx
// with no portal needed (it was never shell chrome; only its old render
// location was inside a shell-built div). Do not re-add a second slot id
// here without a real second portal target to justify it.
