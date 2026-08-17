# 80-liaison - Cross-org liaison

## 这个渠道已经不是文件了

**跨仓联络走 GitHub Issues，开在收信方的仓上**，不是本仓的 markdown 文件。
组织标准 `140-repo-governance-standard.md` sec.10 于 **2026-07-27 冻结本目录**，
Atlas 仓还为此加了 CI 守卫（`check-liaison-archive`：新增 `NN-*.md` 失败，删除已归档
的也失败）。

约定，照实测到的用法：

- 标题：`<发信方>-><收信方>: <主题>`，例如 `atlas->karda: ...`、`runos->arda: ...`
- 开在**收信方**的仓，不是自己的仓
- 早期一批带 `liaison` 标签，近期的没带；标签不是必需

**为什么这条值得写在最上面**：本仓 2026-08-16 刚犯过这个错——把 16 个问题写成本目录下
的一份文件，署上时间戳，然后等回复。那份文件在**发信人自己的仓里**，收信方没有任何理由
会看到它。Atlas 的审计报告把这条教训说得最准：

> **更正总是写在写的人会看到的地方，而不是读的人会看到的地方。**
> 文档、注释、归档信、自陈矩阵都属于前者。

## 本仓已发出的联络（全部是 issue）

| 日期 | 收信方 | 主题 | 链接 | 状态 |
|------|--------|------|------|------|
| 2026-08-17 | arda | L3 agent 该直连还是经 Runos 网关（这一问可能让另外 7 问作废） | [vxture-arda#212](https://github.com/vxture/vxture-arda/issues/212) | 待回复 |
| 2026-08-17 | karda | 有没有产品侧的发布方向（4 问，全部阻塞我方任何代码） | [vxture-karda#103](https://github.com/vxture/vxture-karda/issues/103) | 待回复 |
| 2026-08-17 | runos | `content_digest` 的原像与算法未公布，消费方校验恒为「未验证」且静默 | [vxture-runos#145](https://github.com/vxture/vxture-runos/issues/145) | 待回复 |
| 2026-08-17 | atlas | `taskId` 已适配；D-1 的「通知消费方」对尚未注册的消费方没有渠道 | [vxture-atlas#248](https://github.com/vxture/vxture-atlas/issues/248) | 待回复 |
| 2026-08-17 | platform | `product_251` X-3 与 `product_200 §4.1` 两套字段名互不引用 | [vxture-platform#269](https://github.com/vxture/vxture-platform/issues/269) | 待回复 |

## 目录里那份文件

`01-2608161131-platform-karda-arda-contract-request.md` 保留，**作为一次错误投递的
记录**，不作为发出过的信。它的内容已按上表拆分重发到各收信方的仓。

不删掉它，是因为守卫的规则是「新增失败，删除已归档的也失败」——而且一份写错了投递
渠道的信，本身就是这个目录最有说服力的说明。

## 模板自己的往来

模板的 `vxtpl` 演示实例化往来（边缘 vhost、凭证申请、端口改派）属于模板的历史，
实例化时刻意没有带进本产品仓。
