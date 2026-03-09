import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.resolve('out');

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized']
  });

  const context = await browser.newContext({
    viewport: null
  });

  const page = await context.newPage();

  console.log('正在打开登录页面...');
  await page.goto('https://nfh.nfapp.southcn.com/backend/nfh-publishing-system/#/login');

  console.log('\n请在浏览器中完成登录');
  console.log('登录成功后，脚本会自动检测并跳转到发文页面\n');

  // 等待 URL 变化（登录成功后会跳转）
  await page.waitForURL(url => !url.href.includes('/login'), { timeout: 180000 });
  console.log('✓ 登录成功');

  await page.waitForTimeout(2000);

  // 跳转到发文页面
  console.log('正在跳转到发文页面...');
  await page.goto('https://nfh.nfapp.southcn.com/backend/nfh-publishing-system/#/content/publish');
  await page.waitForTimeout(5000);

  // 截图
  await page.screenshot({ path: path.join(OUT_DIR, 'publish-page.png'), fullPage: true });
  console.log('✓ 发文页面截图已保存: out/publish-page.png');

  // 保存 HTML
  const html = await page.content();
  fs.writeFileSync(path.join(OUT_DIR, 'publish-page.html'), html);
  console.log('✓ 页面 HTML 已保存: out/publish-page.html');

  // 分析页面元素
  console.log('\n=== 页面元素分析 ===\n');

  const elements = await page.evaluate(() => {
    const result = {
      inputs: [],
      buttons: [],
      textareas: [],
      contentEditables: []
    };

    // 查找所有输入框
    document.querySelectorAll('input').forEach(input => {
      result.inputs.push({
        type: input.type,
        placeholder: input.placeholder,
        name: input.name,
        id: input.id,
        className: input.className
      });
    });

    // 查找所有按钮
    document.querySelectorAll('button').forEach(btn => {
      result.buttons.push({
        text: btn.textContent.trim(),
        className: btn.className
      });
    });

    // 查找文本域
    document.querySelectorAll('textarea').forEach(ta => {
      result.textareas.push({
        placeholder: ta.placeholder,
        name: ta.name
      });
    });

    // 查找富文本编辑器
    document.querySelectorAll('[contenteditable="true"]').forEach(ce => {
      result.contentEditables.push({
        className: ce.className,
        tagName: ce.tagName
      });
    });

    return result;
  });

  console.log('输入框:', JSON.stringify(elements.inputs, null, 2));
  console.log('\n按钮:', JSON.stringify(elements.buttons.slice(0, 20), null, 2));
  console.log('\n富文本编辑器:', JSON.stringify(elements.contentEditables, null, 2));

  fs.writeFileSync(path.join(OUT_DIR, 'elements.json'), JSON.stringify(elements, null, 2));
  console.log('\n✓ 元素信息已保存: out/elements.json');

  console.log('\n浏览器将保持打开 60 秒，请查看页面...');
  await page.waitForTimeout(60000);

  await browser.close();
})().catch(err => {
  console.error(err);
  process.exit(1);
});
