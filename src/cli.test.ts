import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { createCli, toResolvedOptions } from './cli'

describe('createCli', () => {
  it('parses translate options with cac', () => {
    const cli = createCli()
    const parsed = cli.parse(
      [
        'node',
        'index.ts',
        'translate',
        '--root',
        './lang',
        '--target',
        'en',
        '--batch-size',
        '12',
        '--dry-run'
      ],
      { run: false }
    )

    expect(cli.matchedCommandName).toBe('translate')
    expect(parsed.options).toMatchObject({
      root: './lang',
      base: 'zh-cn',
      target: 'en',
      batchSize: [12],
      dryRun: true
    })
  })

  it('parses check options with explicit directories', () => {
    const cli = createCli()
    const parsed = cli.parse(
      [
        'node',
        'index.ts',
        'check',
        '--base-dir',
        './zh-cn',
        '--target-dir',
        './en'
      ],
      { run: false }
    )

    expect(cli.matchedCommandName).toBe('check')
    expect(parsed.options).toMatchObject({
      baseDir: './zh-cn',
      targetDir: './en'
    })
  })
})

describe('toResolvedOptions', () => {
  it('normalizes cac options for commands', () => {
    const options = toResolvedOptions({
      root: './lang',
      target: 'en',
      batchSize: [12],
      baseUrl: 'https://example.test/v1',
      dryRun: true
    })

    expect(options).toMatchObject({
      base: 'zh-cn',
      target: 'en',
      baseDir: path.resolve('./lang/zh-cn'),
      targetDir: path.resolve('./lang/en'),
      baseURL: 'https://example.test/v1',
      batchSize: 12,
      dryRun: true
    })
  })
})
