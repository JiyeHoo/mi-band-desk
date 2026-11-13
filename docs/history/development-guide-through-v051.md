# 历史归档：development-guide.md

归档于 2026-09-20，保留整理前的原文以追溯决策。**不作为当前开发或连接操作指引**；文内“当前”“最新”“待验证”指当时状态，可能已被后续反馈覆盖。请先读 [当前交接](../handoff.md) 和 [开发指南](../development-guide.md)。

---

# 小米手环 9 NFC 桌面应用开发约定

核对日期：2026-09-20。设备：手环 9 NFC / M2346B1 / OS 3.1.32。本文记录官方能力、项目实现和验证边界；当前安装状态另见 `handoff.md`。

## 开发路线

在 macOS 用 Codex 编辑 Vela JS 快应用，AIoT-toolkit 构建 RPK，通过已连接手环的 AstroBox 安装。Android APK 不是这条路线的必需品，当前 ADB 手机与项目无关。应用是独立入口，并非系统桌搭插件。2026-09-20 用户确认充电开始动画可能短暂覆盖，结束后消失、不影响展示；长时间留在本应用及常亮到期行为仍须专项实测。

日常循环：修改 → `npm test` → `npm run build` → `npm run emulator` → 模拟器检查 → `npm run device:status` → `npm run device:install` → AstroBox 设备快应用列表核对版本 → 用户真机反馈。不要把编译成功、模拟器通过、设备安装、用户验收混为一个状态。

## 官方文档与项目决策

| 问题 | 官方依据 | 本项目处理 |
| --- | --- | --- |
| 屏幕和弧形边缘 | [多屏设计](https://iot.mi.com/vela/quickapp/zh/guide/design/multi-screens.html) 列出手环 9 为 192×490 胶囊屏，并要求主体内容位于安全区域 | 按胶囊形单独布局，不把 490×192 矩形的四角视为可用区域 |
| 右滑误退出 | [页面生命周期](https://iot.mi.com/vela/quickapp/zh/guide/framework/script/lifecycle.html) 的 `onBackPress` 可处理系统右滑/实体返回，返回 true 阻止默认返回 | 打开菜单并返回 true；只有点击退出、再次确认才调用 terminate |
| 横屏绘制 | [通用样式](https://iot.mi.com/vela/quickapp/zh/components/general/style.html) 支持绝对位置、尺寸和透明度 | 0.4.1 直接在 192×490 物理坐标绘制，PNG 在生成时预旋转；页面不使用原生 transform |
| 滑动导致画布错位 | [scroll](https://iot.mi.com/vela/quickapp/zh/components/container/scroll.html) 提供双轴滚动开关 | 根节点和输入层显式关闭 scroll-x、scroll-y、bounces；最低 API Level 2 |
| 点击及手势 | [通用事件](https://iot.mi.com/vela/quickapp/zh/components/general/events.html) 说明触摸/click 冒泡，swipe 不冒泡 | 每个点击区域绑定 swipe；父输入层收集物理触摸坐标并补充慢滑识别 |
| 应用退出 | [应用上下文](https://iot.mi.com/vela/quickapp/zh/features/basic/app.html) | 用 `app.terminate()`，不是 `app.exit()` |
| 常亮 | [屏幕亮度](https://iot.mi.com/vela/quickapp/zh/features/system/brightness.html) 的 setKeepScreenOn | 默认关闭，30 分钟/2 小时到期释放；hide/destroy/退出均清理 |

官方的安全区是设计约束，不能据此认为给页面加一个属性就能自动完成横屏胶囊适配。下面的尺寸和交互是本项目选择，不是官方强制值。

## 坐标与胶囊布局

物理坐标 `(X,Y)`：宽 192、高 490。横屏逻辑坐标 `(x,y)`：宽 490、高 192。
0.4.1 删除运行时旋转的父显示层，所有显示节点和点击区域都使用物理坐标。图形、文字与按钮资源在构建素材时旋转 +90°／-90°，翻转仅切换资源目录和坐标。

逻辑矩形 `[x,y,w,h]` 对应的物理显示／点击矩形：

- 默认：`[192-y-h, x, h, w]`
- 翻转：`[y, 490-x-w, h, w]`

`src/common/layout.js` 的 `BOXES` 是显示和点击矩形的共同来源。显示层和透明输入层均不旋转；更新 UI 必须同步使用生成的 Style/Hit，避免“看得到但点不到”。事件仍只在输入层处理。

胶囊参考半径 96 来自本机官方模拟器 xiaomi_band 皮肤。用户最新要求取消所有内容的中央安全矩形，覆盖此前的约束。全屏按真实胶囊轮廓布局，文字可进入两侧；退出按钮直接使用 92×192 胶囊端部，中间放确认文案。按钮最小短边 44，测试验证两种方向的物理范围、按钮尺寸及互不覆盖。

## 交互与防误触

| 操作 | 默认 +90° 时的物理方向 | 翻转 -90° 时的物理方向 | 结果 |
| --- | --- | --- | --- |
| 观看方向上滑 | right | left | 打开菜单 |
| 观看方向下滑 | left | right | 返回原桌面 |
| 左右滑动 | up/down | down/up | 循环切换眼睛、时钟、七天日历 |
| 系统返回回调 | 由固件决定 | 由固件决定 | 打开菜单，阻止默认返回 |

0.2.0 首页只显示眼睛；上滑进入常亮、翻转、退出设置，下滑返回原桌面。退出进入左叉右勾确认页，确认后才终止。系统返回也可能抢先接管手势，此时以 `onBackPress` 打开菜单为准，不能假设仅 CSS 旋转会改变系统手势方向。这里拦截的是应用收到的返回回调，不保证屏蔽系统强制关闭、通知或充电覆盖。

模拟器中约 425ms 的拖动未触发原生 swipe，故增加 touchstart/end 位移识别：主方向达到 28px 视作滑动。移动达到 12px 后抑制本次拖动带出的 click，抑制最长 400ms，下一次 touchstart 会立即清除。取消触摸后同样自动恢复；不要重新引入“直到下次事件才解锁”的无限期全局布尔锁。

0.1.1 的按钮故障来自用户实测“刚打开即点不动”，尚无真机事件日志证明具体原因。0.1.2 同时移除无限期状态依赖、分离旋转和点击坐标。不能把模拟器通过当成已证实原固件根因。用户最新澄清弧形边未确认，此前组合反馈“都正常”不再作为弧边验收依据；后续机器人版本还需单独验证大字体和弧边。

## 工具与常见问题

### 手环启动器资源

官方 [manifest 文档](https://iot.mi.com/vela/quickapp/zh/guide/framework/manifest.html) 给出通用 192×192 图标及 name 字段，但本设备用户反馈该资源实际显示过大且没有名称；检查 0.1.2 RPK 的 name 已正确填写，不能简单归因于漏配。

作为手环专用适配参考，开源 [CountdownDay_MiBand9 的原始图标](https://github.com/tianfangyetan1/CountdownDay_MiBand9/blob/master/src/common/logo.png) 实际为 192×156，上方 96 像素图形，下方直接包含应用名。本项目 0.1.3 采用相同布局规格，重新绘制自己的时钟图形和“桌面时钟”文字，不复制第三方图案。该规格是项目参考实现，不是官方对所有 Vela 设备的统一要求。

资源为 `src/common/launcher-band9.png`，manifest.icon 指向它，0.3.0 的 manifest.name 为“机器人桌搭”。Mac 上执行 `npm run icons` 从 manifest 名称生成；渲染源码为 `scripts/generate-launcher.m`，通过 AppKit 输出透明 PNG。一般构建不需要重画资源。更改名称后必须重生成图片，避免入口文字和元数据不一致。

构建校验检查 RPK 内名称、versionCode、图标路径、PNG 尺寸，以及包内图片与源图片逐字节一致。安装列表的名字正确不等于手环启动器名字正确，最终必须由用户查看真实入口。

### 构建、模拟器与安装

- `npm test` 是页面脚本/常亮控制器逻辑验证；不模拟原生渲染和事件派发。
- `npm run build` 生成 `dist/*.rpk` 并校验真实 ZIP、manifest、源文件时间和签名私钥排除。工具链曾出现错误后退出码仍为 0，必须保留后置校验。
- 保留本机 `sign/` 身份用于升级；目录忽略，私钥权限 600。不要提交或在聊天输出私钥、AuthKey。
- `npm run emulator` 使用专用 `Vela_BandDesk_192x490` 和 Vela PRE 4.0，不是 OS 3.1.32。创建 VVD 要明确指定 PRE 4.0 的 imageDir，否则可能误用默认手表镜像。
- 模拟器亮屏模块初始化失败已确认；“常亮失败”在该镜像中是预期降级，不能据此判定真机能力。
- 模拟器终端可输入 `{"tap":[48,316],"name":"menu"}` 或 `{"swipe":[[35,245],[150,245]],"name":"up"}`；坐标是物理坐标。一次操作完成后再提交下一条。
- AstroBox CLI 等待窗口约 10 秒，超时不代表安装失败。先查 `node_modules/.bin/astrobox-cli queue status`，再查设备信息 → 快应用。不要重复提交同一任务。
- 队列为空只表示当前没有任务；安装完成需核对设备列表里的包名和 versionCode。

## 每轮真机验收

从应用列表重新打开，先不滑动，点击眼睛应回应；上滑设置后测试常亮，翻转后重复。两种方向分别四向滑动、上滑菜单、左右切换三种桌面、滑动后再点按钮。系统返回应留在应用内，只有确认退出才返回系统。检查文字、按钮是否被弧形边缘裁切。交互通过后，再做真实常亮计时和桌搭覆盖测试。

## 0.3.0 动画与日历

正式设计见 [机器人技术方案](../robot-technical-plan.md)。用户反馈 0.2.0 整幅 PNG 序列在真机几乎不动。0.3.0 使用少量小图形和 40ms 时间插值调度，旋转使用静态 CSS 角度类；不要恢复已在当前模拟器复现冻结的组合关键帧／动态内联旋转方案。

以下为历史 0.3.0 实现；0.4.0 已取消所有内容的统一中央安全区并移除眼睛旋转／左右漂移，具体以最新技术方案为准。白色只作为眼睛主色，其他桌面使用薄荷青／暖金／珊瑚等配色。所有切屏都有 420ms 滑动淡入淡出。

`npm run robot:assets` 从 `scripts/robot-scenes.mjs`、`design/robot-desk/v3/sprites.html` 生成小图、`src/common/robot-scenes.js` 和旋转类；预览与设备复用 `src/common/animation.js`。普通构建不重复生成图片。七天日历仍仅按本地日期计算，不同步外部事件。

## 0.3.1 转场终态约束

用户反馈 0.3.0 真机切屏停在中间。原生模拟器用转场帧延迟注入复现：`cardStyle = ''` 不会恢复原生控件的 left/top/opacity。转场完成或取消必须使用 `CARD_REST` 明确归零并恢复不透明，同步 displayView 与 view。必须保留独立完成任务、过期恢复和旧回调失效机制。不要用浏览器清空样式的语义代替 Vela 原生验证。

对照证据、回归范围见 [转场修复记录](../transition-fix.md)。23 项逻辑测试包含延迟最后一帧、回调丢失、连续换页、hide/show 与同目标返回。模拟器命令的 sequence、stepMs、settleMs 可验证转场未结束时连续输入。

## 0.4.0 动画与全屏布局

手环 9 官方屏幕规格为 60Hz，应用采用每秒 60 次的更新预算，按时间格去重并跳过迟到帧。JS 更新日志不等于实测显示 FPS。眼形使用固定不透明黑底 PNG＋显式复位的黑色眼睑，取消左右摇晃、旋转和透明眼形缩放；粒子保留比心、落泪等重复动作。

不得恢复 x=108..382 的统一内缩限制。时钟 96px、日期 34px、设置名称 30px，删除冗余小字；确认页的文案居中，叉／勾分别位于左右弧形端部。两方向物理点击矩形仍从 layout.js 生成。新的残影反馈尚无确定的真机根因证据。

## 0.4.1 黑线兼容修复

用户补充黑线不仅出现在表情，设置常亮按钮第一次文字更新后同样出现。0.4.0 全页面仍共享旋转父层，因此局部重绘路径是共同嫌疑；PRE 4.0 未复现该持续黑线，不能声称确证了 OS 3.1.32 内部缺陷。

0.4.1 全页删除 transform，改用物理坐标和预旋转 PNG。设置状态使用整卡位图更新；时钟和日历由有限字形组成。眼睑使用整数像素、非零几何，完全睁开时 opacity=0。保留根／输入 scroll 双轴禁用和 CARD_REST 转场防挂起机制。

素材修改后运行 npm run robot:assets；只修改字形或设置卡片运行 npm run physical:assets。scripts/physical-assets.mjs 定义字体和状态，scripts/physical-inventory.json 记录 170 张资源尺寸，打包校验逐张比对原文件。HTML 用同一动作插值，但文字由浏览器绘制，不能当作设备逐像素效果。当前回归为 31 项，修复证据与未确认部分见 black-line-fix.md。


## 0.5.0 日历、动作与跟手转场

用户确认 0.4.1 黑线消失。继续禁止原生旋转父层；0.5 设置按新需求删除标题和翻转按钮，只有默认横屏方向入口。layout.js 的两方向坐标函数仍保留逻辑测试，原生 UI 回归以实际可进入的默认方向为准。

左右和上下拖动现在先准备相邻页面，两张不透明卡片同时平移；只更新两个位置，移除整屏透明度混合及中途构建。松手按距离／速度完成或回弹（110～200ms）。保留独立完成回调、过期恢复、会话代号和 CARD_REST。清理 incoming 卡片前必须写入屏幕外位置和 opacity=0；不要把它移回原点，否则 PRE 4.0 的短拖取消会把原页涂黑。touchstart 重复冒泡去重，缺失结束事件 1.4 秒后恢复；手势截图使用 emulator 的 touch 命令分段按下／移动／释放。

节假日数据在 src/common/holidays.js，核对国务院 2026 通知。放假日期与节日当天分开，例如春节假期从 2 月 15 日开始，除夕 16 日、春节 17 日。未收录年份不显示未经确认的调休标记；只保留已知固定公历节日。新增年份需核对官方通知并补测试，不能复制上一年日期。

26 种动作由 scripts/robot-scenes.mjs 生成，默认不漂移，指定情绪可短暂上下／左右移动。Twemoji 四手势仅在相关情绪播放，结束透明并切换时清除；源 SVG 在 scripts/vendor/twemoji，CC BY 4.0 许可和署名随 RPK 分发。修改图形／字体后 npm run robot:assets，再 npm run preview:assets，HTML 新入口 design/robot-desk/v5/index.html。不要把资源生成结果当作原生渲染或真机流畅度证明。

传感器：manifest 只声明 system.app 和 system.brightness，未订阅心率／血氧或加速度。Vela 公共传感器 API 没有关闭系统健康监测的接口，不能显示“已停测”等虚假状态；系统监测需在手环或绑定的手机应用手动调整。本项目不操作绑定手机。官方省电模式会关闭蓝牙等并切换到受限界面，不应宣称可同时维持本应用完整桌搭功能。


## 0.5.1 原生分页与固定设置底图（当前实现）

0.5.0 的真机滑动／按钮更新已被用户否定，前节仅为历史实现。当前代码已删除 JS 双卡控制器，改用 API 2 的原生 swiper：物理纵向桌面、横向设置。全部页面常驻，change 同步选择，start/end 暂停／恢复眼睛，touch 只负责防误触。根 scroll 禁止两轴普通滚动；不在 swiper 上方叠全屏输入层。不要重新加入 JS 手势完成后的再次导航。

设置背景和轮廓固定，只替换 layout.js 的 keepValue 小图；object-fit:none 不缩放。快速亮屏请求跳过 pending 中间图，慢请求 120ms 后显示。日历底栏 festival 优先于 mark，休假采用相连色带。完整依据／验证见 v051-fix.md 和 validation.md；不把模拟器或 native duration 参数当作真实设备的响应时长。
