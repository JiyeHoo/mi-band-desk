# 第三方许可与素材说明

本项目原创代码及文档采用根目录的 [MIT License](LICENSE)。下列第三方内容不因本项目使用 MIT 而改变其原有许可或获得额外授权。再分发源码、素材或构建产物时，请同时保留适用的第三方版权、许可和修改说明。

## Twemoji 手势图形

- **来源**：[Twemoji 14.0.2](https://github.com/twitter/twemoji/tree/v14.0.2)，Copyright Twitter, Inc. and other contributors。
- **许可**：图形采用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)，完整许可见 [Twemoji-LICENSE.txt](src/common/licenses/Twemoji-LICENSE.txt)。
- **范围**：原始 SVG 位于 [scripts/vendor/twemoji](scripts/vendor/twemoji/)；OK、点赞、挥手、胜利手势及其生成的 PNG 和预览图也包含相关图形。
- **修改和署名**：素材经过重着色、增加手指细节、调整尺寸和方向等处理，详见 [Twemoji-NOTICE.txt](src/common/licenses/Twemoji-NOTICE.txt)。再使用时须按 CC BY 4.0 要求署名、链接许可并说明修改。

## Grobot 动画参考实现

- **来源**：[Grobot_Animations](https://github.com/tanmaywankar/Grobot_Animations)，Copyright (c) 2026 tanmay_wankar，参考提交 `858d8da648c9e71ff9b9f5e6f558ba85293a70fb`。
- **许可**：MIT，原版权与许可全文见 [Grobot-LICENSE.txt](design/robot-desk/Grobot-LICENSE.txt) 和 [包内副本](src/common/licenses/Grobot.txt)。
- **范围**：[历史预览 index-v2.html](design/robot-desk/index-v2.html) 包含改编代码及参数；来源与修改说明见[设计说明](design/robot-desk/README.md)。再分发相关部分时须保留上游版权和许可声明。

## OpenAI / ChatGPT 标识

Codex 额度页和示意图使用 OpenAI Blossom 标识。原始 SVG 位于 [scripts/vendor/openai](scripts/vendor/openai/)，生成的设备图片及 [Codex 示例图](docs/images/codex.png) 也包含该标识；来源和处理方式见 [OpenAI-NOTICE.txt](src/common/licenses/OpenAI-NOTICE.txt)。OpenAI 名称和标识属于其权利人，**不在本项目 MIT 授权范围内**。仓库中的来源说明不构成额外授权；公开分发或再次使用时，应自行核对 [OpenAI 品牌指南](https://openai.com/brand/)及适用的使用条款。本项目与 OpenAI 无官方关联。

## 字体与依赖

资源生成脚本使用系统可用字体，包括 Arial、PingFang SC 和系统字体，并生成文字位图；本仓库未随附相应字体文件。本项目的 MIT 许可不授予字体本身的权利，使用和分发字体或由其生成的素材时应核对相应条款。

构建工具及依赖（包括 npm、Rust 依赖及平台 SDK）由各自权利人按各自许可提供，并非都采用本项目许可证。依赖清单分别见 [package-lock.json](package-lock.json) 和 [Cargo.lock](astrobox-plugin/band-desk-bridge/Cargo.lock)；分发包含依赖的产物时，需另行核对相应许可和声明。
