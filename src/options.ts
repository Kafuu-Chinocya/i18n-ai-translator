import path from 'node:path'

import type { CliOptions, ResolvedOptions } from './types'

/** 校验命令行配置并解析出实际使用的目录路径。 */
export function resolveOptions(options: CliOptions): ResolvedOptions {
  if (!options.target && !options.targetDir) {
    throw new Error(
      'Missing required option: --target <language> or --target-dir <dir>'
    )
  }

  if (!Number.isInteger(options.batchSize) || options.batchSize < 1) {
    throw new Error('--batch-size must be a positive integer')
  }

  const root = options.root ? path.resolve(options.root) : undefined
  const baseDir = path.resolve(
    options.baseDir || path.join(root || '.', options.base)
  )
  const targetDir = path.resolve(
    options.targetDir || path.join(root || '.', options.target)
  )
  const cacheDir = path.resolve(
    options.cacheDir ||
      (root
        ? path.join(path.dirname(root), '.translation-cache')
        : '.translation-cache')
  )

  return { ...options, baseDir, targetDir, cacheDir }
}
