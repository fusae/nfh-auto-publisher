---
name: nfh-auto-publisher
description: Publish a .docx article to 南方号 from the current workspace. Use when the user says things like “帮我把这篇稿件保存到南方号上”, wants to publish a draft to 南方号, rewrite an article with DeepSeek before publishing, explicitly says not to rewrite or not to use DeepSeek, retry a failed publish, or generate the publish result screenshot and preview long image for a docx file in the current workspace.
---

# NFH Auto Publisher

Use this skill in any workspace that contains:

- `nfh.config.json`
- at least one `.docx` article file

## What this skill does

- Publishes a `.docx` article to 南方号
- Rewrites the article with DeepSeek before publishing if `deepseekApiKey` is configured
- Reuses login state from `.runtime/state.json`
- Falls back to automatic captcha recognition for the account-password login form
- Produces:
  - `.runtime/deepseek-rewrite.txt`
  - `.runtime/screenshots/publish-result.png`
  - `.runtime/screenshots/preview-long.png`

## Workflow

1. Confirm the workspace contains `nfh.config.json`.
2. Resolve the article file in this order:
   - a `.docx` path explicitly named by the user
   - a likely referenced `.docx` file already present in the workspace
   - the newest `.docx` file in the current workspace
3. Decide whether to use DeepSeek rewriting:
   - default: use DeepSeek if configured
   - if the user says “不用润色”, “不要改写”, “不用 DeepSeek”, “原稿直发”, or equivalent, disable DeepSeek for this run
4. Run `scripts/run_publish.sh [docx-path] [--no-deepseek]` when needed.
5. Report only the key outputs:
   - success or failure
   - article filename
   - published article ID if available
   - rewritten title if available
   - result screenshot path
   - preview long image path
6. If login state is expired, allow the CLI to refresh it. Do not ask the user to log in unless the publish command explicitly falls back to manual captcha entry and blocks.
7. On first run, the script may install dependencies into the skill's bundled app directory. Let it finish.

## Notes

- The publish command may take a while because it includes DeepSeek rewriting, image upload, and browser automation.
- The bundled app already handles:
  - DeepSeek rewrite
  - image reinsertion
  - cover injection
  - save request capture
  - captcha retries for the account-password login form
- Prefer the packaged script over retyping the command.
- This skill is portable: the app source is bundled under `assets/app/`.

## Script

- Use `scripts/run_publish.sh`
- Optional argument: absolute or relative path to a `.docx` file
- Optional flag: `--no-deepseek`
- No argument: auto-picks the newest `.docx` in the current workspace
