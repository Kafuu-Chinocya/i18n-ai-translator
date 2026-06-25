import { createOpenAI } from '@ai-sdk/openai'
import {
  NoObjectGeneratedError,
  extractJsonMiddleware,
  generateObject,
  generateText,
  wrapLanguageModel
} from 'ai'
import { z } from 'zod'

import type { LocaleFile, ResolvedOptions, TranslationItem } from '../types'
import {
  listLocaleFiles,
  readLocaleFile,
  writeLocaleFile
} from '../locale/files'
import { getMissingItems, pruneToBase, setValue } from '../locale/messages'
import { compareMessageShape } from '../locale/validation'
import { getLogger } from '../logger'
import { getCacheKey, readCache, writeCache } from '../translation-cache'
import { chunk } from '../utils/arrays'

const translationSchema = z.object({
  translations: z.record(z.string(), z.string())
})

/** 根据目标文件是否存在决定最终写回时保留哪种文件格式。 */
function getTargetFormat(targetFile: LocaleFile, baseFile: LocaleFile) {
  return targetFile.exists ? targetFile.format : baseFile.format
}

/** 翻译源语言中缺失或需覆盖的目标语言文案，并按需写入缓存和文件。 */
export async function translate(options: ResolvedOptions) {
  const files = await listLocaleFiles(options.baseDir)
  const cache = await readCache(options.cacheDir, options.base, options.target)
  const apiKey = options.apiKey
  let changedFiles = 0
  let translatedCount = 0
  let cachedCount = 0

  if (!options.dryRun && !apiKey) {
    throw new Error('Missing --api-key or LLM_API_KEY/OPENAI_API_KEY')
  }

  const llmApiKey = apiKey || ''
  const openai = options.dryRun
    ? null
    : createOpenAI({
        apiKey: llmApiKey,
        baseURL: options.baseURL
      })

  for (const file of files) {
    const baseFile = await readLocaleFile(options.baseDir, file)
    const targetFile = await readLocaleFile(options.targetDir, file)
    const targetMessage = options.prune
      ? pruneToBase(baseFile.message, targetFile.message)
      : targetFile.message
    const missingItems = getMissingItems(
      baseFile.message,
      targetMessage,
      options.overwrite
    )

    if (missingItems.length === 0) {
      if (!options.dryRun && (options.prune || !targetFile.exists)) {
        await writeLocaleFile(
          options.targetDir,
          file,
          targetMessage,
          getTargetFormat(targetFile, baseFile)
        )
        changedFiles += 1
      }

      continue
    }

    console.log(`${file}: ${missingItems.length} item(s) to translate`)

    if (options.dryRun) {
      continue
    }

    const uncachedItems: TranslationItem[] = []

    missingItems.forEach((item) => {
      const cacheKey = getCacheKey(
        options.target,
        item.source,
        options.glossary
      )
      const cached = cache[cacheKey]

      if (cached) {
        setValue(targetMessage, item.keyPath, cached)
        cachedCount += 1
      } else {
        uncachedItems.push(item)
      }
    })

    for (const batch of chunk(uncachedItems, options.batchSize)) {
      const translatedItems = await translateBatch(batch, options, openai!)

      const batchMap = new Map(batch.map((item) => [item.keyPath, item.source]))

      translatedItems.forEach((item) => {
        const source = batchMap.get(item.keyPath)

        if (!source) {
          throw new Error(`LLM returned unknown keyPath: ${item.keyPath}`)
        }

        setValue(targetMessage, item.keyPath, item.translation)
        cache[getCacheKey(options.target, source, options.glossary)] =
          item.translation
        translatedCount += 1
      })
    }

    const issues = compareMessageShape(
      baseFile.message,
      targetMessage,
      file,
      options.framework
    )
    // “多余键”是目标文件残留、与翻译质量无关,降级为警告(可用 --prune 清理),
    // 不应中断翻译;其余问题(缺失翻译/占位符不一致等)才算致命。
    const extraKeyIssues = issues.filter(
      (issue) => issue.message === 'extra target key'
    )
    const fatalIssues = issues.filter(
      (issue) => issue.message !== 'extra target key'
    )

    if (extraKeyIssues.length > 0) {
      const note = `${file}: ${
        extraKeyIssues.length
      } extra target key(s) not in base (use --prune to remove): ${extraKeyIssues
        .map((issue) => issue.keyPath)
        .join(', ')}`
      console.warn(note)
      await getLogger()?.warn(note)
    }

    if (fatalIssues.length > 0) {
      const details = fatalIssues
        .slice(0, 20)
        .map((issue) => `${issue.file}:${issue.keyPath} ${issue.message}`)
        .join('\n')
      throw new Error(
        `Validation failed after translating ${file}:\n${details}`
      )
    }

    await writeLocaleFile(
      options.targetDir,
      file,
      targetMessage,
      getTargetFormat(targetFile, baseFile)
    )
    changedFiles += 1
  }

  if (!options.dryRun) {
    await writeCache(options.cacheDir, options.base, options.target, cache)
  }

  console.log(
    [
      `Done. files=${changedFiles}`,
      `translated=${translatedCount}`,
      `cached=${cachedCount}`,
      `target=${options.target}`
    ].join(' ')
  )
}

/** 构建翻译用的 system 提示词。 */
function buildSystemPrompt(options: ResolvedOptions) {
  return [
    'You are an i18n translation engine for a web application.',
    'You receive a JSON object whose "messages" field maps each key to its source string.',
    'Return a JSON object whose "translations" field maps the SAME keys to their translated strings.',
    'Use every key exactly once. Do not add, drop, or rename keys, and never change the keys themselves.',
    'Only the string values are translated.',
    'Preserve placeholders like {name}, {n}, %s, HTML tags, and line breaks.',
    'For literal interpolation wrappers like {\'...\'} or {"..."}, keep the braces and quotes but translate the text inside them.',
    options.framework
      ? `This project uses the "${options.framework}" i18n framework. Preserve all of its special message syntax exactly as written in the source, including linked messages, interpolation, plural/select forms, and modifiers.`
      : '',
    'Do not translate product names, device models, protocol names, airport codes, or brand names.',
    'Use concise UI wording suitable for enterprise software.',
    options.glossary ? `Terminology glossary:\n${options.glossary}` : ''
  ]
    .filter(Boolean)
    .join('\n')
}

/** 将待翻译条目转换为发给模型的 keyPath -> 源文案映射。 */
function buildMessagesMap(items: TranslationItem[]) {
  return Object.fromEntries(items.map((item) => [item.keyPath, item.source]))
}

/** 构造发给模型的用户提示内容。 */
function buildUserPrompt(items: TranslationItem[], options: ResolvedOptions) {
  return JSON.stringify({
    sourceLanguage: options.base,
    targetLanguage: options.target,
    messages: buildMessagesMap(items)
  })
}

/** 截取字符串里最外层的 JSON 对象,跳过模型添加的前言/解释/代码块。 */
function sliceJsonObject(text: string) {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')

  if (start === -1 || end === -1 || end < start) {
    return null
  }

  return text.slice(start, end + 1)
}

/** 从可能包含 Markdown 代码块或多余文本的字符串中提取 JSON 对象。 */
function extractJsonObject(text: string) {
  const json = sliceJsonObject(text)

  if (json === null) {
    throw new Error('LLM response did not contain a JSON object')
  }

  return json
}

/**
 * 包装模型:在解析结构化输出前,先剥离模型可能添加的前言/代码块,
 * 兼容会在 JSON 前后输出说明文字的(含 reasoning 类)模型。
 */
function createTranslationModel(
  openai: ReturnType<typeof createOpenAI>,
  options: ResolvedOptions
) {
  return wrapLanguageModel({
    model: openai.chat(options.model),
    middleware: extractJsonMiddleware({
      transform: (text) => sliceJsonObject(text) ?? text
    })
  })
}

/** 兜底:用纯文本生成 + 手动解析 JSON,适配不支持结构化输出的服务。 */
async function translateBatchAsText(
  items: TranslationItem[],
  options: ResolvedOptions,
  openai: ReturnType<typeof createOpenAI>
) {
  const { text } = await generateText({
    model: openai.chat(options.model),
    system: [
      buildSystemPrompt(options),
      'Respond with ONLY a JSON object, no markdown and no code fences.',
      'The JSON shape must be: {"translations":{"<key>":"<translated string>"}}.'
    ].join('\n'),
    prompt: buildUserPrompt(items, options)
  })

  await getLogger()?.modelOutput('fallback raw text', text)

  return translationSchema.parse(JSON.parse(extractJsonObject(text)))
    .translations
}

/** 调用模型批量翻译文案，并校验返回的 keyPath 完整性。 */
async function translateBatch(
  items: TranslationItem[],
  options: ResolvedOptions,
  openai: ReturnType<typeof createOpenAI>
) {
  const logger = getLogger()
  let translations: Record<string, string>

  try {
    const { object } = await generateObject({
      model: createTranslationModel(openai, options),
      schema: translationSchema,
      system: buildSystemPrompt(options),
      prompt: buildUserPrompt(items, options)
    })
    translations = object.translations
    await logger?.modelOutput(
      'generateObject translations',
      JSON.stringify(object.translations)
    )
  } catch (error) {
    if (!NoObjectGeneratedError.isInstance(error)) {
      throw error
    }

    await logger?.warn(`Structured output failed: ${error.cause ?? 'no cause'}`)
    await logger?.modelOutput(
      'raw text (structured output failed)',
      error.text ?? '<empty>'
    )
    console.warn(
      'Structured output failed; falling back to plain-text JSON parsing...'
    )
    translations = await translateBatchAsText(items, options, openai)
  }

  return items.map((item) => {
    const translation = translations[item.keyPath]

    if (typeof translation !== 'string') {
      throw new Error(`LLM did not return keyPath: ${item.keyPath}`)
    }

    return { keyPath: item.keyPath, translation }
  })
}
