import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // 使用已保存的登录状态（如果有）
  await page.goto('https://nfh.nfapp.southcn.com/backend/nfh-publishing-system/#/content/publish');
  await page.waitForTimeout(5000);

  // 探索 UEditor API
  const editorInfo = await page.evaluate(() => {
    const results = {
      hasUE: typeof UE !== 'undefined',
      hasWindow: typeof window !== 'undefined',
      editorInstances: [],
      availableMethods: []
    };

    // 查找 UEditor 实例
    if (typeof UE !== 'undefined' && UE.instants) {
      results.editorInstances = Object.keys(UE.instants);
    }

    // 尝试获取编辑器实例
    const iframe = document.querySelector('iframe[id*="ueditor"]');
    if (iframe && iframe.id) {
      const editorId = iframe.id.replace('_iframe', '');
      if (typeof UE !== 'undefined' && UE.getEditor) {
        const editor = UE.getEditor(editorId);
        if (editor) {
          // 列出可用的方法
          results.availableMethods = Object.keys(editor).filter(key =>
            typeof editor[key] === 'function' && key.includes('image')
          );

          // 检查特定方法
          results.hasExecCommand = typeof editor.execCommand === 'function';
          results.hasInsertHtml = typeof editor.insertHtml === 'function';
          results.hasGetContent = typeof editor.getContent === 'function';
          results.hasSetContent = typeof editor.setContent === 'function';
        }
      }
    }

    return results;
  });

  console.log('UEditor 信息：');
  console.log(JSON.stringify(editorInfo, null, 2));

  await page.waitForTimeout(60000);
  await browser.close();
})();
