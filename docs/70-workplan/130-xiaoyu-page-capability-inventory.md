# 130 - 小聿逐页能力与原助手迁移台账

本清单由86页正式路由清单核对。统一对话和语义上下文适用于业务工作框架；独立框架按原样保留。

五类原表单（客户、细分市场、方案、战略、公司规划）在任务区复用原组件；保存仍须精确版本授权。其他对象的写入沿用原页面操作，不开放未登记的自动写入。

| 页面 | 框架 | 当前受控读取 | 任务表单 | 原方法保留 |
|---|---|---|---|---|
| /account/[id]/evidence/[evidenceId] | workspace | account | 原页面操作 | 已保留 |
| /account/[id] | dossier | account | 原页面操作 | 已保留 |
| /account/complete | workspace | account | 原页面操作 | 已保留 |
| /account/new | workspace | account | account | 已保留 |
| /account | workspace | account | 原页面操作 | 已保留 |
| /admin/audit | workspace | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /admin/diagnostics | workspace | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /admin/division/[id] | workspace | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /admin/division/new | workspace | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /admin/division | workspace | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /admin/industry | workspace | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /admin/members/[id] | workspace | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /admin/members | workspace | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /admin/migration | redirect | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /admin/opportunity | workspace | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /admin/org/[id] | workspace | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /admin/org/kinds | workspace | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /admin/org/new | workspace | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /admin/org | workspace | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /admin | workspace | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /admin/permissions | workspace | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /admin/product | workspace | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /admin/reminder | workspace | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /admin/roles/[id] | workspace | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /admin/roles/groups | workspace | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /admin/roles/new | workspace | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /admin/roles | workspace | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /admin/scope | workspace | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /attainment/coverage | workspace | sales_target | 原页面操作 | 已保留 |
| /attainment | workspace | sales_target | 原页面操作 | 已保留 |
| /campaign/create | workspace | campaign | 原页面操作 | 已保留 |
| /campaign/new | workspace | campaign | 原页面操作 | 已保留 |
| /campaign | workspace | campaign | 原页面操作 | 已保留 |
| /capture | workspace | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /catalog/new | workspace | product | 原页面操作 | 已保留 |
| /catalog | workspace | product | 原页面操作 | 已保留 |
| /collection/instalment | workspace | project | 原页面操作 | 已保留 |
| /collection | workspace | project | 原页面操作 | 已保留 |
| /contact/new | workspace | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /copilot/today | workspace | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /copilot | collaboration | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /delivery/new | workspace | project | 原页面操作 | 已保留 |
| /delivery | workspace | project | 原页面操作 | 已保留 |
| /delivery/project | workspace | project | 原页面操作 | 已保留 |
| /domain/[key] | workspace | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /forecast | redirect | opportunity | 原页面操作 | 已保留 |
| /funnel | workspace | opportunity | 原页面操作 | 已保留 |
| /lead/new | workspace | lead | 原页面操作 | 已保留 |
| /lead | workspace | lead | 原页面操作 | 已保留 |
| /named | workspace | account | 原页面操作 | 已保留 |
| / | workspace | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /pipeline/[id]/lines | workspace | opportunity | 原页面操作 | 已保留 |
| /pipeline/[id] | dossier | opportunity | 原页面操作 | 已保留 |
| /pipeline/new | workspace | opportunity | 原页面操作 | 已保留 |
| /pipeline | workspace | opportunity | 原页面操作 | 已保留 |
| /planning/new | workspace | sales_plan、sales_target | 原页面操作 | 已保留 |
| /planning | workspace | sales_plan、sales_target | sales_plan | 已保留 |
| /planning/territory/new | redirect | sales_plan、sales_target | 原页面操作 | 已保留 |
| /pricebook | redirect | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /quote | workspace | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /renewal | workspace | project | 原页面操作 | 已保留 |
| /segment/new | workspace | segment | segment | 已保留 |
| /segment/[id] | workspace | segment | 原页面操作 | 已保留 |
| /segment | workspace | segment | 原页面操作 | 已保留 |
| /signal | workspace | lead | 原页面操作 | 已保留 |
| /solution/new | workspace | solution | solution | 已保留 |
| /solution | workspace | solution | 原页面操作 | 已保留 |
| /strategy/[id] | workspace | strategy | 原页面操作 | 已保留 |
| /strategy/new | workspace | strategy | strategy | 已保留 |
| /strategy | workspace | strategy | 原页面操作 | 已保留 |
| /upgrade/[module] | workspace | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /winloss | workspace | opportunity | 原页面操作 | 已保留 |
| /entitlement-matrix | standalone | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /gate-screens | standalone | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /platform-check | standalone | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /product-preview | standalone | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /progression-preview | standalone | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /status | standalone | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /enablement | screen | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /national | screen | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /strategy-diag | screen | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /admin/strategy | workspace | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /named/[id] | workspace | account | 原页面操作 | 已保留 |
| /contact/[id] | workspace | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /copilot/memory | workspace | 上下文／原页面工具 | 原页面操作 | 已保留 |
| /copilot/knowledge | redirect | 上下文／原页面工具 | 原页面操作 | 已保留 |

原助手能力分类：原生表单智能补齐继续通过页面工具入口可达；任务上下文携带原字段名并同步私有草稿。客户／商机专题分析与旧提案保留 `/copilot?view=proposals` 和原对象入口，避免遗漏既有方法。没有对应受控工具的联系人、跟进、报价等写操作明确由原页面处理，不能在对话伪报完成。

工程路由与上下文覆盖不等于每条真实业务链验收；联合验收证据在129追踪。


## 已保留方法的具体映射

| 原方法 | 原入口／调用 | 新协作方式与边界 |
|---|---|---|
| 客户智能登记 | `/account/new` → `assistAccountRegistration` | 页面工具保留；任务采用account字段契约与原createAccount执行，不复制表单和写服务 |
| 细分市场智能补齐 | `/segment/new` → `assistSegmentDraft` | 原方法保留；小聿可读市场契约、私有回填及原表单复核 |
| 方案智能补齐 | `/solution/new` → `assistSolutionDraft` | 原方法保留；方案字段、产品关联来源和原服务保持一致 |
| 战略智能制定 | `/strategy/new` → `assistStrategyDraft` | 原方法保留；任务区原字段组件及独立保存／发布授权 |
| 公司规划私有草稿 | `/planning` → `useXiaoyuForm`／`salesPlanCommandAction` | 任务区保存仅私有同步，真正保存／发布走执行服务；区域与新增销售目标仍按原页面操作 |
| 客户／商机专题及建议 | 原对象入口、`/copilot?view=proposals` | 共用面板更多菜单保留原专用工具；未把旧提案文本无来源复制为新任务事实 |
| 本地清单状态 | 客户、商机、细分市场、战略、方案 | 白名单筛选／关键字传递；细分市场最多20个选中ID，服务端重查对象；不传DOM或凭据 |

本轮保留旧专用工具入口以防能力丢失；原工具的独立执行路径仍过原权限和业务确认。新的持续任务统一使用小聿对话、私有草稿与执行回执；未声称旧专用工具已全部改造成可由模型任意调用的Skill。
