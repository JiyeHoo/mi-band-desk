# Band Desk Bridge AstroBox 插件

WASI 2 / AstroBox API level 3 转发插件。它从 macOS 本机桥的 `http://127.0.0.1:17373/v1/snapshot` 读取 schema v1 快照，向已连接设备的 `com.jiyehoo.banddesk` Interconnect 通道发送，并把 ACK、刷新请求和转发状态回传到 `/v1/events`。

当前插件版本为 **0.7.6**，已在 AstroBox 2.1.0 更新运行，并取得与 Mac 当前快照匹配的真实手环 ACK。功能页先渲染状态再立即同步；后续同步由 15 秒定时器、设备事件、手环刷新请求或“立即同步”按钮触发。收到刷新请求后先通知 Mac，延迟 2 秒再读取快照。

AstroBox 2.1.0 实际接收事件为 `{addr,payloadHex,payloadText,pkgName}`。插件验证 `pkgName` 后解析 `payloadText`，再验证 schema、卡片、事件类型、session 与 revision，只回传 ACK／刷新请求白名单字段。也兼容直接 JSON 与 JSON 字符串；不会将地址、十六进制副本或额外字段转给 Mac。发送状态包含对应快照的 session／revision，以便区分“已发送”和“已确认”。

本版本沿用 0.7.4 的 API level 3 Future 收尾修复：直接返回宿主 Future，避免 guest `FutureWriter` 触发运行时断言。当前 AstroBox 2.1.0 仅带 API level 2/3 运行时，没有使用后续 API level 4。

## 构建与测试

```sh
rustup target add wasm32-wasip2
cargo test --lib
cargo fmt --check
cargo clippy --release --target wasm32-wasip2 -- -D warnings
python3 scripts/build.py
```

输出：`dist/Band Desk Bridge.abp`。4 项测试覆盖宿主封装、直接 JSON／刷新请求、协议拒绝与字段白名单。

插件不打印设备地址或快照正文。构建、导入、转发和真实 ACK 分别核对；联调前按项目 [交接](../../docs/handoff.md) 核对设备和队列。
