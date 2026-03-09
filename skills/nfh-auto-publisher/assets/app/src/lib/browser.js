import fs from 'node:fs';
import { chromium } from 'playwright';

export async function createBrowserSession(config) {
  const browser = await chromium.launch({
    headless: config.headless,
    args: config.headless ? [] : ['--start-maximized']
  });

  const contextOptions = {
    viewport: config.headless ? { width: 1440, height: 900 } : null
  };

  if (fs.existsSync(config.stateFile)) {
    contextOptions.storageState = config.stateFile;
  }

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  page.setDefaultTimeout(config.actionTimeoutMs);
  page.setDefaultNavigationTimeout(config.navigationTimeoutMs);

  return { browser, context, page };
}

export async function finalizeBrowserSession(session, options = {}) {
  if (options.keepOpen) {
    console.log('浏览器保持打开，按 Ctrl+C 退出。');
    await new Promise(() => {});
  }

  await session.browser.close();
}
