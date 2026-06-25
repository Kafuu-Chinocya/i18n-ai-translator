/** 命令行入口接收的原始配置。 */
export interface CliOptions {
  /** 多语言目录根路径，通常包含源语言和目标语言子目录。 */
  root?: string
  /** 源语言目录名或语言标识。 */
  base: string
  /** 目标语言目录名或语言标识。 */
  target: string
  /** 显式指定的源语言文件目录。 */
  baseDir?: string
  /** 显式指定的目标语言文件目录。 */
  targetDir?: string
  /** 翻译缓存文件目录。 */
  cacheDir?: string
  /** 是否覆盖已有目标语言文案。 */
  overwrite: boolean
  /** 是否移除目标语言中源语言不存在的键。 */
  prune: boolean
  /** 是否仅打印变更而不调用模型或写入文件。 */
  dryRun: boolean
  /** 每次提交给模型翻译的文案数量。 */
  batchSize: number
  /** 调用翻译模型时使用的模型名称。 */
  model: string
  /** OpenAI 兼容接口的基础地址。 */
  baseURL?: string
  /** 调用模型使用的 API Key。 */
  apiKey?: string
  /** 额外的术语表或翻译约束说明。 */
  glossary?: string
  /** 目标项目使用的 i18n 框架，用于提示模型保留其特定语法。 */
  framework?: string
}

/** 已解析为绝对目录路径的运行配置。 */
export interface ResolvedOptions extends CliOptions {
  /** 解析后的源语言文件目录。 */
  baseDir: string
  /** 解析后的目标语言文件目录。 */
  targetDir: string
  /** 解析后的翻译缓存目录。 */
  cacheDir: string
}

/** 待翻译的一条扁平化文案。 */
export interface TranslationItem {
  /** 文案在嵌套对象中的点分路径。 */
  keyPath: string
  /** 源语言原文。 */
  source: string
}

/** 目标语言校验过程中发现的问题。 */
export interface ValidationIssue {
  /** 出现问题的相对文件路径。 */
  file: string
  /** 出现问题的文案点分路径。 */
  keyPath: string
  /** 问题描述。 */
  message: string
}

/** 多语言文件中的嵌套消息对象。 */
export type LocaleMessage = Record<string, unknown>
/** 支持读写的多语言文件格式。 */
export type LocaleFileFormat = 'json' | 'esm' | 'cjs'

/** 读取多语言文件后的结构化结果。 */
export interface LocaleFile {
  /** 文件是否实际存在。 */
  exists: boolean
  /** 文件中解析出的消息内容。 */
  message: LocaleMessage
  /** 文件源码使用的模块或数据格式。 */
  format: LocaleFileFormat
}
