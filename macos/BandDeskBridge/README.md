# Band Desk Bridge

macOS 原生菜单栏桥接程序。它通过当前用户已登录的 Codex App Server 读取额度和使用统计，只在 `127.0.0.1:17373` 提供脱敏快照，供 AstroBox 插件转发到手环。

## 构建与运行

```bash
./scripts/test-native.sh
./scripts/package-app.sh
open "../../.artifacts/macos/Band Desk Bridge.app"
```

脚本用系统 Clang/AppKit 构建并执行 ad-hoc 签名，产物位于项目根目录 `.artifacts/macos/Band Desk Bridge.app` 和压缩包 `Band Desk Bridge 0.8.2.zip`。更新后应确认旧进程已退出，且新实例持有 17373 端口；仅重复启动不能证明运行的就是新版本。程序按顺序验证 ChatGPT/Codex 应用内置二进制和常见 PATH；可用 `BAND_DESK_CODEX_BIN` 覆盖。程序不读取、不保存登录令牌。

0.8.2 增加 `pro → Pro 20×`、`prolite → Pro 5×`，与手环一致，详见 [订阅档位](../../docs/subscription-tiers.md)。沿用 0.8.1 的额度背景使用系统自适应颜色，标题、数字、进度条和副标题都约束在背景内；浅色／深色原生渲染和几何断言已通过。`self_serve_business_prolite` 按用户确认显示 Business 5×。

`Native/main.m` 是当前可交付实现。`NativeTests/` 检查同版重发、新版本、迟到／错版 ACK、超时、断连及布局边界。`Sources/` 与 `Tests/` 保留旧 SwiftUI/Swift Package 参考实现和解析测试，未同步本次原生修复；本机 Command Line Tools 的 SwiftPM `PackageDescription` 链接损坏，不能声称 Swift 测试通过，也不影响 AppKit 产物。

## 本机接口与确认状态

- `GET /v1/health`：运行状态及 `snapshotRevision`、`lastSentRevision`、`lastAckRevision`、`ackMatchesSnapshot`、`bandState`。
- `GET /v1/snapshot`：当前快照，无数据返回 503。
- `POST /v1/events`：转发状态与校验后的手环事件；无效事件返回 400。

ACK 必须与当前快照的 session／revision 一致。重复转发不会清除已确认状态，也不会延长首次发送后 30 秒的等待时限；45 秒没有插件状态则提示连接待恢复。新快照必须重新收到对应 ACK。状态点随实际结果变化，每 5 秒更新超时与数据新鲜度。

服务明确绑定回环地址；快照只含额度窗口、Token 汇总、时间和协议顺序字段。真实设备回执与原生渲染 fixture 分别记录在 [验证记录](../../docs/validation.md)。
