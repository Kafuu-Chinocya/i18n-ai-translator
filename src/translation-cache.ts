import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { isFileNotFound } from './utils/fs'

/** 读取指定语言对的翻译缓存，缓存文件不存在时返回空对象。 */
export async function readCache(
  cacheDir: string,
  base: string,
  target: string
) {
  const cacheFile = getCacheFile(cacheDir, base, target)

  try {
    return JSON.parse(await readFile(cacheFile, 'utf8')) as Record<
      string,
      string
    >
  } catch (error) {
    if (isFileNotFound(error)) {
      return {}
    }

    throw error
  }
}

/** 将指定语言对的翻译缓存写入磁盘。 */
export async function writeCache(
  cacheDir: string,
  base: string,
  target: string,
  cache: Record<string, string>
) {
  await mkdir(cacheDir, { recursive: true })
  await writeFile(getCacheFile(cacheDir, base, target), formatJson(cache))
}

/** 根据目标语言、源文案和术语表版本生成缓存键。 */
export function getCacheKey(
  target: string,
  source: string,
  glossaryVersion: string | undefined
) {
  return createHash('sha256')
    .update([target, source, glossaryVersion || ''].join('\n'))
    .digest('hex')
}

/** 拼接指定语言对对应的缓存文件路径。 */
function getCacheFile(cacheDir: string, base: string, target: string) {
  return path.join(cacheDir, `${base}__${target}.json`)
}

/** 以稳定的两空格缩进格式化 JSON 并追加结尾换行。 */
function formatJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}
