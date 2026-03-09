import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_LOGIN_URL = 'https://nfh.nfapp.southcn.com/backend/nfh-publishing-system/#/login';
const DEFAULT_PUBLISH_URL = 'https://nfh.nfapp.southcn.com/backend/nfh-publishing-system/#/content/publish';
const DEFAULT_CONFIG_FILE = 'nfh.config.json';

function parseBoolean(value, fallback = false) {
  if (value == null || value === '') {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function resolveUserPath(inputPath) {
  if (!inputPath) {
    return inputPath;
  }

  if (inputPath.startsWith('~/')) {
    return path.join(process.env.HOME || '', inputPath.slice(2));
  }

  return path.resolve(inputPath);
}

function readConfigFile(configFilePath) {
  if (!fs.existsSync(configFilePath)) {
    return {};
  }

  try {
    const raw = fs.readFileSync(configFilePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`配置文件读取失败: ${configFilePath} (${error.message})`);
  }
}

export function loadConfig(overrides = {}) {
  const configFile = resolveUserPath(process.env.NFH_CONFIG_FILE || DEFAULT_CONFIG_FILE);
  const fileConfig = readConfigFile(configFile);
  const runtimeDir = resolveUserPath(
    overrides.runtimeDir ||
      process.env.NFH_RUNTIME_DIR ||
      fileConfig.runtimeDir ||
      '.runtime'
  );
  const screenshotsDir = path.join(runtimeDir, 'screenshots');
  const imageOutputDir = path.join(runtimeDir, 'images');
  const stateFile = path.join(runtimeDir, 'state.json');

  const config = {
    configFile,
    runtimeDir,
    screenshotsDir,
    imageOutputDir,
    stateFile,
    loginUrl: process.env.NFH_LOGIN_URL || fileConfig.loginUrl || DEFAULT_LOGIN_URL,
    publishUrl: process.env.NFH_PUBLISH_URL || fileConfig.publishUrl || DEFAULT_PUBLISH_URL,
    previewUrl:
      process.env.NFH_PREVIEW_URL ||
      fileConfig.previewUrl ||
      process.env.NFH_PUBLISH_URL ||
      fileConfig.publishUrl ||
      DEFAULT_PUBLISH_URL,
    username: process.env.NFH_USERNAME || fileConfig.username || '',
    password: process.env.NFH_PASSWORD || fileConfig.password || '',
    deepseekApiKey: process.env.DEEPSEEK_API_KEY || fileConfig.deepseekApiKey || '',
    deepseekBaseUrl:
      process.env.DEEPSEEK_BASE_URL ||
      fileConfig.deepseekBaseUrl ||
      'https://api.deepseek.com',
    deepseekModel:
      process.env.DEEPSEEK_MODEL ||
      fileConfig.deepseekModel ||
      'deepseek-chat',
    deepseekPrompt:
      process.env.DEEPSEEK_PROMPT ||
      fileConfig.deepseekPrompt ||
      '改成新闻稿形式',
    deepseekEnabled: parseBoolean(
      process.env.DEEPSEEK_ENABLED ?? fileConfig.deepseekEnabled,
      Boolean(process.env.DEEPSEEK_API_KEY || fileConfig.deepseekApiKey)
    ),
    headless: parseBoolean(
      process.env.NFH_HEADLESS ?? fileConfig.headless,
      false
    ),
    keepOpen: parseBoolean(
      process.env.NFH_KEEP_OPEN ?? fileConfig.keepOpen,
      false
    ),
    navigationTimeoutMs: parseNumber(
      process.env.NFH_NAVIGATION_TIMEOUT_MS ?? fileConfig.navigationTimeoutMs,
      30000
    ),
    actionTimeoutMs: parseNumber(
      process.env.NFH_ACTION_TIMEOUT_MS ?? fileConfig.actionTimeoutMs,
      15000
    ),
    loginTimeoutMs: parseNumber(
      process.env.NFH_LOGIN_TIMEOUT_MS ?? fileConfig.loginTimeoutMs,
      180000
    ),
    ...overrides
  };

  ensureRuntimeDirs(config);
  return config;
}

export function ensureRuntimeDirs(config) {
  fs.mkdirSync(config.runtimeDir, { recursive: true });
  fs.mkdirSync(config.screenshotsDir, { recursive: true });
  fs.mkdirSync(config.imageOutputDir, { recursive: true });
}
