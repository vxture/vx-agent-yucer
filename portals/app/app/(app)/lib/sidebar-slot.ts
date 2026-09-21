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

/**
 * A second, separate slot for the sidebar's own top function bar's edit
 * trigger (owner: 客户总编辑 - one consolidated button replacing 定级/计划,
 * 编辑单位信息 and 编辑销售负责人's three separate entry points).
 *
 * SEPARATE from ACCOUNT_SIDEBAR_SLOT_ID on purpose: 返回/收起展开 are
 * shell-owned chrome (app-shell.tsx builds and renders them directly - the
 * collapse toggle's state has to live there regardless, and neither button
 * needs any account data), but 客户总编辑 needs this account's real data and
 * the real Drawers/service verbs, which only page.tsx has. Two portal
 * targets, in the same function bar, each fed by the layer that actually
 * owns what it renders - not one bar trying to be both.
 */
export const ACCOUNT_SIDEBAR_EDIT_SLOT_ID = "account-detail-sidebar-edit-slot";
