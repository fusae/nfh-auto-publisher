#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import { createBrowserSession, finalizeBrowserSession } from './lib/browser.js';
import { loadConfig, resolveUserPath } from './lib/config.js';
import { parseWordDocument } from './lib/docx-parser.js';
import { rewriteArticleWithDeepseek } from './lib/deepseek.js';
import {
  capturePreviewLongImage,
  cleanupEditorContent,
  ensureLoggedIn,
  fillTitle,
  getArticleFormValues,
  openPreview,
  openPreviewPage,
  openPublishPage,
  publishArticleBlocks,
  publishManualContent,
  saveDraft,
  saveScreenshot,
  setCoverFromImageUrls,
  setCoverFromBody,
  swapEditorImageUrlsForSave
} from './lib/nfh-client.js';

function printHelp() {
  console.log(`南方号 CLI

用法:
  node src/cli.js login
  node src/cli.js publish <docx-path> [--mode auto|assist|manual] [--keep-open]
  node src/cli.js preview [--keep-open]

环境变量:
  NFH_USERNAME
  NFH_PASSWORD
  NFH_LOGIN_URL
  NFH_PUBLISH_URL
  NFH_PREVIEW_URL
  NFH_HEADLESS
  NFH_RUNTIME_DIR
`);
}

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift();
  const options = {
    keepOpen: false,
    mode: 'auto'
  };
  const positionals = [];

  while (args.length > 0) {
    const current = args.shift();
    if (current === '--keep-open') {
      options.keepOpen = true;
      continue;
    }

    if (current === '--mode') {
      options.mode = args.shift() || options.mode;
      continue;
    }

    if (current?.startsWith('--mode=')) {
      options.mode = current.split('=')[1] || options.mode;
      continue;
    }

    if (current === '--help' || current === '-h') {
      options.help = true;
      continue;
    }

    positionals.push(current);
  }

  return { command, options, positionals };
}

function waitForEnter(message) {
  if (message) {
    console.log(message);
  }

  return new Promise(resolve => {
    process.stdin.resume();
    process.stdin.once('data', () => resolve());
  });
}

async function runLoginCommand(config, options) {
  const session = await createBrowserSession(config);
  try {
    await ensureLoggedIn(session, config);
    await saveScreenshot(session.page, config, 'login-success');
  } finally {
    await finalizeBrowserSession(session, { keepOpen: options.keepOpen || config.keepOpen });
  }
}

async function runPublishCommand(config, docPath, options) {
  const resolvedDocPath = resolveUserPath(docPath);
  const session = await createBrowserSession(config);

  try {
    const article = await parseWordDocument(resolvedDocPath, config);
  console.log(`标题: ${article.title}`);
  console.log(`正文块数: ${article.blocks.length}`);
  console.log(`图片数量: ${article.images.length}`);

    let workingArticle = article;
    if (config.deepseekEnabled && config.deepseekApiKey) {
      console.log('\n[DeepSeek 改稿]');
      try {
        const rewriteResult = await rewriteArticleWithDeepseek(article, config);
        workingArticle = rewriteResult.article;
        if (rewriteResult.used) {
          console.log(`改稿完成: ${rewriteResult.outputPath}`);
          console.log(`改后标题: ${workingArticle.title}`);
          console.log(`改后正文块数: ${workingArticle.blocks.length}`);
        }
      } catch (error) {
        console.log(`DeepSeek 改稿失败，已回退原稿: ${error.message}`);
      }
    }

    await ensureLoggedIn(session, config);
    await openPublishPage(session, config);
    await fillTitle(session.page, workingArticle.title);
    let insertedImageEntries = [];

    if (options.mode === 'auto') {
      insertedImageEntries = await publishArticleBlocks(session.page, workingArticle);
      if (workingArticle.images.length > 0) {
        const coverInjected = await setCoverFromImageUrls(session.page, insertedImageEntries);
        if (!coverInjected) {
          await setCoverFromBody(session.page);
        }
      }
    } else {
      await publishManualContent(session.page, workingArticle);
      if (workingArticle.images.length > 0) {
        console.log(`图片已导出到: ${config.imageOutputDir}`);
        console.log('正文中已插入 [图片1] 这类占位符。完成手工插图后按回车继续。');
        await waitForEnter();
        console.log('封面建议从正文选择第一张图。完成后按回车继续保存。');
        await waitForEnter();
      }
    }

    await capturePreviewLongImage(session.page, config).catch(error => {
      console.log(`预览长图生成失败: ${error.message}`);
    });

    await cleanupEditorContent(session.page);

    if (insertedImageEntries.length > 0) {
      await swapEditorImageUrlsForSave(session.page, insertedImageEntries);
    }

    const currentFormValues = await getArticleFormValues(session.page).catch(() => null);
    if (currentFormValues?.ok) {
      console.log(`当前表单字段: ${JSON.stringify(currentFormValues.values)}`);
    }

    const saveRecords = await saveDraft(session.page);
    if (saveRecords.length > 0) {
      console.log('保存请求记录:');
      for (const record of saveRecords) {
        console.log(JSON.stringify(record));
      }
    } else {
      console.log('本次未捕获到保存相关请求，可能仍被前端校验拦截。');
    }

    const previewUrl = await openPreview(session.context, session.page);
    if (previewUrl) {
      console.log(`预览链接: ${previewUrl}`);
    } else {
      console.log('未获取到预览链接，请在浏览器中手动查看。');
    }

    await saveScreenshot(session.page, config, 'publish-result');
  } catch (error) {
    await saveScreenshot(session.page, config, 'publish-error').catch(() => {});
    throw error;
  } finally {
    await finalizeBrowserSession(session, { keepOpen: options.keepOpen || config.keepOpen });
  }
}

async function runPreviewCommand(config, options) {
  const session = await createBrowserSession(config);
  try {
    await ensureLoggedIn(session, config);
    await openPreviewPage(session, config);
    await saveScreenshot(session.page, config, 'preview');
  } finally {
    await finalizeBrowserSession(session, { keepOpen: options.keepOpen || config.keepOpen });
  }
}

export async function runCli(argv = process.argv.slice(2)) {
  const { command, options, positionals } = parseArgs(argv);

  if (!command || options.help || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  const config = loadConfig();

  if (command === 'login') {
    await runLoginCommand(config, options);
    return;
  }

  if (command === 'publish') {
    const docPath = positionals[0];
    if (!docPath) {
      throw new Error('publish 命令需要传入 .docx 路径');
    }

    await runPublishCommand(config, docPath, options);
    return;
  }

  if (command === 'preview') {
    await runPreviewCommand(config, options);
    return;
  }

  if (command === 'assist') {
    const docPath = positionals[0];
    if (!docPath) {
      throw new Error('assist 命令需要传入 .docx 路径');
    }

    await runPublishCommand(config, docPath, { ...options, mode: 'assist' });
    return;
  }

  throw new Error(`未知命令: ${command}`);
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  runCli().catch(error => {
    console.error('错误:', error.message);
    process.exit(1);
  });
}
