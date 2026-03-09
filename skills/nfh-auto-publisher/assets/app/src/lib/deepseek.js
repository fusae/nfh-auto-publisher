import fs from 'node:fs';
import path from 'node:path';
import { buildArticleFromRewrite, buildArticleRewriteSource } from './docx-parser.js';

function getChatContent(data) {
  return data?.choices?.[0]?.message?.content?.trim() || '';
}

export async function rewriteArticleWithDeepseek(article, config) {
  if (!config.deepseekEnabled || !config.deepseekApiKey) {
    return { article, used: false, reason: 'deepseek-disabled' };
  }

  const sourceText = buildArticleRewriteSource(article);
  const prompt = config.deepseekPrompt || '改成新闻稿形式';

  const response = await fetch(`${config.deepseekBaseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.deepseekApiKey}`
    },
    body: JSON.stringify({
      model: config.deepseekModel,
      temperature: 0.7,
      messages: [
        {
          role: 'system',
          content:
            '你是中文新闻编辑，擅长把机构供稿改写成正式新闻稿。必须严格保留所有形如[图片1]、[图片2]的占位标记，不能删除、改写、合并或新增这些标记。返回纯文本，不要使用 Markdown。'
        },
        {
          role: 'user',
          content: `${prompt}

请将下面这篇文章改写成新闻稿形式，并严格遵守以下要求：
1. 保留所有[图片N]占位标记，位置可微调，但每个标记必须且只能出现一次。
2. 不要输出任何解释、说明或额外提示。
3. 只按以下格式返回：
标题：改写后的标题
正文：
改写后的正文

原文如下：
${sourceText}`
        }
      ]
    })
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`DeepSeek 请求失败: HTTP ${response.status} ${data?.error?.message || ''}`.trim());
  }

  const rewrittenText = getChatContent(data);
  if (!rewrittenText) {
    throw new Error('DeepSeek 未返回可用内容');
  }

  const outputPath = path.join(config.runtimeDir, 'deepseek-rewrite.txt');
  fs.writeFileSync(outputPath, rewrittenText, 'utf8');

  return {
    article: buildArticleFromRewrite(article, rewrittenText),
    used: true,
    outputPath
  };
}
