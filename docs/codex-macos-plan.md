# Codex 卡片与 macOS 直连方案

状态：2026-09-23 / 手环源码 0.9.2 / versionCode 21，修复 Pro 20×／Pro 5× 档位显示；Mac 0.8.2 同步名称，插件沿用 0.7.6。沿用 v18 已接受的黑底额度环与 v20 自动切换开关；安装与真实回执状态见 [handoff.md](handoff.md)。

## 1. 目标与边界

本轮交付一条可独立验证的 Mac 直连链路：

```text
Codex App Server
        │ 本机 stdio JSON-RPC
        ▼
Band Desk Bridge（macOS 菜单栏应用）
        │ 127.0.0.1:17373，只提供脱敏快照
        ▼
Band Desk Bridge（AstroBox WASI 插件）
        │ AstroBox interconnect
        ▼
机器人桌搭（0.9.2 / v21 已安装，订阅区分 Pro 20×／5×；v18 视觉已接受，新开关与轮播待体验）
```

本轮包含：

- Mac 端读取当前 Codex 账号的额度窗口、官方套餐枚举和使用统计，缓存最后一次成功结果。
- Mac 端菜单栏 UI、立即刷新、错误说明、本地桥状态和手环确认状态。
- AstroBox 插件每 15 秒获取最新快照，向当前已连接设备上的 `com.jiyehoo.banddesk` 发送；接收手环确认和刷新请求。
- 手环新增 Codex 卡片，显示剩余额度、重置倒计时、数据新鲜度，并允许双击整张卡刷新。
- Mac、AstroBox、Android 后续实现共用同一版消息协议。

本轮不包含：

- Android APK、小米运动健康 SDK、手机后台服务或手机与 Mac 的蓝牙交接。
- 自动让小米运动健康释放连接、无感双端同时连接或远程公网同步。
- 操作已配对手机、修改手环绑定、刷机、恢复出厂、NFC 或支付设置。
- 把模拟器、构建成功或 AstroBox API 调用成功描述为真机 UI 已验收。

日常方案仍保持上一轮结论：Android 完成后由手机长期持有手环连接；本轮 Mac 直连是桌面使用和协议验证通道，不提前承诺未来可以无感切换。

## 2. 已核实依据

| 项目 | 当前证据 | 实施结论 |
| --- | --- | --- |
| Codex 数据 | 本机 Codex 0.155 App Server 已完成 `initialize`，实际读取到 `account/rateLimits/read` 和 `account/usage/read` | 使用官方 App Server；不读取或保存账号令牌 |
| 额度字段 | 支持 `codex` 窗口及 `usedPercent`、`windowDurationMins`、`resetsAt` | 协议传全部窗口，手环默认显示最长窗口（通常为本周） |
| 套餐字段 | 官方客户端计费资源区分 pro／prolite 两档 | schema v1 可选 `payload.planType`；映射 Pro 20×／5×，不从额度百分比推算倍率；见 [证据](subscription-tiers.md) |
| Token 统计 | 接口支持累计 Token、峰值、连续使用天数及每日桶 | 只在 Mac 展示，不挤入首张手环卡 |
| AstroBox | 本机 2.1.0；官方插件接口提供设备列表、定时器、Interconnect 收发；API v3 guest Future 收尾在实机触发运行时断言，当前安装二进制没有 API v4 运行时 | 保留 WASI Preview 2 / API level 3，回调透传宿主 Future，不依赖未公开的 10721 写接口 |
| 手环通信 | Vela 官方 `system.interconnect` 支持状态、收发和诊断；`system.storage` 支持字符串缓存 | 手环使用事件驱动收包、本地缓存和过期状态，不轮询手机状态 |
| 网络边界 | Band 9/9 Pro 不支持直接 `system.fetch` | 手环不直接访问 Mac 或 OpenAI；所有网络访问留在 Mac/AstroBox |

参考：

- [Codex App Server](https://learn.chatgpt.com/docs/app-server)
- [AstroBox Interconnect](https://plugindoc.astrobox.online/host-api/interconnect/)
- [AstroBox Register](https://plugindoc.astrobox.online/host-api/register/)
- [Vela interconnect](https://iot.mi.com/vela/quickapp/zh/features/network/interconnect.html)
- [Vela storage](https://iot.mi.com/vela/quickapp/zh/features/data/storage.html)

## 3. 需求拆解

### 3.1 Mac 采集

1. 按以下顺序寻找可用 Codex 二进制：环境覆盖、ChatGPT/Codex 应用内置二进制、常见 PATH 路径。
2. 对候选路径执行版本校验，避免当前 Homebrew 软入口存在但内部二进制缺失时误判可用。
3. 启动 `codex app-server --listen stdio://`，每条连接先发送 `initialize` 和 `initialized`。
4. 每 2 分钟读取额度和 Token 统计；用户点击“立即刷新”时立即读取。
5. 单次失败保留最后成功快照，不把旧数据重新标成刚更新；超过 10 分钟显示过期。

### 3.2 本机桥

- 只监听 `127.0.0.1:17373`。
- `GET /v1/health`：桥运行状态，不返回账号数据。
- `GET /v1/snapshot`：返回最后一次成功的协议快照；无快照时返回 503。
- `POST /v1/events`：接收 AstroBox 插件的发送结果、手环 ACK 和刷新请求；兼容 `Content-Length` 与 chunked 正文，无效事件返回 400。
- 快照不包含访问令牌、账号邮箱、设备地址、AuthKey 或签名材料。

### 3.3 AstroBox 插件

- 加载后注册 15 秒 interval，并立即同步一次。
- 每轮只面向 `get-connected-device-list` 返回的当前连接设备。
- 对每台设备注册 `com.jiyehoo.banddesk` 的 Interconnect 接收，再发送一次最新完整快照。
- 手环发来 `refresh_request` 时先通知 Mac 采集，延迟 2 秒再读取并发送新快照；AstroBox 2.1 实际事件为 `{addr,payloadHex,payloadText,pkgName}`。插件 0.7.6 校验包名并解析 `payloadText`，只回传协议白名单字段，兼容直接 JSON／JSON 字符串。
- `relay_status=sent` 同时回报 `sessionId`／`revision`。Mac 只确认当前快照对应的 ACK；同版重发不清除 ACK、不延长首次发送后的 30 秒等待时限。45 秒没有插件状态后提示连接待恢复。
- 无设备、Mac 服务未运行、HTTP 失败和发送失败分别上报，不输出设备地址或快照全文。

### 3.4 手环卡片

- 在现有原生纵向内层 swiper 增加第 4 页，不增加 JS 跟手控制器或覆盖分页的输入层。
- 收包后验证版本、类型、卡片 ID、时间、窗口和 revision；同一 session 内丢弃迟到快照，相同 revision 不重复应用但会幂等补发 ACK。
- 成功应用后缓存原始快照并发送 ACK；重新连接或双击卡片发送 `refresh_request`。
- 无数据、在线新鲜、离线缓存和过期四种状态有明确文字，颜色只作辅助。
- 动态更新只改文字精灵和一条进度条，不使用父层旋转或高频动画。

## 4. UI 设计

### 4.1 手环 Codex 卡片

逻辑横屏 490×192，使用 192×490 物理坐标和预旋转素材。当前视觉见 [0.8.2 环形额度页](codex-card-v082.md)；v17 视觉已被用户否定。

- 纯黑底，无背景卡片或描边；左侧 168px 绿色剩余额度环，54px 白色数字，下方实际窗口。
- 右侧 36px 白色 ChatGPT Logo、26px 套餐，24px 重置时间、21px 更新状态；文字左边线统一。
- `pro` 显示 Pro 20×，`prolite` 显示 Pro 5×；`self_serve_business_prolite` 保留用户确认的 Business 5×。未知为 ChatGPT。[档位证据](subscription-tiers.md)。协议没有货币余额，不编造金额。
- 全行预排版图片避免逐字拼接；隐藏双击提示，保留双击动作。
- 整页双击刷新，420ms／44px 规则和原生分页保持。26×26 loading 独立更新，收到新快照、失败、hide 或 18 秒超时停止。
- 无数据为 `—%`；断连、过期保留快照并显示暖橙状态文字。

### 4.2 macOS 菜单栏应用

采用原生 AppKit、系统字体和单列信息层级；菜单栏常驻，展开宽度约 380px。0.8.1 的额度背景由原生视图按 `controlBackgroundColor` 绘制，随浅色／深色变化；标题、数字、进度与副标题约束在同一背景内，修复 NSBox 内容越界。连接状态点随真实状态变化，0.8.2 套餐同步区分 Pro 20×／5×。SwiftUI 旧实现仅为参考，未同步本次原生修复；交付构建不依赖本机损坏的 SwiftPM。

```text
┌ Band Desk Bridge ───────────── 已同步 ┐
│                                       │
│  本周剩余                             │
│  97%                  5天8时后重置    │
│  ████████████████░                    │
│                                       │
│  使用统计   累计 Token   连续使用     │
│                                       │
│  连接链路                             │
│  ● Codex App Server      正常          │
│  ● 本机桥                 127.0.0.1    │
│  ● AstroBox 插件          已转发/异常  │
│  ● 手环确认               已发送/已确认│
│                                       │
│  [立即刷新]             [打开 AstroBox]│
│  仅本机通信，不保存账号凭据            │
└───────────────────────────────────────┘
```

交互与无障碍：

- 加载超过 300ms 显示进度；成功、失败、过期均有文字，不只用红绿圆点。
- 所有按钮提供 accessibility label；键盘焦点使用系统样式。
- 不使用持续脉冲和装饰动画；遵循系统减少动态效果设置。
- 额度卡显示所有实际返回窗口；手环选中的窗口加“手环显示”标记。
- 错误文案给出可执行动作，例如“未找到 Codex 二进制”“请启动 AstroBox”，不显示原始凭据或整包 JSON。

## 5. 消息协议 v1

Mac/AstroBox → 手环使用完整快照：

```json
{
  "schemaVersion": 1,
  "type": "snapshot",
  "cardId": "codex.rate-limits",
  "sourceId": "mac-local-installation-id",
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
        "usedPercent": 3,
        "remainingPercent": 97,
        "windowDurationMins": 10080,
        "resetsAt": 1790500000000
      }
    ],
    "usage": {
      "lifetimeTokens": 123456,
      "peakDailyTokens": 12345,
      "currentStreakDays": 8,
      "longestStreakDays": 14
    }
  }
}
```

手环 → AstroBox：

```json
{"schemaVersion":1,"type":"ack","cardId":"codex.rate-limits","sessionId":"collector-session-id","revision":12,"appliedAt":1790000001000}
```

```json
{"schemaVersion":1,"type":"refresh_request","cardId":"codex.rate-limits","sessionId":"collector-session-id","lastRevision":12,"requestedAt":1790000002000}
```

协议约束：

- 所有时间都是 Unix 毫秒；百分比进入协议前收敛到 0～100。
- 断线只保留最新完整快照，不做增量补发。
- `fetchedAt` 是 Codex 成功采集时间；转发不能改写它。
- `expiresAt` 默认比 `fetchedAt` 晚 10 分钟。
- `sessionId + revision` 共同决定顺序；换 session 后允许 revision 重新开始。
- 同一 revision 的重复快照不得重写缓存或提前结束刷新 loading，但要再次 ACK，允许发送端从一次回程丢包中恢复。
- `payload.planType` 为向后兼容的可选字段，只接受官方已知枚举并映射短标签；缺失或未知时显示 `ChatGPT`。
- 首期 `accountKey` 固定为 `default`；未来多账号时改成不可逆本地标识，不能发送邮箱。

## 6. 实施顺序

1. 增加协议模型、解析和 fixture 测试。
2. 实现 Mac App Server 客户端、本机 HTTP 桥和原生 AppKit 菜单栏 UI；保留 SwiftUI 同协议参考实现。
3. 实现 AstroBox WASI 插件并生成 `.abp`。
4. 增加手环 Codex 页面、缓存、ACK/刷新请求和浏览器预览；0.7.1 改为整卡双击和独立 loading，0.7.2 修复缺字与 loading 空白帧。
5. 0.8.0 / versionCode 16 增加真实套餐、分段环形仪表、OLED 胶囊视觉和 0%／100% 极值适配；JS、AppKit 和正式 RPK 构建已通过。
6. 0.8.0 / v16 已在唯一 Band 9 NFC / M2346B1 / 3.1.32 上完成单次提交安装；CLI 0% 超时后没有重传，后台队列完成并由设备列表回读 v16。插件 0.7.5 当时已恢复；后续 v18 视觉获得用户接受，v20 设置开关已安装。
7. Mac 0.8.1／插件 0.7.6 修复系统外观、额度背景边界和 AstroBox 2.1 回程事件解包；已更新运行，真实同版重发和新 revision 的 ACK 均已确认。

8. 0.9.2 / v21 与 Mac 0.8.2 区分 Pro 20×／5×；映射经官方客户端计费资源核对。原生两档排版通过，重试后设备列表确认 v21。

## 7. 验收口径

本机可确认：

- Mac 程序能通过当前 Codex App Server 取得真实额度与统计，并在断线时保留旧值和标记过期。
- HTTP 服务只绑定回环，协议 fixture、迟到 revision、异常字段和空数据测试通过。
- AppKit macOS App、AstroBox 插件、手环 RPK 都能从各自命令构建。
- 浏览器预览中的 0%、59%、100% 和 loading 均无裁切或控制台错误；JS 测试确认第 4 页仍由原生 index 驱动。

必须留待真机：

- 正向数据送达与返向 ACK 已验证；长期断连恢复和功耗仍需专项验收。
- v18 环形额度页视觉已获用户接受；v20 设置与轮播手感仍待反馈。
- 双击整张卡是否只触发一次刷新、是否与慢拖／短拖／中断滑动无冲突，以及长期连接功耗。
