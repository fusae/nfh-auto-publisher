# Usage

## 1. 安装

```bash
npm install
npx playwright install chromium
```

## 2. 配置账号密码

优先编辑根目录下的 `nfh.config.json`：

```json
{
  "username": "your-account@example.com",
  "password": "your-password"
}
```

如果不填账号密码，脚本也能跑，但登录步骤需要你手工完成。

## 3. 登录

```bash
npm run login
```

登录成功后会生成：

- `.runtime/state.json`

## 4. 发布

```bash
npm run publish -- "/path/to/article.docx"
```

辅助模式：

```bash
npm run publish:assist -- "/path/to/article.docx"
```

## 5. 预览页截图

```bash
npm run preview
```

## 运行产物

- `.runtime/images/`: Word 中导出的图片
- `.runtime/screenshots/`: 运行过程截图
- `.runtime/state.json`: 登录状态
