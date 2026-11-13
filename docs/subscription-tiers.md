# 订阅档位识别与展示

2026-09-23，手环 0.9.2 / v21、Mac 0.8.2 修复 Pro 倍率显示。安装与回执结果见 [handoff.md](handoff.md) 和 [validation.md](validation.md)。

## 字段与证据

现有链路已经传递 `payload.planType`，不需要新增倍率字段。修复前的设备源码把 `pro` 与 `prolite` 都映射成 `Pro`，因此隐藏了可区分的套餐档位。

| API 套餐值 | 显示 | 依据 |
| --- | --- | --- |
| `pro` | **Pro 20×** | 核对的官方 ChatGPT 客户端计费标签映射为 Pro 20x |
| `prolite` | **Pro 5×** | 同一客户端计费标签明确映射为 Pro 5x |
| `self_serve_business_prolite` | **Business 5×** | 保留已确认的历史显示映射 |
| 未知值 | **ChatGPT** | 不从剩余百分比推算倍率，不猜测新档位 |

[官方定价](https://learn.chatgpt.com/docs/pricing) 明确存在 Pro 5x／20x 两档；[App Server 文档](https://learn.chatgpt.com/docs/app-server) 说明账户与额度接口。公开定价页不直接定义内部枚举，所以枚举到倍率的对应额外核对了本机官方客户端。

核对的官方客户端版本为 `26.917.51856 / 10492`。只读证据为客户端资源中的 `settings.consumerBilling.planNameWithProLevels` 及取消续费／计划变更标签，均对应 `prolite → Pro 5x`、`pro → Pro 20x`。这是 2026-09-23 安装版本的资源，后续档位若变化需复核，不能把当前映射当作永久合同。

## 实现范围

- 手环 `CODEX_PLAN_LABELS` 区分两档；解析、缓存、过期、ACK 和刷新协议不变。
- 重新生成两种方向的整行文字图片，沿用 26px 白字与现有布局；不改绿色额度环和分页。
- Mac 原生计费标签同步；SwiftUI 参考 UI 的这两个标签同步，但未运行 SwiftPM 测试。
- 插件沿用 0.7.6，透明转发原来的 `planType`，无需重建。
- 套餐取当前成功采集快照中的类型；接口不可用或数据过期时继续执行原缓存／过期策略，不将用户口述档位强行写入每个账号。
