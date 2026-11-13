# 当前开发指南

状态：2026-09-23 / 手环源码 0.9.2 / versionCode 21，修复 Pro 20×／Pro 5× 档位显示；Mac 0.8.2 同步名称，插件沿用 0.7.6。沿用 v18 已接受的黑底额度环与 v20 自动切换开关；安装与真实回执状态见 [handoff.md](handoff.md)。

## 设备与工作范围

目标为 Xiaomi Smart Band 9 NFC / M2346B1，用户设备 OS 3.1.32；物理 192×490，横屏内容 490×192。设备端是 Vela JS 快应用，包名 `com.jiyehoo.banddesk`、名称“机器人桌搭”；桌面端另有 macOS 菜单栏桥和 AstroBox WASI 插件。它们都不是 Android APK 或固件。

应用通过 Mac AstroBox 安装。手环绑定另一台 Android；任何 ADB 实体手机都不属于本项目调试目标。不得刷机、恢复出厂、删除原配对或变更 NFC／支付。保持本地签名以便覆盖更新，不输出账号密码、AuthKey 或私钥。

## 当前实现约束

| 范围 | 必须保留的约定 | 入口 |
| --- | --- | --- |
| 分页 | 原生嵌套 swiper；move 不写页面位置，不再加入 JS swipe 补偿导航 | [index.ux](../src/pages/index/index.ux) |
| 滚动 | 根 scroll 的 x/y/bounces 都关闭，仅分页容器滚动；不在 swiper 上覆盖全屏输入层 | [index.ux](../src/pages/index/index.ux) |
| 横屏 | 物理坐标绘制，图片预旋转，禁止运行时原生父层 transform | [layout.js](../src/common/layout.js) |
| 胶囊 | 用户要求全部内容可利用完整屏幕；按实际弧线适配，不能恢复统一中央安全矩形 | [layout.js](../src/common/layout.js) |
| 眼睛／手势 | 白色眼睛和白色手势、26 种情绪各有短动作；以双眼高低差表现歪头，无原生旋转，切场景清空旧效果 | [animation.js](../src/common/animation.js) |
| 动画调度 | 眼睛和效果尺寸固定；运动段按 60 次／秒预算采样，静止段由 nextMotionDelay 延后唤醒，自动切换等两个完整动作周期 | [robot-scenes.mjs](../scripts/robot-scenes.mjs)、[index.ux](../src/pages/index/index.ux) |
| 设置 | 三项共用一张固定底图及描边，常亮／轮播状态各只更新内部 40×112 物理图；使用受支持的 object-fit | [physical-assets.mjs](../scripts/physical-assets.mjs) |
| 返回／退出 | onBackPress 返回 true 并开菜单；只有退出页右勾明确确认才 terminate | [index.ux](../src/pages/index/index.ux) |
| 常亮 | 关／30 分／2 小时；hide、destroy、退出和到期释放；旧回调不能重新开启 | [keep-screen.js](../src/common/keep-screen.js) |
| 日历 | 七天、周一起；节日名优先，否则底栏显示休／班；连续官方休假相连色带；数据当前仅核对 2026 | [holidays.js](../src/common/holidays.js) |
| Codex 卡片 | 只接收 schema v1 的新 session／更高 revision；可选 `planType` 只映射已知短标签；纯黑环形额度、整行预排版文字、快照缓存、10 分钟过期、断连文案、ACK 和刷新请求均显式处理 | [codex-card.js](../src/common/codex-card.js)、[方案](codex-macos-plan.md)、[0.8.2 视觉](codex-card-v082.md) |
| 许可 | Twemoji 四手势为 CC BY 4.0，保留源 SVG、修改说明、署名与包内许可 | [NOTICE](../src/common/licenses/Twemoji-NOTICE.txt) |

翻转按钮已删除，设备 UI 只使用默认横屏。反向图片和坐标函数仍保留，测试中可验证映射；这不表示当前用户能切换方向。所有必要文字保持大字号、低密度。眼睛和四种手势使用白色，手势以黑色细节区分手指；日历、时钟和爱心／眼泪等点缀可以保留彩色。

26 种情绪都有对应的环顾、点头、歪头、跳动、抽泣或摇摆，动作结束后停顿，不持续无目的晃动。gaze 每帧为 `[percent,x,y,tilt]`，其中 tilt 仅令左眼 y 减少、右眼 y 增加；不旋转父层或眼形。眼睛保持 128×128，效果曲线 scale 恒为 1，四手势为 76px，并在出现前先让双眼向左腾出空间。贴脸的腮红／眼泪可用 followGaze 跟随位置和高低差。

nextMotionDelay 在静止曲线段延迟唤醒，运动段按经过时间采样并跳过迟到帧；它是调度优化，不是实测帧率。未受点击、切页或生命周期打断时，每个表情播放两个完整周期再随机切换，当前为 8～12.8 秒，避免固定 8 秒截断长动作。新增动作须同时检查循环首尾、静止段唤醒、触摸暂停及 hide/show，不能仅凭定时器计数判断流畅度。

## 坐标与点击

横屏逻辑矩形 `[x,y,w,h]` 默认映射为物理 `[192-y-h,x,h,w]`；反向映射为 `[y,490-x-w,h,w]`。`BOXES` 统一生成可交互区域的显示／点击样式；资产绘制中若含固定轮廓坐标，改变 BOXES 时也必须同步生成器并检查像素对齐。

| 用户观看方向 | 默认物理方向 | 原生容器 |
| --- | --- | --- |
| 左／右切桌面 | up／down | 内层 vertical swiper，四页循环：眼睛／时钟／日历／Codex |
| 上滑设置 | right | 外层 horizontal swiper，从桌面 index=1 到设置 index=0 |
| 下滑回桌面 | left | 外层从 index=0 回 index=1，保留内层桌面选择 |

旋转资源不会改变系统手势方向。系统返回回调仍单独拦截；不能据此保证屏蔽系统通知、充电动画或强制关闭。

## 自动轮播

0.9.1 设置增加默认开启的“自动切换”开关，选择保存在本地，重新打开应用仍生效；关闭时保留手动翻页。0.9.0 起默认表情 60 秒、时钟／日历／Codex 各 10 秒，循环返回表情。沿用原生 swiper.swipeTo 动画与原生索引回调。手动操作后至少保留 30 秒阅读时间，设置／退出页和后台暂停，回前台不补跑。详细规则与异常恢复见 [自动轮播](automatic-carousel.md)。

## 常用命令

在项目根目录执行。依赖 Node.js 20+、npm、Python 3（Pillow 用于 PNG 无损压缩）；资源生成另用 Playwright 浏览器和本机字体，图标生成使用 macOS AppKit。工具链依赖以 package-lock.json 为准。

```sh
npm ci
npm test
npm run build
npm run emulator
```

`npm run build` 包含真实 RPK 校验；单独复核已有包可执行 `node scripts/verify-package.mjs`，它会刷新 `dist/build-info.json`。元数据的 builtAt 是脚本写入时间，不宜单独用来证明实际构建或安装时间。交付身份以文件 SHA-256、包名、版本和安装记录为准。

模拟器必须是脚本指定的 `Vela_BandDesk_192x490` / PRE 4.0。回车截图；Ctrl+C 或 `npm run emulator:stop` 关闭该专用实例。脚本内调用只寻址 `emulator-*`，不能改为未指定目标的 ADB 命令。PRE 解压 RPK 允许 120 秒，避免大量整行文字图片触发工具包默认 10 秒超时；该操作只针对上述具名模拟器。

### 改动与素材生成

| 改动 | 执行 | 注意 |
| --- | --- | --- |
| 动作曲线、眼形、手势 | `npm run robot:assets` | 生成原图、场景数据、物理图和共享预览代码 |
| 字号、颜色、固定文案、设置轮廓 | `npm run physical:assets` | 普通字形加入 fonts；Codex 整行文案加入 codex-art.mjs；同步 preview |
| 仅共享坐标／日历／插值逻辑 | `npm run preview:assets` | 若图片几何也变了，仍需重生成物理素材 |
| 名称／入口标记 | `npm run icons` | 保留 192×156 瓦片规格和可见应用名；真机检查启动器 |
| 只改说明文档 | 检查链接、事实和状态一致性 | 无需重建或重新安装设备 |

修改源定义，不手改生成的 robot-scenes.js、physical-glyphs.js、物理图片清单或 shared.js。资源生成命令内部已串联后续步骤，不必无条件重复执行。

### macOS 与 AstroBox 插件

```sh
cd macos/BandDeskBridge
./scripts/test-native.sh
./scripts/package-app.sh

cd ../../astrobox-plugin/band-desk-bridge
python3 scripts/build.py
```

macOS 当前交付实现为 AppKit，产物在 `.artifacts/macos/Band Desk Bridge.app`；启动后每 2 分钟刷新 Codex，并仅监听 `127.0.0.1:17373`。NativeTests 检查回执状态与额度内容边界，并渲染浅色／深色原生页面。SwiftUI/Swift Package 旧参考源码保留（未同步本次原生修复），但当前本机 SwiftPM 的 `PackageDescription` 链接损坏，不能将 `swift test` 失败归因于业务代码，也不能把未执行的 Swift 测试写成通过。

插件构建目标为 `wasm32-wasip2`，输出 `astrobox-plugin/band-desk-bridge/dist/Band Desk Bridge.abp`。构建、导入 AstroBox、转发成功、手环 ACK 是四个独立状态；未导入时不得宣称连接闭环。

### 浏览器预览

```sh
python3 -m http.server 8770 --bind 127.0.0.1
```

打开 [新版预览](http://127.0.0.1:8770/design/robot-desk/v5/index.html)。服务可能已运行，先确认端口与目录，避免重复启动。预览复用物理资源／坐标，分页动画由浏览器实现，与设备原生 swiper 不同。检查窄屏时，不仅看 body 是否溢出，还要确认整个胶囊都落在预览容器内；0.5.1 修正过 grid 最小列宽导致的右侧裁切。

## 验证和部署

按 [验证与交付清单](release-checklist.md) 选择与变更相关的检查。单元测试不模拟原生派发；PRE 4.0 不是设备 OS 3.1.32；模拟器中亮屏接口不可用，失败文案不能当作设备 API 不支持的证明。

安装前核对 AstroBox 唯一目标名称、型号 M2346B1、固件与现有版本，确认队列无未完成任务。运行 `npm run device:install` 一次；如 CLI 超时，查队列，再重新进入设备快应用列表确认 `com.jiyehoo.banddesk` 的 versionCode。不能凭进度 100% 或空队列宣称升级完成。

收到真机反馈或安装状态改变后，同步 handoff、validation，必要时更新版本对照；源码和安装包不同步必须明确说明。长期常亮、实际 FPS 和功耗仍需专项测量。

## 平台能力依据

这些链接是本项目已使用的依据；新增 API 或改变支持范围时重新核对 Band 9，不能默认较新设备的能力适用。

- [通用事件](https://iot.mi.com/vela/quickapp/zh/components/general/events.html)、[swiper](https://iot.mi.com/vela/quickapp/zh/components/container/swiper.html)、[scroll](https://iot.mi.com/vela/quickapp/zh/components/container/scroll.html)。
- [图片显示方式](https://iot.mi.com/vela/quickapp/zh/components/basic/image.html)、[布局样式](https://iot.mi.com/vela/quickapp/zh/components/general/style.html)、[多屏设计](https://iot.mi.com/vela/quickapp/zh/guide/design/multi-screens.html)。
- [页面生命周期](https://iot.mi.com/vela/quickapp/zh/guide/framework/script/lifecycle.html)、[应用接口](https://iot.mi.com/vela/quickapp/zh/features/basic/app.html)、[亮屏接口](https://iot.mi.com/vela/quickapp/zh/features/system/brightness.html)。
- [设备通信 interconnect](https://iot.mi.com/vela/quickapp/zh/features/network/interconnect.html)、[数据存储 storage](https://iot.mi.com/vela/quickapp/zh/features/data/storage.html)：0.7.0 用于快照收发和本地缓存；真机仍需验证 AstroBox 的对端注册及签名／包名链路。
- [Codex App Server](https://learn.chatgpt.com/docs/app-server)：Mac 桥先完成 initialize／initialized，再调用 `account/rateLimits/read` 与 `account/usage/read`；只转发所需字段。
- [传感器接口](https://iot.mi.com/vela/quickapp/zh/features/system/sensor.html)：本轮核对未找到关闭系统全天心率／血氧监测的开关。应用未订阅传感器不等于硬件或系统健康监测已关闭，不增加虚假的停测状态。
- [性能建议](https://iot.mi.com/vela/quickapp/zh/guide/best-practice/business.html)：减少动态样式、嵌套和回流，尽量使图片与显示尺寸一致。
