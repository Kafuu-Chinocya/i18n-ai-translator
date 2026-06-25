import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import fg from 'fast-glob'

import type { LocaleFile, LocaleFileFormat, LocaleMessage } from '../types'
import { isFileNotFound } from '../utils/fs'

import {
  formatLocaleSource,
  getDefaultFormat,
  getLocaleFormat,
  parseLocaleSource
} from './source'

/** 递归列出目录中支持处理的多语言文件。 */
export async function listLocaleFiles(dir: string) {
  const files = await fg(['**/*.{ts,js,json}', '!**/*.d.ts'], {
    cwd: dir,
    absolute: false,
    onlyFiles: true
  })

  return files.sort()
}

/** 读取并解析多语言文件，文件不存在时返回空消息对象。 */
export async function readLocaleFile(
  dir: string,
  relativeFile: string
): Promise<LocaleFile> {
  const filePath = path.join(dir, relativeFile)

  try {
    const source = await readFile(filePath, 'utf8')
    return {
      exists: true,
      message: parseLocaleSource(source, filePath),
      format: getLocaleFormat(source, filePath)
    }
  } catch (error) {
    if (isFileNotFound(error)) {
      return {
        exists: false,
        message: {},
        format: getDefaultFormat(filePath)
      }
    }

    throw error
  }
}

/** 判断指定的相对多语言文件是否存在。 */
export async function localeFileExists(dir: string, relativeFile: string) {
  try {
    await access(path.join(dir, relativeFile))
    return true
  } catch (error) {
    if (isFileNotFound(error)) {
      return false
    }

    throw error
  }
}

/** 将消息对象按指定格式写回多语言文件。 */
export async function writeLocaleFile(
  dir: string,
  relativeFile: string,
  value: LocaleMessage,
  format: LocaleFileFormat
) {
  const filePath = path.join(dir, relativeFile)
  await mkdir(path.dirname(filePath), { recursive: true })
  const source = await formatLocaleSource(value, format)
  await writeFile(filePath, source)
}
