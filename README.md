# 南方号自动发文工具

把 `.docx` 文章解析成标题、正文和图片，再通过 Playwright 写入南方号后台。

## 当前阶段

这个版本先解决两件事：

- 收敛成一个统一 CLI，避免多份脚本分叉
- 把账号密码、登录态、截图和运行产物移出源码

## 安装

```bash
npm install
npx playwright install chromium
```

## 配置

默认读取根目录下的 `nfh.config.json`。真实账号密码放这里，不要写进代码，也不要提交到仓库。

```json
{
  "username": "your-account@example.com",
  "password": "your-password"
}
```

项目里已经放了模板文件：

- `nfh.config.example.json`
- `nfh.config.json`

环境变量仍然可用，但只建议在自动化环境里覆盖配置文件：

```bash
export NFH_CONFIG_FILE="./nfh.config.json"
export NFH_USERNAME="your-account@example.com"
export NFH_PASSWORD="your-password"
```

运行期文件默认写到 `.runtime/`：

- `.runtime/state.json`
- `.runtime/images/`
- `.runtime/screenshots/`

## 用法

登录并保存状态：

```bash
npm run login
```

发布文章：

```bash
npm run publish -- "/path/to/article.docx"
```

半自动模式：

```bash
npm run publish:assist -- "/path/to/article.docx"
```

也可以直接用统一入口：

```bash
node src/cli.js publish "/path/to/article.docx" --mode auto
node src/cli.js publish "/path/to/article.docx" --mode assist
node src/cli.js preview
```

## 模式说明

- `auto`: 自动上传正文图片、自动尝试从正文选封面、自动保存
- `assist`: 自动填标题正文，但图片和封面由你在浏览器里确认后继续
- `manual`: 当前先复用 `assist` 流程，后面再细分更强的人工模式

## 项目结构

```text
src/
  cli.js
  lib/
    browser.js
    config.js
    docx-parser.js
    nfh-client.js
```

## 后续方向

下一阶段适合继续做两件事：

- 把页面选择器和错误恢复继续稳定化
- 补成适合 OpenClaw skill 安装的包装形式
