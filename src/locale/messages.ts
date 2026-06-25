import type { LocaleMessage, TranslationItem } from '../types'

/** 将嵌套消息对象展开为可翻译的点分路径列表。 */
export function flattenMessages(
  value: LocaleMessage,
  prefix = ''
): TranslationItem[] {
  return Object.entries(value).flatMap(([key, item]) => {
    const keyPath = prefix ? `${prefix}.${key}` : key

    if (typeof item === 'string') {
      return [{ keyPath, source: item }]
    }

    if (isPlainObject(item)) {
      return flattenMessages(item, keyPath)
    }

    return []
  })
}

/** 按点分路径读取嵌套消息对象中的值。 */
export function getValue(value: LocaleMessage, keyPath: string) {
  return keyPath.split('.').reduce<unknown>((acc, key) => {
    if (!isPlainObject(acc)) return undefined
    return acc[key]
  }, value)
}

/** 按点分路径写入字符串值，并自动补齐中间对象。 */
export function setValue(value: LocaleMessage, keyPath: string, item: string) {
  const keys = keyPath.split('.')
  const lastKey = keys.pop()

  if (!lastKey) return

  let current: LocaleMessage = value
  keys.forEach((key) => {
    const next = current[key]

    if (!isPlainObject(next)) {
      current[key] = {}
    }

    current = current[key] as LocaleMessage
  })
  current[lastKey] = item
}

/** 按源语言结构裁剪目标语言消息，只保留双方都存在的字符串键。 */
export function pruneToBase(
  base: LocaleMessage,
  target: LocaleMessage
): LocaleMessage {
  const result: LocaleMessage = {}

  Object.entries(base).forEach(([key, baseValue]) => {
    const targetValue = target[key]

    if (typeof baseValue === 'string') {
      if (typeof targetValue === 'string') {
        result[key] = targetValue
      }

      return
    }

    if (isPlainObject(baseValue)) {
      result[key] = pruneToBase(
        baseValue,
        isPlainObject(targetValue) ? targetValue : {}
      )
    }
  })

  return result
}

/** 找出目标语言缺失、为空或需要覆盖的源语言文案。 */
export function getMissingItems(
  base: LocaleMessage,
  target: LocaleMessage,
  overwrite: boolean
) {
  return flattenMessages(base).filter((item) => {
    const targetValue = getValue(target, item.keyPath)
    return (
      overwrite || typeof targetValue !== 'string' || targetValue.length === 0
    )
  })
}

/** 判断值是否为可继续递归处理的普通对象。 */
export function isPlainObject(value: unknown): value is LocaleMessage {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
