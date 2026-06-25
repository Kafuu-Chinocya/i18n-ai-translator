import prettier from 'prettier'
import {
  type ObjectLiteralExpression,
  Project,
  type PropertyAssignment,
  type SourceFile,
  SyntaxKind
} from 'ts-morph'

import type { LocaleFileFormat, LocaleMessage } from '../types'

import { isPlainObject } from './messages'

/** 将 json、ESM 或 CommonJS 多语言源码解析为消息对象。 */
export function parseLocaleSource(source: string, filePath: string) {
  if (filePath.endsWith('.json')) {
    return JSON.parse(source) as LocaleMessage
  }

  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile(filePath, source, {
    overwrite: true
  })
  const expression = getDefaultObjectExpression(sourceFile)

  if (!expression) {
    throw new Error(
      `${filePath} must export an object literal through "export default" or "module.exports"`
    )
  }

  return objectLiteralToValue(expression)
}

/** 将消息对象格式化为指定的 json、ESM 或 CommonJS 多语言源码。 */
export async function formatLocaleSource(
  value: LocaleMessage,
  format: LocaleFileFormat
) {
  if (format === 'json') {
    return formatJson(value)
  }

  const config = await prettier.resolveConfig(process.cwd())
  const assignment = format === 'cjs' ? 'module.exports = ' : 'export default '

  return prettier.format(`${assignment}${toTsLiteral(value)}\n`, {
    ...config,
    parser: 'typescript',
    semi: false,
    singleQuote: true
  })
}

/** 根据文件扩展名和源码内容识别多语言文件格式。 */
export function getLocaleFormat(
  source: string,
  filePath: string
): LocaleFileFormat {
  if (filePath.endsWith('.json')) return 'json'
  return /\bmodule\.exports\s*=/.test(source) ? 'cjs' : 'esm'
}

/** 根据目标文件路径推断新建多语言文件的默认格式。 */
export function getDefaultFormat(filePath: string): LocaleFileFormat {
  if (filePath.endsWith('.json')) return 'json'
  if (filePath.endsWith('.cjs')) return 'cjs'
  return 'esm'
}

/** 从 TypeScript 源文件中查找默认导出或 CommonJS 导出的对象字面量。 */
function getDefaultObjectExpression(sourceFile: SourceFile) {
  const exportAssignment = sourceFile.getExportAssignment(
    (node) => !node.isExportEquals()
  )
  const exportExpression = exportAssignment?.getExpression()

  if (exportExpression?.isKind(SyntaxKind.ObjectLiteralExpression)) {
    return exportExpression
  }

  const moduleExports = sourceFile.getFirstDescendant((node) => {
    if (!node.isKind(SyntaxKind.BinaryExpression)) return false
    if (node.getOperatorToken().getText() !== '=') return false

    const left = node.getLeft().getText()
    return left === 'module.exports' || left === 'exports.default'
  })

  if (moduleExports?.isKind(SyntaxKind.BinaryExpression)) {
    const right = moduleExports.getRight()

    if (right.isKind(SyntaxKind.ObjectLiteralExpression)) {
      return right
    }
  }

  return undefined
}

/** 将对象字面量递归转换为仅包含字符串和嵌套对象的消息对象。 */
function objectLiteralToValue(node: ObjectLiteralExpression): LocaleMessage {
  const result: LocaleMessage = {}

  node.getProperties().forEach((property) => {
    if (!property.isKind(SyntaxKind.PropertyAssignment)) {
      return
    }

    const name = getPropertyName(property)
    const initializer = property.getInitializer()

    if (!initializer) return

    if (
      initializer.isKind(SyntaxKind.StringLiteral) ||
      initializer.isKind(SyntaxKind.NoSubstitutionTemplateLiteral)
    ) {
      result[name] = initializer.getLiteralText()
      return
    }

    if (initializer.isKind(SyntaxKind.ObjectLiteralExpression)) {
      result[name] = objectLiteralToValue(initializer)
      return
    }

    throw new Error(
      `Unsupported i18n value at key "${name}": ${initializer.getText()}`
    )
  })

  return result
}

/** 读取属性赋值的实际键名，兼容字符串字面量键和普通标识符键。 */
function getPropertyName(property: PropertyAssignment) {
  const nameNode = property.getNameNode()

  if (
    nameNode.isKind(SyntaxKind.StringLiteral) ||
    nameNode.isKind(SyntaxKind.NoSubstitutionTemplateLiteral)
  ) {
    return nameNode.getLiteralText()
  }

  return property.getName()
}

/** 以稳定的两空格缩进格式化 JSON 并追加结尾换行。 */
function formatJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

/** 将消息对象递归转换为 TypeScript 对象字面量源码。 */
function toTsLiteral(value: unknown, indent = 0): string {
  if (typeof value === 'string') {
    return JSON.stringify(value)
  }

  if (!isPlainObject(value)) {
    return 'undefined'
  }

  const entries = Object.entries(value)

  if (entries.length === 0) {
    return '{}'
  }

  const pad = '  '.repeat(indent)
  const nextPad = '  '.repeat(indent + 1)
  const lines = entries.map(([key, item]) => {
    return `${nextPad}${formatObjectKey(key)}: ${toTsLiteral(item, indent + 1)}`
  })

  return `{\n${lines.join(',\n')}\n${pad}}`
}

/** 将对象键格式化为标识符或字符串字面量。 */
function formatObjectKey(key: string) {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key)
}
