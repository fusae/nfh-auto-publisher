import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import Tesseract from 'tesseract.js';

const ACCOUNT_TAB_TEXTS = ['账号密码登录', '取号密码登录', '密码登录'];
const ACCOUNT_SELECTORS = [
  'input[placeholder*="账号"]',
  'input[placeholder*="邮箱"]',
  'input[type="text"]',
  '.ant-input'
];
const PASSWORD_SELECTORS = [
  'input[placeholder*="密码"]',
  'input[type="password"]'
];
const CAPTCHA_INPUT_SELECTORS = [
  '#code',
  'input[placeholder*="验证码"]',
  'input[placeholder*="驗證碼"]',
  'input[maxlength="4"]',
  'input[maxlength="5"]'
];
const CAPTCHA_IMAGE_SELECTORS = [
  '.verify-code-image',
  'img[src*="captcha"]',
  'img[src*="verify"]',
  'img[alt*="验证码"]',
  '.code img',
  '.captcha img',
  'canvas'
];
const LOGIN_BUTTON_SELECTORS = [
  'button:has-text("登录")',
  'button:has-text("登 录")',
  '.ant-btn-primary'
];

function logStep(step) {
  console.log(`\n[${step}]`);
}

async function preprocessCaptchaVariants(inputPath, outputDir) {
  const processedPaths = [
    path.join(outputDir, 'captcha-processed-1.png'),
    path.join(outputDir, 'captcha-processed-2.png')
  ];

  await sharp(inputPath)
    .grayscale()
    .normalize()
    .resize({ width: 240, withoutEnlargement: false })
    .threshold(150)
    .toFile(processedPaths[0]);

  await sharp(inputPath)
    .grayscale()
    .normalize()
    .resize({ width: 320, withoutEnlargement: false })
    .sharpen()
    .threshold(130)
    .toFile(processedPaths[1]);

  return [inputPath, ...processedPaths];
}

async function recognizeCaptcha(imagePaths) {
  const candidates = [];

  for (const imagePath of imagePaths) {
    const {
      data: { text }
    } = await Tesseract.recognize(imagePath, 'eng', {
      logger: () => {}
    });

    const cleaned = text.replace(/[^a-zA-Z0-9]/g, '').slice(0, 5);
    if (cleaned) {
      candidates.push(cleaned);
    }
  }

  candidates.sort((left, right) => right.length - left.length);
  return candidates[0] || '';
}

async function clickFirstVisible(page, selectors) {
  for (const selector of selectors) {
    try {
      const locator = page.locator(selector).first();
      if (await locator.count()) {
        await locator.waitFor({ state: 'visible', timeout: 3000 });
        await locator.click();
        return true;
      }
    } catch {}
  }

  return false;
}

async function fillFirstVisible(page, selectors, value) {
  for (const selector of selectors) {
    try {
      const locator = page.locator(selector).first();
      if (await locator.count()) {
        await locator.waitFor({ state: 'visible', timeout: 3000 });
        await locator.fill(value);
        return true;
      }
    } catch {}
  }

  return false;
}

async function screenshotFirstVisible(page, selectors, filePath) {
  for (const selector of selectors) {
    try {
      const locator = page.locator(selector).first();
      if (await locator.count()) {
        await locator.waitFor({ state: 'visible', timeout: 3000 });
        await locator.screenshot({ path: filePath });
        return true;
      }
    } catch {}
  }

  return false;
}

async function getFirstVisibleLocator(page, selectors, timeout = 3000) {
  for (const selector of selectors) {
    try {
      const locator = page.locator(selector).first();
      await locator.waitFor({ state: 'visible', timeout });
      return locator;
    } catch {}
  }

  return null;
}

async function switchToPasswordLogin(page) {
  await page.evaluate(texts => {
    const spans = Array.from(document.querySelectorAll('span, button, div'));
    for (const text of texts) {
      const target = spans.find(node => node.textContent?.trim() === text);
      if (target) {
        target.click();
        return true;
      }
    }
    return false;
  }, ACCOUNT_TAB_TEXTS);
}

async function solveCaptchaAndLogin(page, config) {
  const captchaImagePath = path.join(config.runtimeDir, 'captcha.png');
  console.log('开始自动识别图形验证码。');

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const captchaInput = await getFirstVisibleLocator(page, CAPTCHA_INPUT_SELECTORS, 8000);
    const captchaImage = await getFirstVisibleLocator(page, CAPTCHA_IMAGE_SELECTORS, 8000);

    if (!captchaInput || !captchaImage) {
      console.log('未找到图形验证码输入框或验证码图片。');
      return false;
    }

    await captchaInput.fill('');
    await captchaImage.screenshot({ path: captchaImagePath });
    const imagePaths = await preprocessCaptchaVariants(captchaImagePath, config.runtimeDir);
    const captchaText = await recognizeCaptcha(imagePaths);

    if (captchaText.length < 4) {
      console.log(`验证码识别失败，第 ${attempt} 次尝试，刷新验证码后重试。`);
      await captchaImage.click();
      await page.waitForTimeout(1000);
      continue;
    }

    await captchaInput.fill(captchaText);

    console.log(`已自动识别验证码，第 ${attempt} 次尝试: ${captchaText}`);
    const clicked = await clickFirstVisible(page, LOGIN_BUTTON_SELECTORS);
    if (!clicked) {
      return false;
    }

    const loggedIn = await page
      .waitForURL(url => !url.href.includes('/login'), { timeout: 8000 })
      .then(() => true)
      .catch(() => false);

    if (loggedIn) {
      return true;
    }

    console.log(`验证码提交未通过，第 ${attempt} 次尝试，刷新验证码后重试。`);
    await captchaImage.click();
    await page.waitForTimeout(1000);
  }

  return false;
}

async function isPublishPageReady(page) {
  if (page.url().includes('/login')) {
    return false;
  }

  try {
    await page.locator('#ueditor-header-title').first().waitFor({ state: 'visible', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function waitForEditor(page) {
  await page.locator('#ueditor-header-title').first().waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForFunction(
    () => {
      if (typeof UE === 'undefined' || !UE.instants) {
        return false;
      }

      const editors = Object.values(UE.instants);
      const editor = editors.find(item => {
        const iframe = item?.iframe;
        const rect = iframe?.getBoundingClientRect?.();
        return Boolean(
          iframe &&
          iframe.contentDocument &&
          iframe.contentDocument.body &&
          rect &&
          rect.width > 100 &&
          rect.height > 100
        );
      });

      return Boolean(
        editor &&
        editor.isReady
      );
    },
    undefined,
    { timeout: 30000 }
  );
}

async function withEditor(page, operation, payload) {
  return page.evaluate(
    ({ op, data }) => {
      const getActiveEditor = () => {
        if (typeof UE === 'undefined' || !UE.instants) {
          return null;
        }

        const editors = Object.values(UE.instants);
        return (
          editors.find(item => {
            const iframe = item?.iframe;
            const rect = iframe?.getBoundingClientRect?.();
            return Boolean(
              iframe &&
              iframe.contentDocument &&
              iframe.contentDocument.body &&
              rect &&
              rect.width > 100 &&
              rect.height > 100
            );
          }) || null
        );
      };

      const runWhenReady = (editor, body, fn) =>
        new Promise(resolve => {
          const execute = () => {
            try {
              resolve(fn());
            } catch (error) {
              resolve({ ok: false, error: error.message });
            }
          };

          if (editor && editor.isReady) {
            execute();
            return;
          }

          if (editor && typeof editor.ready === 'function') {
            editor.ready(() => execute());
            return;
          }

          execute();
        });

      const editor = getActiveEditor();
      const iframe = editor?.iframe || null;
      if (!iframe || !iframe.contentDocument) {
        return { ok: false, error: 'UEditor iframe 未找到' };
      }

      const body = iframe.contentDocument.body;

      if (!body) {
        return { ok: false, error: '编辑器 body 未就绪' };
      }

      if (op === 'set-content') {
        return runWhenReady(editor, body, () => {
          try {
            if (editor && typeof editor.focus === 'function') {
              editor.focus(true);
            }
            if (editor && typeof editor.setContent === 'function') {
              editor.setContent(data.html || '');
            } else {
              body.innerHTML = data.html || '';
            }
          } catch {
            body.innerHTML = data.html || '';
          }
          return { ok: true };
        });
      }

      if (op === 'insert-html') {
        return runWhenReady(editor, body, () => {
          try {
            if (editor && typeof editor.focus === 'function') {
              editor.focus(true);
            }
            if (editor && typeof editor.execCommand === 'function') {
              editor.execCommand('inserthtml', data.html || '');
            } else {
              body.insertAdjacentHTML('beforeend', data.html || '');
            }
          } catch {
            body.insertAdjacentHTML('beforeend', data.html || '');
          }
          return { ok: true };
        });
      }

      return { ok: false, error: `未知操作: ${op}` };
    },
    { op: operation, data: payload }
  );
}

export async function saveScreenshot(page, config, name) {
  const filePath = path.join(config.screenshotsDir, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  console.log(`截图已保存: ${filePath}`);
}

export async function ensureLoggedIn(session, config) {
  const { page, context } = session;

  logStep('登录检查');
  await page.goto(config.publishUrl, { waitUntil: 'domcontentloaded' });

  if (await isPublishPageReady(page)) {
    console.log('已使用现有登录态进入发文页面。');
    return;
  }

  await page.goto(config.loginUrl, { waitUntil: 'domcontentloaded' });
  await switchToPasswordLogin(page);

  if (config.username && config.password) {
    const accountFilled = await fillFirstVisible(page, ACCOUNT_SELECTORS, config.username);
    const passwordFilled = await fillFirstVisible(page, PASSWORD_SELECTORS, config.password);

    if (accountFilled && passwordFilled) {
      const autoLoggedIn = await solveCaptchaAndLogin(page, config).catch(() => false);
      if (autoLoggedIn) {
        console.log('已自动识别验证码并完成登录。');
      } else {
        console.log('已填充账号密码，请完成验证码并登录。');
      }
    } else {
      console.log('未能完整定位账号或密码输入框，请手动登录。');
    }
  } else {
    console.log('未提供 NFH_USERNAME/NFH_PASSWORD，请手动登录。');
  }

  await page.waitForURL(url => !url.href.includes('/login'), { timeout: config.loginTimeoutMs });
  await context.storageState({ path: config.stateFile });
  console.log(`登录状态已保存: ${config.stateFile}`);

  await page.goto(config.publishUrl, { waitUntil: 'domcontentloaded' });
  if (!(await isPublishPageReady(page))) {
    throw new Error('登录后未能进入发文页面，请检查后台地址或页面结构。');
  }
}

export async function openPublishPage(session, config) {
  const { page } = session;
  logStep('打开发布页');
  await page.goto(config.publishUrl, { waitUntil: 'domcontentloaded' });
  await waitForEditor(page);
}

export async function fillTitle(page, title) {
  logStep('填写标题');
  await page.locator('#ueditor-header-title').first().fill(title);
}

export async function setEditorContent(page, html) {
  const result = await withEditor(page, 'set-content', { html });
  if (!result.ok) {
    throw new Error(result.error);
  }
}

export async function insertHtmlBlock(page, html) {
  const result = await withEditor(page, 'insert-html', { html });
  if (!result.ok) {
    throw new Error(result.error);
  }
}

export async function insertImageBlock(page, imageUrl) {
  const result = await page.evaluate(async url => {
    const getActiveEditor = () => {
      if (typeof UE === 'undefined' || !UE.instants) {
        return null;
      }

      return (
        Object.values(UE.instants).find(item => {
          const rect = item?.iframe?.getBoundingClientRect?.();
          return Boolean(
            item?.iframe &&
            rect &&
            rect.width > 100 &&
            rect.height > 100
          );
        }) || null
      );
    };

    const editor = getActiveEditor();
    if (!editor) {
      return { ok: false, error: '未找到可用编辑器实例' };
    }

    await new Promise(resolve => {
      if (editor.isReady) {
        resolve();
        return;
      }

      if (typeof editor.ready === 'function') {
        editor.ready(() => resolve());
        return;
      }

      resolve();
    });

    const body = editor?.iframe?.contentDocument?.body;
    if (!body) {
      return { ok: false, error: '编辑器 body 未就绪' };
    }

    const paragraph = body.ownerDocument.createElement('p');
    const image = body.ownerDocument.createElement('img');
    image.setAttribute('src', url);
    image.setAttribute('_src', url);
    image.setAttribute('alt', '');
    image.setAttribute('title', '');
    paragraph.appendChild(image);
    body.appendChild(paragraph);

    return { ok: true };
  }, imageUrl);

  if (!result.ok) {
    throw new Error(result.error);
  }
}

export async function uploadImage(page, imagePath) {
  const stats = fs.statSync(imagePath);
  const fileSizeMb = stats.size / (1024 * 1024);
  if (fileSizeMb > 5) {
    throw new Error(`图片超过 5MB: ${path.basename(imagePath)} (${fileSizeMb.toFixed(2)}MB)`);
  }

  const imageBuffer = fs.readFileSync(imagePath);
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width || 1280;
  const height = metadata.height || 720;

  const authToken = await page.evaluate(() => {
    const directToken = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (directToken) {
      return directToken;
    }

    const appState = localStorage.getItem('nfhPublishingSystem');
    if (!appState) {
      return null;
    }

    try {
      const parsed = JSON.parse(appState);
      return parsed?.auth || parsed?.accountInfo?.authorization || null;
    } catch {
      return null;
    }
  });
  if (!authToken) {
    throw new Error('未找到上传所需的 authorization token');
  }

  const uploadResult = await page.evaluate(
    async ({ imageBase64, width: imageWidth, height: imageHeight, token }) => {
      try {
        const binary = atob(imageBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
          bytes[i] = binary.charCodeAt(i);
        }

        const blob = new Blob([bytes], { type: 'image/png' });
        const formData = new FormData();
        formData.append('file', blob, 'image.png');
        formData.append('width', String(imageWidth));
        formData.append('height', String(imageHeight));
        formData.append('collection', '-1');

        const response = await fetch('https://wemedia.nfnews.com/img/addImage', {
          method: 'POST',
          headers: {
            authorization: token
          },
          body: formData
        });

        const data = await response.json().catch(() => null);
        if (!response.ok) {
          return {
            ok: false,
            error: `HTTP ${response.status}`,
            data
          };
        }

        return { ok: true, data };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    },
    {
      imageBase64: imageBuffer.toString('base64'),
      width,
      height,
      token: authToken
    }
  );

  if (!uploadResult.ok) {
    throw new Error(uploadResult.error || '图片上传失败');
  }

  const imageUrl =
    uploadResult.data?.url ||
    uploadResult.data?.data?.url ||
    uploadResult.data?.data?.sourceUrl ||
    uploadResult.data?.data?.src;
  const imageId =
    uploadResult.data?.id ||
    uploadResult.data?.data?.id ||
    null;

  if (!imageUrl) {
    throw new Error('上传成功但未返回图片 URL');
  }

  const imageListResult = await page.evaluate(async ({ token, imageId: materialId }) => {
    if (!materialId) {
      return null;
    }

    try {
      const response = await fetch('https://wemedia.nfnews.com/img/listPage/-1/1/20', {
        headers: {
          authorization: token
        }
      });
      const data = await response.json();
      const matched = data?.data?.list?.find(item => item.id === materialId);
      return matched || null;
    } catch {
      return null;
    }
  }, { token: authToken, imageId });

  return {
    materialId: imageId,
    saveUrl: imageUrl,
    renderUrl: imageListResult?.showUrl || imageUrl
  };
}

export async function publishArticleBlocks(page, article) {
  logStep('写入正文');
  await setEditorContent(page, '');
  const imageEntries = [];

  for (const block of article.blocks) {
    if (block.type === 'html') {
      await insertHtmlBlock(page, block.html);
      continue;
    }

    if (block.type === 'image') {
      const uploadedImage = await uploadImage(page, block.localPath);
      await insertImageBlock(page, uploadedImage.renderUrl);
      imageEntries.push(uploadedImage);
      console.log(`已插入图片 ${block.imageIndex + 1}/${article.images.length}`);
    }
  }

  return imageEntries;
}

export async function publishManualContent(page, article) {
  logStep('写入正文');
  await setEditorContent(page, article.manualHtml);
}

async function readEditorSnapshot(page) {
  return page.evaluate(() => {
    const getActiveEditor = () => {
      if (typeof UE === 'undefined' || !UE.instants) {
        return null;
      }

      return (
        Object.values(UE.instants).find(item => {
          const iframe = item?.iframe;
          const rect = iframe?.getBoundingClientRect?.();
          return Boolean(
            iframe &&
            iframe.contentDocument &&
            iframe.contentDocument.body &&
            rect &&
            rect.width > 100 &&
            rect.height > 100
          );
        }) || null
      );
    };

    const editor = getActiveEditor();
    const title = document.querySelector('#ueditor-header-title')?.value?.trim() || '';
    const html = editor?.iframe?.contentDocument?.body?.innerHTML || '';
    return { title, html };
  });
}

function buildRequestCapture() {
  const records = [];

  return {
    records,
    onRequest(request) {
      const url = request.url();
      if (!/\/post\/savePost|\/post\/mobilePreview|\/img\/cutImage/.test(url)) {
        return;
      }

      records.push({
        type: 'request',
        method: request.method(),
        url,
        postData: request.postData() || null
      });
    },
    async onResponse(response) {
      const url = response.url();
      if (!/\/post\/savePost|\/post\/mobilePreview|\/img\/cutImage/.test(url)) {
        return;
      }

      let body = null;
      try {
        body = await response.text();
      } catch {}

      records.push({
        type: 'response',
        status: response.status(),
        url,
        body
      });
    }
  };
}

export async function getArticleFormValues(page) {
  return page.evaluate(() => {
    const getForm = () => {
      const formElement =
        document.querySelector('form.art__form') ||
        document.querySelector('form');

      if (!formElement) {
        return null;
      }

      const fiberKey = Object.keys(formElement).find(
        key => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')
      );

      let fiber = fiberKey ? formElement[fiberKey] : null;
      while (fiber) {
        const candidate =
          fiber.memoizedProps?.form ||
          fiber.stateNode?.props?.form ||
          fiber.return?.memoizedProps?.form ||
          null;

        if (candidate && typeof candidate.getFieldsValue === 'function') {
          return candidate;
        }

        fiber = fiber.return;
      }

      return null;
    };

    const form = getForm();
    if (!form) {
      return { ok: false, error: '未找到文章表单实例' };
    }

    return {
      ok: true,
      values: form.getFieldsValue()
    };
  });
}

export async function setCoverFromImageUrls(page, imageEntries) {
  const firstImage = imageEntries.find(item => item?.saveUrl || item?.renderUrl);
  const firstImageUrl = firstImage?.saveUrl || firstImage?.renderUrl || '';
  if (!firstImageUrl) {
    console.log('未找到可用正文图片 URL，跳过封面设置。');
    return false;
  }

  logStep('设置封面');
  const result = await page.evaluate(url => {
    const getForm = () => {
      const formElement =
        document.querySelector('form.art__form') ||
        document.querySelector('form');

      if (!formElement) {
        return null;
      }

      const fiberKey = Object.keys(formElement).find(
        key => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')
      );

      let fiber = fiberKey ? formElement[fiberKey] : null;
      while (fiber) {
        const candidate =
          fiber.memoizedProps?.form ||
          fiber.stateNode?.props?.form ||
          fiber.return?.memoizedProps?.form ||
          null;

        if (candidate && typeof candidate.setFieldsValue === 'function') {
          return candidate;
        }

        fiber = fiber.return;
      }

      return null;
    };

    const form = getForm();
    if (!form) {
      return { ok: false, error: '未找到文章表单实例' };
    }

    form.setFieldsValue({
      coverList: {
        cover: url,
        midCover: url
      }
    });

    return {
      ok: true,
      values: form.getFieldsValue()
    };
  }, firstImageUrl);

  if (!result.ok) {
    console.log(`封面表单注入失败: ${result.error}`);
    return false;
  }

  console.log(`封面字段已注入: ${JSON.stringify(result.values.coverList || {})}`);
  return true;
}

export async function swapEditorImageUrlsForSave(page, imageEntries) {
  const replacements = imageEntries
    .filter(item => item?.renderUrl && item?.saveUrl && item.renderUrl !== item.saveUrl)
    .map(item => ({
      from: item.renderUrl,
      to: item.saveUrl
    }));

  if (replacements.length === 0) {
    return;
  }

  await page.evaluate(entries => {
    const getActiveEditor = () => {
      if (typeof UE === 'undefined' || !UE.instants) {
        return null;
      }

      return (
        Object.values(UE.instants).find(item => {
          const iframe = item?.iframe;
          const rect = iframe?.getBoundingClientRect?.();
          return Boolean(
            iframe &&
            iframe.contentDocument &&
            iframe.contentDocument.body &&
            rect &&
            rect.width > 100 &&
            rect.height > 100
          );
        }) || null
      );
    };

    const editor = getActiveEditor();
    const body = editor?.iframe?.contentDocument?.body;
    if (!body) {
      return;
    }

    const images = Array.from(body.querySelectorAll('img'));
    for (const image of images) {
      const matched = entries.find(item => image.src === item.from || image.getAttribute('src') === item.from);
      if (!matched) {
        continue;
      }

      image.setAttribute('src', matched.to);
      image.setAttribute('_src', matched.to);
    }
  }, replacements);
}

export async function cleanupEditorContent(page) {
  await page.evaluate(() => {
    const getActiveEditor = () => {
      if (typeof UE === 'undefined' || !UE.instants) {
        return null;
      }

      return (
        Object.values(UE.instants).find(item => {
          const iframe = item?.iframe;
          const rect = iframe?.getBoundingClientRect?.();
          return Boolean(
            iframe &&
            iframe.contentDocument &&
            iframe.contentDocument.body &&
            rect &&
            rect.width > 100 &&
            rect.height > 100
          );
        }) || null
      );
    };

    const editor = getActiveEditor();
    const body = editor?.iframe?.contentDocument?.body;
    if (!body) {
      return;
    }

    for (const paragraph of Array.from(body.querySelectorAll('p'))) {
      const hasImage = paragraph.querySelector('img');
      if (hasImage) {
        continue;
      }

      const html = (paragraph.innerHTML || '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/<br\s*\/?>/gi, '')
        .trim();
      const text = (paragraph.textContent || '').replace(/\u00a0/g, ' ').trim();

      if (!html && !text) {
        paragraph.remove();
      }
    }
  });
}

export async function capturePreviewLongImage(page, config) {
  logStep('生成预览长图');
  const snapshot = await readEditorSnapshot(page);
  if (!snapshot.html) {
    throw new Error('未读取到正文 HTML，无法生成预览长图');
  }

  const previewPage = await page.context().newPage();
  const outputPath = path.join(config.screenshotsDir, 'preview-long.png');

  try {
    await previewPage.setViewportSize({ width: 900, height: 1200 });
    await previewPage.setContent(
      `<!DOCTYPE html>
      <html lang="zh-CN">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>文章预览</title>
          <style>
            :root {
              color-scheme: light;
            }
            * {
              box-sizing: border-box;
            }
            body {
              margin: 0;
              background: #eef1f5;
              color: #222;
              font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
            }
            .page {
              width: 100%;
              padding: 32px 0 48px;
            }
            .article {
              width: 760px;
              margin: 0 auto;
              padding: 40px 56px 56px;
              background: #fff;
              box-shadow: 0 12px 36px rgba(16, 24, 40, 0.08);
            }
            h1 {
              margin: 0 0 28px;
              font-size: 38px;
              line-height: 1.3;
              font-weight: 700;
            }
            .content {
              font-size: 18px;
              line-height: 1.85;
            }
            .content p {
              margin: 0 0 1.2em;
            }
            .content img {
              display: block;
              width: 100%;
              max-width: 100%;
              height: auto;
              margin: 1.2em 0;
              border-radius: 4px;
            }
            .content h2,
            .content h3,
            .content h4 {
              margin: 1.6em 0 0.8em;
              line-height: 1.4;
            }
            .content ul,
            .content ol {
              padding-left: 1.4em;
            }
            .content blockquote {
              margin: 1.4em 0;
              padding-left: 1em;
              color: #555;
              border-left: 4px solid #d0d7de;
            }
          </style>
        </head>
        <body>
          <div class="page">
            <article class="article">
              <h1></h1>
              <div class="content"></div>
            </article>
          </div>
        </body>
      </html>`,
      { waitUntil: 'load' }
    );

    await previewPage.locator('h1').evaluate((node, text) => {
      node.textContent = text;
    }, snapshot.title);
    await previewPage.locator('.content').evaluate((node, html) => {
      node.innerHTML = html;
    }, snapshot.html);

    await previewPage.evaluate(async () => {
      const images = Array.from(document.images);
      await Promise.all(
        images.map(
          image =>
            new Promise(resolve => {
              if (image.complete) {
                resolve();
                return;
              }

              const done = () => resolve();
              image.addEventListener('load', done, { once: true });
              image.addEventListener('error', done, { once: true });
              setTimeout(done, 5000);
            })
        )
      );
    });

    await previewPage.screenshot({ path: outputPath, fullPage: true });
    console.log(`预览长图已保存: ${outputPath}`);
    return outputPath;
  } finally {
    await previewPage.close();
  }
}

export async function setCoverFromBody(page) {
  logStep('设置封面');
  const clicked = await clickFirstVisible(page, ['button:has-text("从正文选择")']);
  if (!clicked) {
    console.log('未找到“从正文选择”按钮，跳过封面设置。');
    return;
  }

  const modalImages = page.locator('.ant-modal img, .modal img');
  try {
    await modalImages.first().waitFor({ state: 'visible', timeout: 8000 });
    const firstCheckbox = page.locator('.ant-modal .ant-checkbox-input, .modal .ant-checkbox-input').first();
    if (await firstCheckbox.count()) {
      await page.locator('.ant-modal .ant-checkbox-wrapper, .modal .ant-checkbox-wrapper').first().click({ force: true });
    } else {
      await modalImages.first().click();
    }

    const selectedConfirmed = await clickFirstVisible(page, [
      '.ant-modal button:has-text("确定")',
      '.ant-modal button:has-text("确认")',
      '.modal button:has-text("确定")',
      '.ant-modal .ant-btn-primary',
      '.modal .ant-btn-primary',
      '.ant-modal-footer .ant-btn-primary',
      '.modal-footer .ant-btn-primary'
    ]);

    if (!selectedConfirmed) {
      throw new Error('封面选择第一步确认失败');
    }

    const cropModalVisible = await page
      .locator('.ant-modal .ant-modal-title, .modal .ant-modal-title')
      .filter({ hasText: '裁剪封面' })
      .first()
      .isVisible()
      .catch(() => false);

    if (cropModalVisible) {
      const cropConfirmed = await clickFirstVisible(page, [
        '.ant-modal button:has-text("确定")',
        '.modal button:has-text("确定")',
        '.ant-modal .ant-btn-primary',
        '.modal .ant-btn-primary'
      ]);

      if (!cropConfirmed) {
        throw new Error('封面裁剪确认失败');
      }
    }

    await page.locator('.ant-modal, .modal').first().waitFor({ state: 'hidden', timeout: 8000 }).catch(() => null);
    const coverReady = await page.waitForFunction(
      () => {
        const container = document.querySelector('.cover-img');
        return Boolean(container && container.querySelector('img'));
      },
      undefined,
      { timeout: 8000 }
    ).then(() => true).catch(() => false);

    if (!coverReady) {
      throw new Error('封面区域未出现图片');
    }

    console.log('封面图已设置。');
  } catch {
    console.log('封面选择弹窗中未找到可用图片，已跳过。');
    await clickFirstVisible(page, ['.ant-modal-close', '.ant-modal button:has-text("取消")']);
  }
}

export async function saveDraft(page) {
  logStep('保存草稿');
  const capture = buildRequestCapture();
  page.on('request', capture.onRequest);
  page.on('response', capture.onResponse);

  const modalVisible = await page.locator('.ant-modal, .modal').first().isVisible().catch(() => false);
  if (modalVisible) {
    await clickFirstVisible(page, ['.ant-modal-close', '.ant-modal button:has-text("取消")', '.modal button:has-text("取消")']);
  }

  try {
    const clicked = await clickFirstVisible(page, ['button:has-text("保 存")', 'button:has-text("保存")']);
    if (!clicked) {
      throw new Error('未找到保存按钮');
    }

    await page.waitForTimeout(4000);
    return capture.records;
  } finally {
    page.off('request', capture.onRequest);
    page.off('response', capture.onResponse);
  }
}

export async function openPreview(context, page) {
  logStep('获取预览链接');
  const [previewPage] = await Promise.all([
    context.waitForEvent('page', { timeout: 5000 }).catch(() => null),
    clickFirstVisible(page, ['button:has-text("预 览")', 'button:has-text("预览")'])
  ]);

  if (previewPage) {
    await previewPage.waitForLoadState('load');
    return previewPage.url();
  }

  const inlinePreviewOpened = await page.waitForFunction(
    () => {
      const preview = document.querySelector('.ArticlePreview');
      return Boolean(preview && !preview.classList.contains('nfh-hidden'));
    },
    undefined,
    { timeout: 5000 }
  ).then(() => true).catch(() => false);

  if (inlinePreviewOpened) {
    return 'inline-preview-opened';
  }

  return page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a'));
    const link = links.find(item => item.href && (item.href.includes('preview') || item.href.includes('article')));
    return link ? link.href : null;
  });
}

export async function openPreviewPage(session, config) {
  const { page } = session;
  logStep('打开预览页');
  await page.goto(config.previewUrl, { waitUntil: 'domcontentloaded' });
}
