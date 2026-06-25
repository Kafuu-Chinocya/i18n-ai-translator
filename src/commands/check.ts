import path from 'node:path'

import type { ResolvedOptions } from '../types'
import { listLocaleFiles, readLocaleFile } from '../locale/files'
import { compareMessageShape } from '../locale/validation'

/** 校验目标语言文件是否与源语言文件保持一致的键结构和占位符。 */
export async function check(options: ResolvedOptions) {
  const baseFiles = await listLocaleFiles(options.baseDir)
  const targetFiles = await listLocaleFiles(options.targetDir)
  const targetFileSet = new Set(targetFiles)
  const baseFileSet = new Set(baseFiles)
  const issues = []

  for (const file of baseFiles) {
    if (!targetFileSet.has(file)) {
      issues.push({
        file,
        keyPath: '',
        message: `missing target file ${path.join(options.targetDir, file)}`
      })
      continue
    }

    const [baseFile, targetFile] = await Promise.all([
      readLocaleFile(options.baseDir, file),
      readLocaleFile(options.targetDir, file)
    ])
    issues.push(
      ...compareMessageShape(
        baseFile.message,
        targetFile.message,
        file,
        options.framework
      )
    )
  }

  targetFiles.forEach((file) => {
    if (!baseFileSet.has(file)) {
      issues.push({ file, keyPath: '', message: 'extra target file' })
    }
  })

  if (issues.length > 0) {
    const errorMessage = `Found ${issues.length} i18n issue(s):\n${issues
      .map((issue) =>
        [issue.file, issue.keyPath, issue.message].filter(Boolean).join(' - ')
      )
      .join('\n')}`
    throw new Error(errorMessage)
  }

  console.log(`i18n check passed: ${options.baseDir} -> ${options.targetDir}`)
}
