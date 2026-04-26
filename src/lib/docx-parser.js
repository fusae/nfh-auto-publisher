import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import mammoth from 'mammoth';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);

function extractTitle(html) {
  const titleMatch =
    html.match(/<h1[^>]*>(.*?)<\/h1>/i) ||
    html.match(/<p[^>]*><strong>(.*?)<\/strong><\/p>/i);

  return {
    title: titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '未命名文章',
    matchedHtml: titleMatch ? titleMatch[0] : null
  };
}

function hasMeaningfulHtml(html) {
  const text = html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();

  return text.length > 0;
}

function normalizeHtml(html) {
  return html
    .replace(/<p[^>]*>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, '')
    .replace(/(?:<p>\s*<\/p>)+/gi, '')
    .trim();
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function htmlToPlainText(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function textToHtmlParagraphs(text) {
  return text
    .split(/\n{2,}/)
    .map(segment => segment.trim())
    .filter(Boolean)
    .map(segment => `<p>${escapeHtml(segment).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function buildBlocks(contentHtml, images) {
  const blocks = [];
  const placeholderRegex = /<img[^>]*src="###IMAGE_PLACEHOLDER_(\d+)###"[^>]*>/gi;
  let lastIndex = 0;
  let match;

  while ((match = placeholderRegex.exec(contentHtml)) !== null) {
    const segment = contentHtml.slice(lastIndex, match.index);
    const normalizedSegment = normalizeHtml(segment);
    if (hasMeaningfulHtml(normalizedSegment)) {
      blocks.push({ type: 'html', html: normalizedSegment });
    }

    const imageIndex = Number(match[1]);
    if (images[imageIndex]) {
      blocks.push({
        type: 'image',
        imageIndex,
        localPath: images[imageIndex]
      });
    }

    lastIndex = match.index + match[0].length;
  }

  const tail = contentHtml.slice(lastIndex);
  const normalizedTail = normalizeHtml(tail);
  if (hasMeaningfulHtml(normalizedTail)) {
    blocks.push({ type: 'html', html: normalizedTail });
  }

  return blocks;
}

function sanitizePathSegment(name) {
  return String(name || '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'untitled';
}

async function resolveWordSource(docPath, config) {
  const extension = path.extname(docPath).toLowerCase();
  if (extension === '.docx') {
    return { workingPath: docPath, cleanup: async () => {} };
  }

  if (extension !== '.doc') {
    throw new Error(`仅支持 .docx 或 .doc 文件: ${docPath}`);
  }

  const tempDir = fs.mkdtempSync(path.join(config.runtimeDir || os.tmpdir(), 'doc-convert-'));
  const outputPath = path.join(tempDir, `${path.basename(docPath, extension)}.docx`);

  try {
    await execFileAsync('/usr/bin/textutil', ['-convert', 'docx', docPath, '-output', outputPath]);
  } catch (error) {
    throw new Error(`.doc 转 .docx 失败: ${error.message}`);
  }

  if (!fs.existsSync(outputPath)) {
    throw new Error(`.doc 转换后未生成 docx 文件: ${outputPath}`);
  }

  return {
    workingPath: outputPath,
    cleanup: async () => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  };
}

export async function parseWordDocument(docPath, config) {
  const resolvedPath = path.resolve(docPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`文档不存在: ${resolvedPath}`);
  }

  const { workingPath, cleanup } = await resolveWordSource(resolvedPath, config);

  try {
    const articleFolderName = sanitizePathSegment(path.basename(resolvedPath, path.extname(resolvedPath)));
    const articleImageDir = path.join(config.imageOutputDir, articleFolderName);
    fs.mkdirSync(articleImageDir, { recursive: true });

    const images = [];
    const result = await mammoth.convertToHtml(
      { path: workingPath },
      {
        convertImage: mammoth.images.imgElement(async image => {
          const buffer = await image.read();
          const imageIndex = images.length;
          const imagePath = path.join(articleImageDir, `image-${imageIndex}.png`);
          await sharp(buffer).png().toFile(imagePath);
          images.push(imagePath);
          return { src: `###IMAGE_PLACEHOLDER_${imageIndex}###` };
        })
      }
    );

    const { title, matchedHtml } = extractTitle(result.value);
    const contentHtml = normalizeHtml(matchedHtml ? result.value.replace(matchedHtml, '') : result.value);
    const manualHtml = contentHtml.replace(
      /<img[^>]*src="###IMAGE_PLACEHOLDER_(\d+)###"[^>]*>/gi,
      (_fullMatch, imageIndex) => `<p><strong>[图片${Number(imageIndex) + 1}]</strong></p>`
    );

    return {
      sourcePath: resolvedPath,
      imageDir: articleImageDir,
      title,
      contentHtml,
      manualHtml,
      images,
      blocks: buildBlocks(contentHtml, images)
    };
  } finally {
    await cleanup();
  }
}

export function buildArticleRewriteSource(article) {
  const segments = [];

  for (const block of article.blocks) {
    if (block.type === 'image') {
      segments.push(`[图片${block.imageIndex + 1}]`);
      continue;
    }

    const text = htmlToPlainText(block.html || '');
    if (text) {
      segments.push(text);
    }
  }

  return `标题：${article.title}\n\n正文：\n${segments.join('\n\n')}`.trim();
}

export function buildArticleFromRewrite(article, rewrittenText) {
  const normalized = String(rewrittenText || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    throw new Error('DeepSeek 返回为空');
  }

  const titleMatch = normalized.match(/^\s*标题[:：]\s*(.+)$/m);
  const title = (titleMatch?.[1] || article.title || '未命名文章').trim();

  let bodyText = normalized;
  const bodyMatch = normalized.match(/正文[:：]\s*([\s\S]*)$/m);
  if (bodyMatch?.[1]) {
    bodyText = bodyMatch[1].trim();
  } else if (titleMatch) {
    bodyText = normalized.replace(titleMatch[0], '').trim();
  }

  const images = article.images;
  const blocks = [];
  const placeholderRegex = /\[图片(\d+)\]/g;
  let lastIndex = 0;
  let match;

  while ((match = placeholderRegex.exec(bodyText)) !== null) {
    const segment = bodyText.slice(lastIndex, match.index).trim();
    if (segment) {
      blocks.push({ type: 'html', html: textToHtmlParagraphs(segment) });
    }

    const imageIndex = Number(match[1]) - 1;
    if (images[imageIndex]) {
      blocks.push({
        type: 'image',
        imageIndex,
        localPath: images[imageIndex]
      });
    }

    lastIndex = match.index + match[0].length;
  }

  const tail = bodyText.slice(lastIndex).trim();
  if (tail) {
    blocks.push({ type: 'html', html: textToHtmlParagraphs(tail) });
  }

  if (blocks.length === 0) {
    throw new Error('DeepSeek 返回内容无法解析为正文');
  }

  return {
    ...article,
    title,
    blocks
  };
}
