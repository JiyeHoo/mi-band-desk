# 项目文档入口

状态：2026-09-23 / 手环源码 0.9.2 / versionCode 21，修复 Pro 20×／Pro 5× 档位显示；Mac 0.8.2 同步名称，插件沿用 0.7.6。沿用 v18 已接受的黑底额度环与 v20 自动切换开关；安装与真实回执状态见 [handoff.md](handoff.md)。

面向使用者的功能、安装参考和预览入口见 [项目 README](../README.md)，许可与素材来源见 [第三方许可说明](../THIRD_PARTY_NOTICES.md)。本目录还保留开发过程与单台设备的交接记录；历史记录不是通用安装教程。

## 接手顺序

1. [当前交接](handoff.md)：设备、上次安装、用户已确认结果、失败反馈和下一步。
2. [开发指南](development-guide.md) 与 [项目约束](../AGENTS.md)：现在允许怎样改、如何构建和验证。
3. [Codex 需求规格](codex-requirements.md)、[当前技术方案](robot-technical-plan.md)、[Codex Mac 方案](codex-macos-plan.md) 与 [0.8.2 Codex 环形额度页](codex-card-v082.md)：产品要求、设备 UI、连接协议、额度视觉和桌面桥的数据流。
4. [开发经验与排障](lessons-learned.md)：为何采用现有方案、哪些结论证据不足、怎样避免重踩问题。
5. [验证与交付清单](release-checklist.md)：按变更选检查，安装后如何确认，如何收真机反馈。

## 文档职责

| 文件 | 负责什么 | 何时更新 |
| --- | --- | --- |
| [handoff.md](handoff.md) | 当前状态的唯一入口 | 安装变化、用户反馈、阻塞或交接时 |
| [development-guide.md](development-guide.md) | 当前开发规范和常用命令 | 工作流或技术约束变化时 |
| [robot-technical-plan.md](robot-technical-plan.md) | 当前实现和代码入口 | 架构、数据或状态流变化时 |
| [codex-requirements.md](codex-requirements.md) | Codex 额度卡与 Mac 直连的统一需求、验收口径和接手入口 | 产品目标、范围、交互或验收口径变化时 |
| [codex-macos-plan.md](codex-macos-plan.md) | Codex 卡片、Mac 桥、AstroBox 插件的需求与协议 | 连接方案或协议变化时 |
| [codex-card-v082.md](codex-card-v082.md) | 当前环形额度、Logo、整行排版和验证入口 | Codex 小屏视觉变化时 |
| [lessons-learned.md](lessons-learned.md) | 可复用经验、证据等级和排障入口 | 有新的复现或确认结论时 |
| [release-checklist.md](release-checklist.md) | 验证范围和交付记录模板 | 检查流程变化时 |
| [version-history.md](version-history.md) | 关键版本与最终反馈对照 | 新版本或旧反馈被补充时 |
| [validation.md](validation.md) | 按时间追加的原始验证记录 | 每轮检查、安装和用户反馈时 |
| [device-setup.md](device-setup.md) | 已有连接的核验和安装边界 | 部署路线变化时 |
| [设计预览说明](../design/robot-desk/README.md) | 预览入口、素材来源与许可 | 设计或素材来源变化时 |

## 专题与历史

- [蓝牙底座功能扩展调研](base-bluetooth-research.md)：本机 HFP／A2DP／AVRCP／HID 证据、Siri 按键边界与语音机器人路线；尚未实施。
- [自动轮播](automatic-carousel.md)：首页 60 秒、其他卡片 10 秒，原生滑动与手动避让。

- [Codex 额度卡与 Mac 直连需求规格](codex-requirements.md)：当前产品目标、非目标、P0 行为、状态和验收口径。
- [0.7.0 Codex Mac 直连方案](codex-macos-plan.md)：详细数据链路、两端 UI、协议、安全边界和实施阶段。
- [订阅档位识别](subscription-tiers.md)：Pro 20×／5× 的字段证据与显示映射。
- [0.8.2 Codex 环形额度页](codex-card-v082.md)：绿色额度环、ChatGPT Logo、Business 5× 和整行排版，无背景卡片和描边。
- [0.8.1 纯黑额度页](codex-card-v081.md) 与 [0.8.0 额度仪表](codex-card-v080.md)：历史设计；v17 已被用户真机反馈否定。
- [0.6.0 表情重设计](v060-expressions.md)：白色手势、26 组独立动作与静止调度。

- [0.3.1 转场未归位](transition-fix.md)：已退役 JS 转场的原生复现与终态经验。
- [0.4.1 黑线兼容修复](black-line-fix.md)：真实反馈通过；具体固件内部原因未证实。
- [0.5.0 方案](v050-plan.md)：历史方案，滑动和设置更新被真机否定。
- [0.5.1 修正](v051-fix.md)：原生分页、日历底栏与固定设置底图。
- [历史归档目录](history/README.md)：原先混杂的指南原文；不作为当前操作步骤。

## 维护原则

当前指南只写当前实现，历史过程进入专题或版本记录。新反馈推翻旧结论时，在 handoff 和 validation 明确标记覆盖关系，不删除原始证据。源码决定“实现了什么”，测试决定“在哪种环境验证了什么”，设备列表决定“安装了哪个版本”，用户反馈决定对应真机体验是否通过。

`.artifacts/`、`output/playwright/` 中的证据在本机可能存在，文档链接不保证新接手环境自动获得图片。`.artifacts/` 被忽略；分享证据先核对内容，勿复制账号、设备 AuthKey、私钥或完整敏感调试数据。新环境的证据重建见验证清单。
