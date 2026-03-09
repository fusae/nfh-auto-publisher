import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import Tesseract from 'tesseract.js';

const OUT_DIR = path.resolve('out');
const STATE_FILE = path.join(OUT_DIR, 'state.json');
const PUBLISH_URL = 'https://nfh.nfapp.southcn.com/backend/nfh-publishing-system/#/content/publish';

async function recognizeCaptcha(imagePath) {
  console.log('正在识别验证码...');
  const { data: { text } } = await Tesseract.recognize(imagePath, 'eng', {
    logger: m => console.log(m)
  });
  // 清理识别结果，只保留字母数字
  const cleaned = text.replace(/[^a-zA-Z0-9]/g, '');
  console.log('识别结果:', cleaned);
  return cleaned;
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  // 登录
  await page.goto('https://nfh.nfapp.southcn.com/backend/nfh-publishing-system/#/login');
  await page.waitForTimeout(3000);

  // 先截图看看登录页面
  await page.screenshot({ path: path.join(OUT_DIR, 'login-page.png'), fullPage: true });
  console.log('登录页面截图: out/login-page.png');

  // 选择账号密码登录方式（如果有切换按钮）
  const passwordTabSelectors = [
    'text=账号密码登录',
    'text=密码登录',
    'text=双重认证登录',
    '.tab:has-text("密码")',
    'button:has-text("密码登录")'
  ];

  for (const selector of passwordTabSelectors) {
    try {
      const tab = page.locator(selector).first();
      if (await tab.count() > 0) {
        await tab.click();
        console.log('已切换到账号密码登录');
        await page.waitForTimeout(1000);
        break;
      }
    } catch (e) {}
  }

  console.log('\n请在浏览器中完成登录（输入账号密码和验证码）');
  console.log('登录成功后，脚本会自动保存 cookies...\n');

  // 等待登录成功（URL 变化或特定元素出现）
  console.log('等待登录成功...');
  await page.waitForTimeout(3000);

  // 保存登录状态
  await context.storageState({ path: STATE_FILE });
  console.log('✓ 登录状态已保存: out/state.json');

  // 跳转到发文页面
  console.log('正在跳转到发文页面...');
  await page.goto(PUBLISH_URL);
  await page.waitForTimeout(3000);

  // 截图保存页面结构
  await page.screenshot({ path: path.join(OUT_DIR, 'publish-page.png'), fullPage: true });
  console.log('✓ 发文页面截图已保存: out/publish-page.png');

  // 等待手动查看页面结构
  console.log('\n浏览器将保持打开 60 秒，请查看发文页面结构...');
  await page.waitForTimeout(60000);

  await browser.close();
})().catch(err => {
  console.error(err);
  process.exit(1);
});
