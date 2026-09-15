# 第三方来源

## DeepSeek-Balance-Whale-Widget

- 作者：MeteorNOX。
- 仓库：https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget
- 固定提交：`40cebc2937aea674247a0d0e03e16c154f7b9864`，包版本 `0.3.0`。
- 许可：MIT，完整文本见 [LICENSE](LICENSE)。
- `vendor/whale-widget.js` 是该提交 `assets/whale-widget.js` 的未修改副本。
- `assets/DSniang1.png`、`Ya1.mp3`、`Ya2.mp3`、`D1.mp3`、`D2.mp3`、`minecraft-exp-orb.wav`、`task-end-a.wav`、`bubble-petpet.gif`、`bubble-money1.gif` 均来自该提交的 `assets/`。
- 安装成品的元数据用相同提交固定 `@resource`。本地资源副本用于浏览器测试；构建不重新生成或重绘素材。
- 移植修改集中在 `src/` 与 `scripts/build.mjs`，构建成品内保留作者、MIT 和衍生代码来源。

## HTTPSend 2

- 作者：Sonic853。
- 固定发布文件：[HTTPSend 2](https://update.greasyfork.org/scripts/595862/1932539/HTTPSend%202.js)。
- 运行时使用 `@require`，不将 HTTPSend 打包到成品正文中。
- `tests/fixtures/HTTPSend.js` 是该发布文件的测试副本，保留其原有声明。

## 构建及测试依赖

Acorn、esbuild、Playwright 仅用于本地构建/测试，版本固定在 `package-lock.json`，不作为用户脚本运行时依赖。
