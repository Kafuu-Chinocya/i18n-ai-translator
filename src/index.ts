#!/usr/bin/env node
import { createCli } from './cli'
import { endLogger, getLogger, startLogger } from './logger'

/** 执行命令行入口并在无参数时输出帮助信息。 */
async function main() {
  const cli = createCli()

  if (process.argv.length <= 2) {
    cli.outputHelp()
    return
  }

  cli.parse(process.argv, { run: false })
  startLogger(cli.matchedCommandName || 'run')
  await cli.runMatchedCommand()
  await endLogger(true)
}

main().catch(async (error) => {
  const detail = error?.stack || error?.message || String(error)
  await getLogger()?.error(detail)
  const logPath = await endLogger(false)

  console.error(error?.message || error)

  if (logPath) {
    console.error(`\nLogs saved to: ${logPath}`)
  }

  process.exit(1)
})
