import { appendFile, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

/**
 * 单次运行的日志器:把模型输出与系统报错写入一个日志文件。
 * 运行出错时保留日志并返回路径,正常结束时删除日志。
 */
class RunLogger {
  /** 日志所在目录。 */
  readonly dir: string
  /** 日志文件完整路径。 */
  readonly filePath: string
  /** 延迟创建文件,确保只在真正写入时才落盘。 */
  private ready: Promise<void> | null = null

  constructor(name: string, dir?: string) {
    this.dir = dir ?? path.join(os.tmpdir(), 'i18n-ai-translator-logs')
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    this.filePath = path.join(this.dir, `${name}-${stamp}-${process.pid}.log`)
  }

  private ensure() {
    if (!this.ready) {
      this.ready = (async () => {
        await mkdir(this.dir, { recursive: true })
        await writeFile(
          this.filePath,
          `# i18n-ai-translator log\n# started ${new Date().toISOString()}\n\n`
        )
      })()
    }

    return this.ready
  }

  /** 写入一行日志;日志失败绝不影响主流程。 */
  private async write(level: string, message: string) {
    try {
      await this.ensure()
      await appendFile(
        this.filePath,
        `[${new Date().toISOString()}] ${level} ${message}\n`
      )
    } catch {
      // 忽略日志写入错误
    }
  }

  info(message: string) {
    return this.write('INFO', message)
  }

  warn(message: string) {
    return this.write('WARN', message)
  }

  error(message: string) {
    return this.write('ERROR', message)
  }

  /** 记录一段模型输出(单独成块,便于排查)。 */
  async modelOutput(label: string, content: string) {
    try {
      await this.ensure()
      await appendFile(
        this.filePath,
        `[${new Date().toISOString()}] MODEL ${label}\n${content}\n\n`
      )
    } catch {
      // 忽略日志写入错误
    }
  }

  /** 删除日志文件(正常结束时调用)。 */
  async discard() {
    try {
      await rm(this.filePath, { force: true })
    } catch {
      // 忽略删除错误
    }
  }
}

let current: RunLogger | null = null

/** 开始一次运行的日志记录。 */
export function startLogger(name: string, dir?: string) {
  current = new RunLogger(name, dir)
  return current
}

/** 获取当前运行的日志器(供各处写入模型输出/错误)。 */
export function getLogger() {
  return current
}

/**
 * 结束日志记录。
 * @returns 出错时返回保留的日志文件路径,正常结束返回 null。
 */
export async function endLogger(success: boolean): Promise<string | null> {
  const logger = current
  current = null

  if (!logger) {
    return null
  }

  if (success) {
    await logger.discard()
    return null
  }

  return logger.filePath
}
