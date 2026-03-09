import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.resolve('out');
const STATE_FILE = path.join(OUT_DIR, 'state.json');
const PUBLISH_URL = 'https://nfh.nfapp.southcn.com/backend/nfh-publishing-system/#/content/publish';

(async () => {
  if (!fs.existsSync(STATE_FILE)) {
    throw new Error('缺少 out/state.json，请先运行登录脚本');
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    storageState: STATE_FILE,
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  console.log('使用已保存的登录状态访问发文页面...');
  await page.goto(PUBLISH_URL);
  await page.waitForTimeout(5000);

  // 截图
  await page.screenshot({ path: path.join(OUT_DIR, 'publish-full.png'), fullPage: true });
  console.log('✓ 完整页面截图: out/publish-full.png');

  // 分析页面元素
  console.log('\n=== 页面元素分析 ===\n');

  // 查找标题输入框
  const titleSelectors = [
    'input[placeholder*="标题"]',
    'input[placeholder*="请输入标题"]',
    'input[name="title"]',
    '.title-input input'
  ];

  for (const sel of titleSelectors) {
    const count = await page.locator(sel).count();
    if (count > 0) {
      console.log(`✓ 找到标题输入框: ${sel}`);
      break;
    }
  }

  // 查找富文本编辑器
  const editorSelectors = [
    '.ql-editor',
    '.w-e-text',
    '[contenteditable="true"]',
    'textarea[placeholder*="正文"]',
    '.editor-content'
  ];

  for (const sel of editorSelectors) {
    const count = await page.locator(sel).count();
    if (count > 0) {
      console.log(`✓ 找到编辑器: ${sel} (数量: ${count})`);
    }
  }

  // 查找图片上传按钮
  const imageUploadSelectors = [
    'button:has-text("插入图片")',
    'button:has-text("上传图片")',
    'input[type="file"][accept*="image"]',
    '.image-upload',
    '[title*="图片"]'
  ];

  for (const sel of imageUploadSelectors) {
    const count = await page.locator(sel).count();
    if (count > 0) {
      console.log(`✓ 找到图片上传: ${sel}`);
    }
  }

  // 查找封面图设置
  const coverSelectors = [
    'button:has-text("封面")',
    'button:has-text("设置封面")',
    '.cover-upload',
    '[placeholder*="封面"]'
  ];

  for (const sel of coverSelectors) {
    const count = await page.locator(sel).count();
    if (count > 0) {
      console.log(`✓ 找到封面设置: ${sel}`);
    }
  }

  // 查找保存/预览按钮
  const actionSelectors = [
    'button:has-text("保存")',
    'button:has-text("预览")',
    'button:has-text("发布")'
  ];

  for (const sel of actionSelectors) {
    const count = await page.locator(sel).count();
    if (count > 0) {
      console.log(`✓ 找到操作按钮: ${sel}`);
    }
  }

  console.log('\n浏览器将保持打开 120 秒，请手动查看页面...');
  await page.waitForTimeout(120000);

  await browser.close();
})().catch(err => {
  console.error(err);
  process.exit(1);
});
