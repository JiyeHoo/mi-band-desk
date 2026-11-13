# Codex 额度卡与 Mac 直连需求规格

状态：2026-09-23 / 手环源码 0.9.2 / versionCode 21，修复 Pro 20×／Pro 5× 档位显示；Mac 0.8.2 同步名称，插件沿用 0.7.6。沿用 v18 已接受的黑底额度环与 v20 自动切换开关；安装与真实回执状态见 [handoff.md](handoff.md)。

## 1. 背景与目标

用户希望在“机器人桌搭”中增加 Codex 额度页，并先落地 Mac 直连版本。Android 伴侣会在独立会话开发，不属于本需求的完成条件。

本需求解决四件事：

1. Mac 从本机 Codex App Server 读取真实额度、重置时间、使用统计和套餐类型。
2. AstroBox 插件把脱敏快照转发给当前连接的手环。
3. 手环在完整胶囊屏内突出显示剩余额度，并提供不干扰原生分页的双击刷新。
4. 每一层明确区分“已采集、已转发、已 ACK、已安装、用户已验收”，不再用笼统的“等待插件”掩盖真实状态。

当前链路：

```text
Codex App Server
  → Band Desk Bridge.app（Mac，2 分钟采集）
  → 127.0.0.1:17373（只监听回环）
  → Band Desk Bridge.abp（AstroBox，15 秒转发）
  → system.interconnect
  → 机器人桌搭 Codex 页（手环）
```

## 2. 范围和非目标

### 本需求包含

- 手环第 4 张 Codex 卡片、缓存、过期、ACK、刷新请求和 loading。
- macOS 菜单栏应用、Codex 采集、本机 HTTP 桥、套餐展示和链路状态。
- AstroBox WASI 插件的定时转发、ACK／刷新请求回传和错误状态。
- schema v1 快照协议及向后兼容扩展。
- RPK、Mac App 和 ABP 的构建、安装与分层验证记录。

### 本需求不包含

- Android APK、小米运动健康 SDK、手机后台常驻和 Mac／手机连接交接。
- 无感双端同时连接、远程公网同步或自动让小米运动健康释放设备。
- 手环固件、刷机、恢复出厂、原配对、NFC／支付或配对手机 ADB 操作。
- 从套餐名称推断不存在的数据，例如后端未返回倍率时写死 `20×`。

## 3. 手环端需求

### 3.1 页面与导航

- 目标屏幕物理尺寸为 192×490，用户观看的逻辑横屏为 490×192。
- Codex 是现有内层原生 vertical swiper 的第 4 页；外层 horizontal swiper 仍只负责设置／桌面。
- 根 scroll 的 x、y、bounces 保持关闭。不得重新加入 JS 跟手导航、位置定时器或拦截 swiper 的全屏覆盖层。
- 使用物理坐标与预旋转 PNG；不得依赖原生父层 transform、运行时旋转或高频整页重建。

### 3.2 信息优先级

1. 左侧 168px 绿色额度环，环内 54px 白色整数和 25px 百分号，下方显示「本周剩余」或实际短窗口。
2. 百分比表示剩余，来自 `remainingPercent`；没有货币余额字段，不伪造现金金额。
3. 右侧 36px 白色 ChatGPT Logo 配 26px 套餐；按当前 `planType` 显示：`pro → Pro 20×`、`prolite → Pro 5×`；原 `self_serve_business_prolite → Business 5×` 保留。详见 [订阅档位证据](subscription-tiers.md)。
4. 重置倒计时和更新状态配小图标，文字与套餐共用左边线；隐藏「双击刷新」提示。
5. 无数据时显示 `—%` 和空环；断连／过期保留最后成功值并明确标记。

### 3.3 小屏视觉

- 纯黑底，无装饰背景、描边卡片、渐变或发光。用户本次明确要求环形剩余额度，覆盖 v17 不使用环的旧方案。
- 白色主体、浅灰辅助、绿色额度环，异常文字为暖橙。使用完整胶囊轮廓，按实际弧线布置。
- 文字使用整行自然字距、统一基线的预旋转图片；不逐字拼套餐或倒计时。每行按原尺寸显示。
- 检查 0／1／59／100%、无数据、短窗口、过期和 loading；全部可见像素须落在胶囊内。
- 详细视觉与图标来源见 [codex-card-v082.md](codex-card-v082.md)。

### 3.4 刷新与 loading

- 不放置小型刷新按钮；整张 Codex 页使用双击刷新。
- 两次有效点按必须在 420ms、44px 范围内；拖动、取消、原生分页和丢失事件不得误触发。
- 每次交互最多发送一个 `refresh_request`；loading 期间不重复提交。
- loading 只切换右下 26×26 预旋转图，不重建整页；收到更高 revision、失败、离页或 18 秒超时后停止。

### 3.5 数据应用规则

- 只接受 `schemaVersion=1`、`type=snapshot`、`cardId=codex.rate-limits` 的合法完整快照。
- `sessionId + revision` 决定顺序；同一 session 丢弃较低 revision。
- 相同 revision 不重写缓存、不提前结束 loading，但必须幂等补 ACK。
- 成功快照缓存 10 分钟；离线继续显示原采集时间，不能把转发时间改成“刚刚更新”。
- `planType` 是可选字段。只映射已知枚举；缺失或未知统一显示 `ChatGPT`。

## 4. macOS 端需求

- 当前交付实现是原生 AppKit 菜单栏应用，约 380px 单列弹窗；SwiftUI 同协议代码只作参考。
- 启动 `codex app-server --listen stdio://` 后，先完成 `initialize`／`initialized`，再读取 `account/rateLimits/read` 和 `account/usage/read`。
- 每 2 分钟采集一次；“立即刷新”触发即时采集。失败时保留最后成功快照并显示错误／过期状态。
- 主卡显示手环所选额度窗口、剩余百分比、重置时间和真实套餐；Token 总量等统计保留在 Mac，不挤进手环首卡。
- 链路状态必须分别显示 Codex、HTTP 桥、AstroBox 转发和手环 ACK。`lastRelayStatus=sent` 只表示宿主接受发送，不等于手环收到或 ACK。
- HTTP 仅绑定 `127.0.0.1:17373`：
  - `GET /v1/health`：运行和链路状态。
  - `GET /v1/snapshot`：最后成功的脱敏快照；无快照返回 503。
  - `POST /v1/events`：转发结果、ACK 和刷新请求。
- 不读取、保存或返回 Codex 登录令牌、邮箱、设备地址、AuthKey 或签名材料。
- 当前 App 从 `.artifacts/macos/Band Desk Bridge.app` 运行，尚未复制到 `/Applications`；后续若做正式常驻需单独验证启动项和升级策略。

## 5. AstroBox 插件需求

- 插件使用 WASI Preview 2 / API level 3；当前版本 0.7.6。
- 加载后立即同步，并每 15 秒读取一次 Mac 快照；只向当前连接设备的 `com.jiyehoo.banddesk` 发送。
- 收到 `refresh_request` 后先通知 Mac，再延迟 2 秒读取并发送新 revision。
- 解析 AstroBox 2.1 的 `payloadText` 封装，验证应用包名与协议后，仅将 ACK／刷新请求白名单字段回传 Mac；不转发地址或十六进制副本。无设备、Mac 未运行、HTTP 失败和 Interconnect 失败分别上报。
- 插件不解析快照业务字段，因此 schema v1 的可选 `planType` 可透明转发，无需为 0.8.0 升级插件协议。
- 不输出设备地址、AuthKey、快照全文或其他敏感信息。

## 6. 协议摘要

Mac／AstroBox → 手环：

```json
{
  "schemaVersion": 1,
  "type": "snapshot",
  "cardId": "codex.rate-limits",
  "sourceId": "local-installation-id",
  "accountKey": "default",
  "revision": 12,
  "sessionId": "collector-session-id",
  "fetchedAt": 1790000000000,
  "expiresAt": 1790000600000,
  "payload": {
    "planType": "self_serve_business_prolite",
    "selectedWindowId": "codex.primary",
    "windows": [
      {
        "id": "codex.primary",
        "label": "本周",
        "usedPercent": 41,
        "remainingPercent": 59,
        "windowDurationMins": 10080,
        "resetsAt": 1790500000000
      }
    ]
  }
}
```

手环回传：

```json
{"schemaVersion":1,"type":"ack","cardId":"codex.rate-limits","sessionId":"collector-session-id","revision":12,"appliedAt":1790000001000}
```

```json
{"schemaVersion":1,"type":"refresh_request","cardId":"codex.rate-limits","sessionId":"collector-session-id","lastRevision":12,"requestedAt":1790000002000}
```

全部时间为 Unix 毫秒，百分比必须收敛到 0～100。完整协议和 Mac 接口说明见 [codex-macos-plan.md](codex-macos-plan.md)。

## 7. 验收与当前结论

| 项目 | 当前状态 | 证据／剩余工作 |
| --- | --- | --- |
| 手环逻辑与资源 | 已完成 | 60/60 测试；1398 个预旋转资源；RPK 校验通过 |
| 浏览器视觉 | 已完成 | 0／1／59／100%、无数据、短窗口、过期和 loading；1136 个 Codex 图片无弧边外溢 |
| PRE 验证 | 已完成本轮范围 | v21 两档订阅 fixture 原生排版和持按释放图通过，探针恢复后重建正式包；轮播与开关沿用 v20 历史检查 |
| Mac 0.8.2／插件 0.7.6 | 已构建并更新运行 | 原生浅／深色渲染与布局边界、ACK 状态回归、4 项插件解析测试通过；套餐区分 Pro 20×／5×，Business 5× 保留 |
| 手环 v21 安装 | 已确认 | 首次断连回读仍 v20，核对后重试；新进入设备列表确认 v21 |
| v18 真机视觉 | 用户已接受 | 用户反馈「很好，现在效果不错」；v20 新开关与轮播仍待体验反馈 |
| 手环返向 ACK | 真实链路通过 | 当前 session／revision 匹配；重复发送和下一次自动刷新后仍正确确认 |
| 长期稳定性 | 未专项验证 | 常亮、休眠恢复、长连、真实 FPS、内存和功耗 |

安装只证明包在设备上。v17 视觉被否定，v18 视觉已被用户接受；v20 自动切换设置与轮播需新的真机反馈。

## 8. 后续开发入口

| 范围 | 代码／文档入口 |
| --- | --- |
| 当前事实与下一步 | [handoff.md](handoff.md) |
| 手环协议／状态 | `src/common/codex-card.js` |
| 页面生命周期与交互 | `src/pages/index/index.ux` |
| 胶囊坐标 | `src/common/layout.js`、`src/common/physical-ui.js` |
| 物理资源生成 | `scripts/physical-assets.mjs`、`scripts/generate-physical.mjs` |
| Mac AppKit 桥 | `macos/BandDeskBridge/Native/main.m` |
| AstroBox 插件 | `astrobox-plugin/band-desk-bridge/src/lib.rs` |
| 浏览器预览 | `design/robot-desk/v5/index.html` |
| 构建／安装流程 | [development-guide.md](development-guide.md)、[device-setup.md](device-setup.md) |
| 时间线证据 | [validation.md](validation.md)、[version-history.md](version-history.md) |

后续改动顺序：先读本文件和 `handoff.md`，确认当前安装与反馈；修改源定义后生成资源；执行相关测试与构建；需要安装时只提交一次并以设备 `versionCode` 为准；最后把“修改、构建、安装、用户验收”分别更新到文档。
