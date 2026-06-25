/** 判断未知错误是否表示文件或目录不存在。 */
export function isFileNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT'
}
