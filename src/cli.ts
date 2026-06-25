import { type Command, cac } from 'cac'

import { check } from './commands/check'
import { translate } from './commands/translate'
import { resolveOptions } from './options'
import type { CliOptions } from './types'

export interface CommandOptions {
  root?: string
  base?: string
  target?: string
  baseDir?: string
  targetDir?: string
  cacheDir?: string
  batchSize?: number | number[]
  model?: string
  baseUrl?: string
  apiKey?: string
  glossary?: string
  framework?: string
  overwrite?: boolean
  prune?: boolean
  dryRun?: boolean
}

/** 将 cac 解析出的命令参数规范化为内部运行配置。 */
export function toResolvedOptions(options: CommandOptions) {
  const batchSize = Array.isArray(options.batchSize)
    ? options.batchSize.at(-1)
    : options.batchSize

  const cliOptions: CliOptions = {
    root: options.root,
    base: options.base || 'zh-cn',
    target: options.target || '',
    baseDir: options.baseDir,
    targetDir: options.targetDir,
    cacheDir: options.cacheDir,
    overwrite: Boolean(options.overwrite),
    prune: Boolean(options.prune),
    dryRun: Boolean(options.dryRun),
    batchSize: batchSize ?? 100,
    model: options.model || process.env.LLM_MODEL || 'gpt-4.1-mini',
    baseURL: options.baseUrl || process.env.LLM_BASE_URL,
    apiKey:
      options.apiKey || process.env.LLM_API_KEY || process.env.OPENAI_API_KEY,
    glossary: options.glossary,
    framework: options.framework
  }

  return resolveOptions(cliOptions)
}

/** 为命令注册通用的多语言目录、模型和执行选项。 */
function withLocaleOptions(command: Command) {
  return command
    .option('--root <dir>', 'Locale root containing base and target folders')
    .option('--base <language>', 'Base locale folder under root', {
      default: 'zh-cn'
    })
    .option('--target <language>', 'Target locale folder under root')
    .option('--base-dir <dir>', 'Explicit base locale directory')
    .option('--target-dir <dir>', 'Explicit target locale directory')
    .option('--cache-dir <dir>', 'Translation cache directory')
    .option('--batch-size <number>', 'Translation batch size', {
      default: 100,
      type: [Number]
    })
    .option('--model <model>', 'LLM model', {
      default: process.env.LLM_MODEL || 'gpt-4.1-mini'
    })
    .option('--base-url <url>', 'OpenAI-compatible base URL', {
      default: process.env.LLM_BASE_URL
    })
    .option(
      '--api-key <key>',
      'LLM API key (overrides LLM_API_KEY/OPENAI_API_KEY)'
    )
    .option('--glossary <text>', 'Extra terminology guidance')
    .option(
      '--framework <name>',
      'Target i18n framework whose message syntax must be preserved (e.g. vue-i18n, react-i18next, i18next, formatjs)'
    )
    .option('--overwrite', 'Re-translate existing target strings')
    .option('--prune', 'Remove target keys not present in base files')
    .option(
      '--dry-run',
      'Print changes without calling the LLM or writing files'
    )
}

/** 创建并配置 i18n-ai-translator 命令行实例。 */
export function createCli() {
  const cli = cac('i18n-ai-translator')

  withLocaleOptions(
    cli.command('translate', 'Translate missing target locale messages')
  )
    .example(
      'pnpm cli translate --root ../packages/locales/lang --base zh-cn --target en --dry-run'
    )
    .action(async (options: CommandOptions) => {
      await translate(toResolvedOptions(options))
    })

  withLocaleOptions(
    cli.command('check', 'Validate target locale message shape')
  )
    .example(
      'pnpm cli check --root ../packages/locales/lang --base zh-cn --target en'
    )
    .example('pnpm cli check --base-dir ./lang/zh-cn --target-dir ./lang/en')
    .action(async (options: CommandOptions) => {
      await check(toResolvedOptions(options))
    })

  cli.help()

  return cli
}
