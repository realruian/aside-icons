# Aside 图标扩展

为 Aside 浏览器的固定区和标签页换上统一风格的网站图标（原版 / iPhone / Mac / 优化版）。

## 目录
- `extension/` 扩展本体（直接加载这个目录）
- `assets/catalog.json` 网站清单，唯一数据源；`extension/library.js` 由它生成
- `assets/untrimmed/` 未裁边的原始图标；`assets/optimized-svg/` 优化版矢量源
- `scripts/` 构建与发布脚本
- `tests/` 测试（`tests/node_modules` 需 `cd tests && npm install`）
- `docs/` 规划与更新说明
- `dist/` 打包产物（不入库）；`archive/`、`work/` 历史资料（不入库）

## 常用命令
- `npm run build:optimized [id ...]` 生成优化版图标并写入清单
- `npm run build:library` 由清单生成 `extension/library.js`
- `npm test`
- `npm run release` 构建 → 测试 → 版本号 +1 → 安装到 Aside → 打包到 dist/

安装位置：`~/Library/Application Support/AsidePinnedIcons`（Aside 以未打包扩展加载）。发布后打开一次设置页，它会自动重载扩展。
