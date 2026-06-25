import type { LocaleMessage, ValidationIssue } from '../types'

import { flattenMessages, getValue } from './messages'

/**
 * 所有框架通用的占位符正则:花括号变量插值与 printf 风格占位符。
 * 注意:排除 `{'...'}` / `{"..."}` 这类字面量插值,
 * 其引号内是可翻译的展示文本,不应作为必须原样保留的占位符。
 */
const COMMON_PLACEHOLDER_PATTERNS = [/\{(?!\s*['"])[^{}]+\}/g, /%[sdifjoO]/g]

/**
 * 各 i18n 框架特有、必须在翻译后原样保留的语法正则。
 * key 为小写后的框架名,可按需扩展。
 */
const FRAMEWORK_PLACEHOLDER_PATTERNS: Record<string, RegExp[]> = {
  'vue-i18n': [/@(?:\.[A-Za-z]+)?:[A-Za-z0-9_.$-]+/g],
  i18next: [/\{\{[^{}]+\}\}/g, /\$t\([^()]+\)/g],
  'react-i18next': [/\{\{[^{}]+\}\}/g, /\$t\([^()]+\)/g]
}

/** 根据框架名获取该框架特有的占位符正则。 */
function getFrameworkPatterns(framework?: string) {
  if (!framework) {
    return []
  }

  return FRAMEWORK_PLACEHOLDER_PATTERNS[framework.toLowerCase()] ?? []
}

/** 提取文案中必须在翻译后保留的占位符及指定框架的特有语法。 */
export function extractPlaceholders(value: string, framework?: string) {
  const patterns = [
    ...COMMON_PLACEHOLDER_PATTERNS,
    ...getFrameworkPatterns(framework)
  ]

  return new Set(
    patterns.flatMap((pattern) =>
      [...value.matchAll(pattern)].map((match) => match[0])
    )
  )
}

/** 比较源语言和目标语言的键结构、占位符与空翻译问题。 */
export function compareMessageShape(
  base: LocaleMessage,
  target: LocaleMessage,
  file: string,
  framework?: string
) {
  const issues: ValidationIssue[] = []
  const baseItems = flattenMessages(base)
  const targetItems = flattenMessages(target)
  const baseKeySet = new Set(baseItems.map((item) => item.keyPath))
  const targetKeySet = new Set(targetItems.map((item) => item.keyPath))

  baseItems.forEach((item) => {
    const targetValue = getValue(target, item.keyPath)

    if (typeof targetValue !== 'string') {
      issues.push({
        file,
        keyPath: item.keyPath,
        message: 'missing target translation'
      })
      return
    }

    const sourcePlaceholders = extractPlaceholders(item.source, framework)
    const targetPlaceholders = extractPlaceholders(targetValue, framework)

    sourcePlaceholders.forEach((placeholder) => {
      if (!targetPlaceholders.has(placeholder)) {
        issues.push({
          file,
          keyPath: item.keyPath,
          message: `missing placeholder ${placeholder}`
        })
      }
    })

    targetPlaceholders.forEach((placeholder) => {
      if (!sourcePlaceholders.has(placeholder)) {
        issues.push({
          file,
          keyPath: item.keyPath,
          message: `unexpected placeholder ${placeholder}`
        })
      }
    })

    if (targetValue.length === 0) {
      issues.push({
        file,
        keyPath: item.keyPath,
        message: 'empty translation'
      })
    }
  })

  targetKeySet.forEach((keyPath) => {
    if (!baseKeySet.has(keyPath)) {
      issues.push({ file, keyPath, message: 'extra target key' })
    }
  })

  return issues
}
