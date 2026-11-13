# 新任务交接

更新：2026-09-23（Pro 档位显示修复：源码 0.9.2 / v21，Mac 0.8.2；手环已确认安装 v21）。

2026-11-13 开源推送前复核：源码未改动；`npm test` 60/60 通过，重新构建 RPK 并通过包校验。此次未安装，设备安装状态仍以此前 v21 记录为准。

入口：[文档导航](README.md) · [订阅档位](subscription-tiers.md) · [自动轮播](automatic-carousel.md) · [已接受的视觉](codex-card-v082.md) · [开发指南](development-guide.md) · [验证清单](release-checklist.md) · [版本记录](version-history.md)。

## 当前状态

| 层级 | 当前结果 | 仍未证明 |
| --- | --- | --- |
| 源码 | **0.9.2 / code 21**：按 planType 区分 Pro 20×／Pro 5×，保留 Business 5×；布局与轮播不变 | 新套餐文字待用户真机观感反馈 |
| 构建 | **60/60 测试通过，正式 RPK 校验通过**；沿用 v18 Codex 视觉；没有探针或加速时间 | 不证明真实功耗／帧率 |
| 原生模拟器 | 两档订阅 fixture 的胶囊排版通过，持按释放帧与基线一致；探针恢复后重建正式包 | PRE 4.0 不等于 OS 3.1.32；新设置／轮播沿用历史测试边界 |
| 安装 | **新进入设备应用列表确认 v21**；首次断连后仍 v20，重新核对后受控重试完成 | 安装不等于用户视觉验收 |
| Mac／插件 | **Mac 0.8.2 已更新运行；插件 0.7.6 已恢复**；浅／深色背景、内容边界和 ACK 状态回归通过；新版打开后真实 pro 快照 revision 897 获匹配 ACK | 用户桌面视觉反馈、长期断连恢复未专项验收 |
| 用户反馈 | 用户说「很好，现在效果不错」，确认 v18 Codex 视觉；历史 Business 5× 已确认，当前用户已切换 Pro 20× | 自动轮播及本次新开关待用户使用反馈 |

轮播默认表情 60 秒、时钟／日历／额度各 10 秒，由已有秒级前台 ticker 调用原生 swipeTo，不加入位置定时器或输入覆盖层。设置三项使用固定底图及两个 40×112 物理状态图，点击开关只更新其小图。本次只改手环／Mac 的 Pro 档位标签；插件沿用 0.7.6。

## 已落地链路

```text
Codex App Server
  → Band Desk Bridge.app（每 2 分钟刷新；仅监听 127.0.0.1:17373）
  → Band Desk Bridge.abp（AstroBox WASI 插件；每 15 秒读取快照）
  → system.interconnect
  → 手环 Codex 卡片（缓存、revision、ACK、手动刷新）
```

- macOS UI 是 380px 单列菜单栏弹窗：额度背景随系统浅／深色变化，标题与全部额度内容位于同一背景内，套餐按接口类型显示 Pro 20×／Pro 5× 或 Business 5×；Token 汇总、四段连接状态、立即刷新、打开 AstroBox。状态点与文字都反映实际结果。
- 插件 0.7.6 解析 AstroBox 2.1 的 `payloadText` 封装，验证包名／协议后只转发白名单字段。Mac 用 session／revision 匹配 ACK，同版重发保留确认；首次发送 30 秒无回执提示超时，插件 45 秒无状态提示连接待恢复。
- 手环使用完整 490×192 胶囊：左侧 168px 环、54px 白色数字，右侧 ChatGPT Logo 与实际套餐名称；重置和状态文字统一左对齐。隐藏双击提示，保留 420ms／44px 双击刷新；loading 只切换独立 26×26 小图。
- 协议固定 `schemaVersion=1`、`cardId=codex.rate-limits`；0.8.0 只增加可选 `payload.planType`，仍不发送账号、令牌、邮件或凭据。手环只应用新 session 或更高 revision；相同 revision 不重写缓存但会幂等补 ACK。缓存 10 分钟后标记过期。
- macOS 当前可交付实现是 [Native/main.m](../macos/BandDeskBridge/Native/main.m)，用系统 Clang/AppKit 构建。SwiftUI/Swift Package 旧参考源码仍保留，未同步本次原生修复，但本机 Command Line Tools 的 `PackageDescription` 链接损坏，`swift test` 失败；这不是 AppKit 产物的构建阻塞，也不能写成 Swift 测试通过。

## 继续工作

新增需求调研：[蓝牙底座功能扩展](base-bluetooth-research.md)。用户报告底座麦克风键长按会唤醒 Mac Siri；本机已确认底座的输入／输出音频端点、HFP／A2DP／AVRCP／HID 和媒体控制描述符。语音播报、语音输入及手环状态联动可作为后续方向；实体麦克风键替换 Siri 尚未验证。本轮只读调研并沉淀文档，没有修改应用、录音或部署。

用户进一步收敛目标为 **按住底座按钮进行 ChatGPT 语音输入，松开后发送**。优先验证物理按下／松开事件与 ChatGPT 听写结束／转写就绪／发送入口；一次 Siri 唤醒不等于提供松手状态。官方听写默认先进入输入框，自动发送仍需桥接。本机窗口访问被 Computer Use 安全限制拒绝，未做客户端录音或发送实测，详见调研文档。

首次配合测试：用户两次长按均在持按期间唤醒 Siri；目标专用、非独占 HID 探针没有收到对应事件，独立输入监听权限检查为 granted。音量键正对照尚待结果；此时不能判定底座不存在松手信号。原始记录见 [validation](validation.md)。

1. 真机设置检查：默认开启，关闭后仍可手动切页，重新打开应用保留选择；开启后重新计时。观察自动循环：表情约 60 秒，三张卡各约 10 秒，再回表情；秒级调度存在约 1 秒粒度差异。
2. 检查手动滑动、短拖、持按、取消与双击刷新不被轮播抢走；进入设置应停住，回前台重新计时。
3. PRE 长持按结束后曾进入缺失事件兜底，恢复较慢；真机若出现相同现象记录动作和时间，不直接推断固件原因。
4. 返向 ACK 已通过真实链路；长期断连恢复、常亮与真实功耗仍单独验收。新反馈同步本文件、validation 与 version-history。

## 实现约束

- 根 scroll 两轴和 bounces 保持关闭；只有原生嵌套 swiper 管分页。桌面内层现为四页循环，外层仍只负责设置／桌面。
- 不恢复 JS 跟手导航、位置定时器、全屏覆盖层、父层 transform 或整张设置卡片动态替换。
- 眼睛、26 个情绪动作、白色手势、60 updates/s 活动预算、静止唤醒、两完整周期换表情等 0.6.0 约束不变。
- interconnect 与 storage 已在 manifest 声明。包名和本地签名继续保持；密码、AuthKey、Codex 登录令牌和私钥不得输出或提交。
- Mac 本机桥只绑定回环地址，不在局域网监听。AstroBox 插件只转发协议快照和状态，不记录额度正文或设备敏感标识。

## 文件与交付身份

- 统一需求：[codex-requirements.md](codex-requirements.md)
- 方案与协议：[codex-macos-plan.md](codex-macos-plan.md)、[0.8.2 环形额度页](codex-card-v082.md)
- 手环逻辑：[codex-card.js](../src/common/codex-card.js)、[index.ux](../src/pages/index/index.ux)、[layout.js](../src/common/layout.js)
- macOS App：[README](../macos/BandDeskBridge/README.md)、[Native/main.m](../macos/BandDeskBridge/Native/main.m)
- AstroBox 插件：[lib.rs](../astrobox-plugin/band-desk-bridge/src/lib.rs)、[manifest.json](../astrobox-plugin/band-desk-bridge/manifest.json)
- UI 设计稿：[手环预览](../design/robot-desk/v5/index.html)、[macOS 预览](../design/macos-bridge/index.html)

产物：

- RPK：`dist/com.jiyehoo.banddesk.debug.0.9.2.rpk`，2026-11-13 重建后为 3902900 bytes，SHA-256 `5d62cbf7cd6d04138b162687993cbeb2c5c7838a79251dc6d4578dc4ad87945a`；此前安装所用包的记录为 3902903 bytes，SHA-256 `0d64585271c70953548bf75ecb1f013b07fadc5a28070b5c40dffd27fd31e4ea`。
- macOS 0.8.2 zip：`.artifacts/macos/Band Desk Bridge 0.8.2.zip`，42427 bytes，SHA-256 `cd5f6a2fdbbd783ec3405dbd332647417dd1e8d77e1b7ba166ce5462558f9bb3`。
- AstroBox 插件 0.7.6：`astrobox-plugin/band-desk-bridge/dist/Band Desk Bridge.abp`，107387 bytes，SHA-256 `a0f7224078dc17bd2c813384989521ef9c9f7bccd977d1d39c21596afdf0beed`。

本轮状态：**手环／Mac 标签已修改、测试与构建；Mac 已更新运行，设备列表已确认 v21 安装并打开，真实 pro 快照获匹配 ACK。** v18 视觉已获用户认可，新套餐文字、新设置与轮播的真机体验、长期功耗待反馈。
