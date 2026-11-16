# 全局业务 Header 分组与视觉复核

跟踪：[聿策 #654](https://github.com/vxture/vx-agent-yucer/issues/654)。
适用进入系统后的共享 AppShell；公开登录／访问状态页继续沿用已确认的独立品牌组合。
没有修改业务权限、组织资料来源、用户面板、模型服务或数据库。

## G1–G7 检查清单

| 分组 | 最终规则 | 实现 |
|---|---|---|
| G1 Launcher | 32px 点击区、24px 图标 | 保留 DomainLauncher 的 DS 按钮和图标 |
| G2 产品身份 | logo 32px；聿策 18px、销售智能体 16px、档位简称保持；内部 8px | ShellProductTitle，TD-037 命名尺寸适配；图形、文本和档位垂直居中 |
| G3 当前范围 | 竖线＋按钮一组，间距 8px；按钮左右 8px | 组织名 14px/400；空间名 12px/400、muted；固定 Buildings 16px；展开使用现有真实组织 logo／平台 fallback 与组织全称 |
| G4 搜索 | 最大 320px，空间不足时弹性 | 从 448px 缩小；保留 Windows Ctrl + K、macOS ⌘ + K、搜索结果；低于 200px 时隐藏快捷键文本 |
| G5 AI | 独立 32px 圆形触发器、24px 图标 | 与操作组分开，使用 DS active 与 aria-pressed 表达开关状态，保留待处理数 |
| G6 工具组 | 帮助／消息／配置；32px 按钮、16px 图标、4px 间距 | 恢复 ShellHeaderTools 整组 hover/focus 的 accent 底色，消息展开时保留激活；配置继续新标签页 |
| G7 用户 | 独立 32px | 头像、个人资料、账号中心、等级位置与偏好内容保持 |

右侧采用 DS ShellHeaderActions：正常组间 16px，窄屏 8px。
G2/G3 的 8px、G6 的 4px 不随内容密度缩放；Header 按钮固定 32px。

## AI 入口范围

- 客户、商机、战略、销售规划、承诺达成、市场行动、交付、目录等业务路由及创建／详情页：显示，继承当前页面真实助手上下文。
- 首页：不显示，保留现有首页功能入口。
- 配置管理及子页面：不显示。
- 智能工作台：不重复叠加第二个助手；主对话继续独立工作。
- 订阅升级页：不显示，聚焦订阅操作；仍按服务端权限判断是否进入该路由。
- 公开／无权限／未订阅页面：由现有公开共享框架负责，无业务 Header。

## 对照与响应式

已读取并通过浏览器核对 https://vxture.com/zh-CN ：工具组原生 ShellIconGroup 使用
4px 间距，常态透明、hover/focus-within 整组 accent；聿策使用同源 ShellHeaderTools。
移除旧透明覆盖和受密度影响的 gap-2xs，不新增另一套颜色。

宽屏保持 48px 单行；小于 1024px 分为身份／搜索和租户／操作两行；
小于 640px 分为品牌、租户、操作三行，避免品牌、组织与工具重叠，搜索遵循 DS 原有隐藏规则。
长租户文本在窄屏可横向查看，不在展开／悬停时改变按钮宽度。
助手覆盖与全屏顶部跟随 Header 实际高度，由 ResizeObserver 维护局部几何变量。

## DS 适配留痕

沿用 TD-037，上游记录 [vxture-design #111](https://github.com/vxture/vxture-design/issues/111#issuecomment-6906834478)。
ShellProductTitle 暂未开放 logoSize，产品明确要求 32px，单处绑定公开 size-icon-xl；
没有修改 DS 源码或复制组件。上游提供可配置 logoSize 后移除该选择器。

## 验证

- 生产构建通过（包含 TypeScript）；既有 Header 回归 4 项通过；页面规范守卫 79 页面／70 槽位／920 操作组件声明，0 错误；文档编号检查通过。
- 浏览器 23 项检查通过，0 运行时异常：G1–G7 默认几何、工具组 hover/focus、租户面板及按钮宽度稳定、独立 AI 开关、配置新标签页、八档视口、三档密度、深色激活色、五类路由 AI 入口。
- 390／600／768／900／1024／1100／1280／1440px 均无页面横向溢出；窄屏分组不重叠，助手覆盖区顶部等于实际 Header 高度。
- 测量与截图来自本机真实演示页面，不调用模型，不登记或更改客户记录。悬停截图使用浏览器 CSS hover 状态固定，以避免后台标签页绘制节流；键盘 focus 另行通过真实 DOM 焦点验证。
- 证据：`/tmp/yucer-header-groups-browser.json`；截图 `yucer-header-groups-default.png`、`yucer-header-groups-hover.png`、`yucer-header-groups-mobile.png`、`yucer-header-groups-dark.png`；公开参考 `yucer-header-vxture-reference.png`。
- 本地 http://localhost:4060/account/new 已更新。本轮尚未发布，生产仍为 v0.1.97。
