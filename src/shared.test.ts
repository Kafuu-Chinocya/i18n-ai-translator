import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { compareMessageShape, extractPlaceholders } from './locale/validation'
import {
  flattenMessages,
  getMissingItems,
  getValue,
  pruneToBase,
  setValue
} from './locale/messages'
import { formatLocaleSource, parseLocaleSource } from './locale/source'
import {
  listLocaleFiles,
  readLocaleFile,
  writeLocaleFile
} from './locale/files'
import { resolveOptions } from './options'
import { readCache, writeCache } from './translation-cache'
import { chunk } from './utils/arrays'

const tempDirs: string[] = []
const zhCnFixtureDir = path.resolve('src/__fixtures__/zh-cn')

/** 创建测试用临时目录，并登记到用例清理列表中。 */
async function createTempDir() {
  const dir = await mkdtemp(path.join(tmpdir(), 'i18n-ai-translator-'))
  tempDirs.push(dir)
  return dir
}

async function listFiles(dir: string, root = dir): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const filePath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        return listFiles(filePath, root)
      }

      if (entry.isFile()) {
        return [path.relative(root, filePath).split(path.sep).join('/')]
      }

      return []
    })
  )

  return files.flat().sort()
}

async function readFixtureMessage(relativeFile: string) {
  const source = await readFile(path.join(zhCnFixtureDir, relativeFile), 'utf8')

  return parseLocaleSource(source, relativeFile)
}

async function readFixtureMessages() {
  const files = await listFiles(zhCnFixtureDir)
  const entries = await Promise.all(
    files.map(async (file) => [file, await readFixtureMessage(file)] as const)
  )

  return Object.fromEntries(entries)
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

describe('resolveOptions', () => {
  it('resolves directories from root and target language', () => {
    const options = resolveOptions({
      root: './lang',
      base: 'zh-cn',
      target: 'en',
      overwrite: false,
      prune: false,
      dryRun: false,
      batchSize: 100,
      model: 'gpt-4.1-mini'
    })

    expect(options.base).toBe('zh-cn')
    expect(options.target).toBe('en')
    expect(options.baseDir).toBe(path.resolve('./lang/zh-cn'))
    expect(options.targetDir).toBe(path.resolve('./lang/en'))
    expect(options.cacheDir).toBe(path.resolve('./.translation-cache'))
    expect(options.batchSize).toBe(100)
  })

  it('allows explicit target directory without target language', () => {
    const options = resolveOptions({
      base: 'zh-cn',
      target: '',
      baseDir: './zh-cn',
      targetDir: './en',
      overwrite: false,
      prune: false,
      dryRun: false,
      batchSize: 100,
      model: 'gpt-4.1-mini'
    })

    expect(options.target).toBe('')
    expect(options.baseDir).toBe(path.resolve('./zh-cn'))
    expect(options.targetDir).toBe(path.resolve('./en'))
  })

  it('rejects missing target and invalid batch size', () => {
    expect(() =>
      resolveOptions({
        base: 'zh-cn',
        target: '',
        overwrite: false,
        prune: false,
        dryRun: false,
        batchSize: 100,
        model: 'gpt-4.1-mini'
      })
    ).toThrow('Missing required option')
    expect(() =>
      resolveOptions({
        base: 'zh-cn',
        target: 'en',
        overwrite: false,
        prune: false,
        dryRun: false,
        batchSize: 0,
        model: 'gpt-4.1-mini'
      })
    ).toThrow('--batch-size must be a positive integer')
  })
})

describe('locale source parsing and formatting', () => {
  it('parses json, esm, and commonjs locale files', () => {
    expect(parseLocaleSource('{"hello":"你好"}', 'index.json')).toEqual({
      hello: '你好'
    })
    expect(
      parseLocaleSource(
        "export default { common: { ok: '确定' }, 'dash-key': `值` }",
        'index.ts'
      )
    ).toEqual({ common: { ok: '确定' }, 'dash-key': '值' })
    expect(
      parseLocaleSource("module.exports = { hello: '你好' }", 'index.js')
    ).toEqual({ hello: '你好' })
  })

  it('parses copied zh-cn locale fixture files', async () => {
    const messages = await readFixtureMessages()
    const flattenedItems = Object.entries(messages).flatMap(([file, message]) =>
      flattenMessages(message).map((item) => ({ ...item, file }))
    )

    expect(Object.keys(messages)).toEqual(
      expect.arrayContaining([
        'common.ts',
        'request.ts',
        'router/route-a.ts',
        'router/route-b.ts'
      ])
    )
    expect(flattenedItems.length).toBeGreaterThan(50)
    expect(
      flattenedItems.find(
        (item) => item.file === 'common.ts' && item.keyPath === 'export'
      )
    ).toMatchObject({ source: '导出' })
    expect(
      flattenedItems.find(
        (item) =>
          item.file === 'request.ts' && item.keyPath === 'operationSuccessful'
      )
    ).toMatchObject({ source: '操作成功' })
  })

  it('recursively outputs fixture files as locale messages', async () => {
    await expect(readFixtureMessages()).resolves.toEqual({
      'common.ts': {
        $Days: '{n}天',
        day: '天',
        today: '今日',
        yesterday: '昨日',
        lastWeek: '上周',
        thisWeek: '本周',
        lastMonth: '上月',
        thisMonth: '本月',
        lastQuarter: '上季',
        thisQuarter: '本季',
        lastYear: '去年',
        thisYear: '今年',
        last$Days: '近{n}日',
        last$Months: '近{n}月',
        last$Years: '近{n}年',
        halfMonth: '近半月',
        halfYear: '近半年',
        n$Month: '{n}月',
        customTime: '自定义时间',
        export: '导出',
        chart: '图表',
        table: '表格',
        exportChart: '@.capitalize:common.export@:common.chart',
        exportTable: '@.capitalize:common.export@:common.table',
        distanceUnit: {
          meter: '米',
          kilometer: '千米',
          kilometer_alt: '公里',
          foot: '英尺',
          mile: '英里',
          nauticalMile: '海里',
          centimeter: '厘米',
          millimeter: '毫米'
        },
        statistics: {
          YoY: '同比',
          MoM: '环比',
          QoQ: '环比',
          date: '日期',
          time: '次',
          second: '秒',
          minute: '分钟',
          hour: '小时',
          proportion: '占比',
          unit: '单位',
          total: '总计',
          average: '平均'
        }
      },
      'request.ts': {
        operationSuccessful: '操作成功',
        automaticCancellationDueToDuplicateRequest: '因为请求重复被自动取消',
        interfaceRedirected: '接口重定向了！',
        incorrectParameter: '参数不正确！',
        notLoggedInOrTimedOut: '您未登录，或者登录已经超时，请先登录！',
        youDoNotHavePermissionToOperate: '您没有权限操作！',
        errorRequestingAddress: '请求地址出错',
        requestTimedOut: '请求超时！',
        theSameDataAlreadyExistsInTheSystem: '系统已存在相同数据！',
        serverInternalError: '服务器内部错误！',
        serviceNotImplemented: '服务未实现！',
        gatewayError: '网关错误！',
        serviceUnavailable: '服务不可用！',
        theServiceIsTemporarilyUnavailablePleaseTryAgainLater:
          '服务暂时无法访问，请稍后再试！',
        httpVersionIsNotSupported: 'HTTP版本不受支持！',
        abnormalProblem: '异常问题，请联系网站管理员！',
        networkRequestTimeout: '网络请求超时！',
        serverException: '服务端异常！',
        youAreDisconnected: '您断网了！'
      },
      'router/route-a.ts': {
        backendManagement: '后台管理',
        runningStatus: '运行状态',
        devices: {
          title: '设备',
          runStatus: {
            offline: '离线',
            online: '在线',
            abnormal: '异常'
          },
          workStatus: {
            close: '关闭',
            open: '开启'
          },
          userName: '设备账号',
          password: '设备密码'
        },
        deviceName: '设备名称',
        deviceType: '设备类型',
        deviceStatus: '设备状态',
        deviceArea: '设备区域',
        deviceIP: '设备IP',
        devicePort: '设备端口',
        deviceNum: '设备编号',
        longitudeAndLatitude: '经纬度',
        batteryCode: '电池编号',
        confirmOpenPower$: '请确认是否开启设备「{name}」的电源？',
        confirmClosePower$: '请确认是否关闭设备「{name}」的电源？',
        panoramaChannel: '{n}通道',
        composableCharts: {
          targetSliceList: {
            time: '时间',
            device: '设备',
            size: '大小',
            dangerLevel: '危险等级',
            timeOptions: {
              last10minutes: '近10分钟',
              last1hour: '近1小时',
              before1hour: '1小时之前'
            },
            targetSizeOptions: {
              all: '全选',
              point: '点目标',
              area: '面目标'
            }
          }
        }
      },
      'router/route-b.ts': {}
    })
  })

  it('parses linked messages and placeholders from fixture files', async () => {
    const common = await readFixtureMessage('common.ts')
    const route = await readFixtureMessage('router/route-a.ts')

    expect(getValue(common, 'exportChart')).toBe(
      '@.capitalize:common.export@:common.chart'
    )
    expect(getValue(common, '$Days')).toBe('{n}天')
    expect(getValue(route, 'confirmOpenPower$')).toBe(
      '请确认是否开启设备「{name}」的电源？'
    )
    expect(getValue(route, 'panoramaChannel')).toBe('{n}通道')
  })

  it('parses deeply nested fixture values', async () => {
    const common = await readFixtureMessage('common.ts')
    const route = await readFixtureMessage('router/route-a.ts')

    expect(getValue(common, 'distanceUnit.nauticalMile')).toBe('海里')
    expect(getValue(common, 'statistics.average')).toBe('平均')
    expect(getValue(route, 'devices.runStatus.offline')).toBe('离线')
    expect(
      getValue(
        route,
        'composableCharts.targetSliceList.timeOptions.last10minutes'
      )
    ).toBe('近10分钟')
  })

  it('rejects unsupported locale values', () => {
    expect(() =>
      parseLocaleSource('export default { count: 1 }', 'index.ts')
    ).toThrow('Unsupported i18n value')
  })

  it('formats json and ts locale sources', async () => {
    const common = await readFixtureMessage('common.ts')

    await expect(formatLocaleSource({ hello: 'Hi' }, 'json')).resolves.toBe(
      '{\n  "hello": "Hi"\n}\n'
    )
    await expect(
      formatLocaleSource(common, 'esm').then((source) =>
        parseLocaleSource(source, 'common.ts')
      )
    ).resolves.toEqual(common)
  })
})

describe('message utilities', () => {
  it('flattens, reads, and writes nested messages', () => {
    const messages = { common: { ok: '确定' } }

    expect(flattenMessages(messages)).toEqual([
      { keyPath: 'common.ok', source: '确定' }
    ])
    expect(getValue(messages, 'common.ok')).toBe('确定')

    setValue(messages, 'common.cancel', '取消')
    expect(messages).toEqual({ common: { ok: '确定', cancel: '取消' } })
  })

  it('finds missing items and supports overwrite mode', () => {
    const base = { common: { ok: '确定', cancel: '取消' } }
    const target = { common: { ok: 'OK', cancel: '' } }

    expect(getMissingItems(base, target, false)).toEqual([
      { keyPath: 'common.cancel', source: '取消' }
    ])
    expect(getMissingItems(base, target, true)).toEqual([
      { keyPath: 'common.ok', source: '确定' },
      { keyPath: 'common.cancel', source: '取消' }
    ])
  })

  it('prunes target messages to base shape', () => {
    expect(
      pruneToBase(
        { common: { ok: '确定' }, title: '标题' },
        { common: { ok: 'OK', extra: 'Extra' }, extraRoot: 'Extra' }
      )
    ).toEqual({ common: { ok: 'OK' } })
  })

  it('extracts common placeholders and framework-specific syntax', () => {
    expect([
      ...extractPlaceholders('Hi {name}, %s @.capitalize:common.ok')
    ]).toEqual(['{name}', '%s'])

    expect([
      ...extractPlaceholders('Hi {name}, %s @.capitalize:common.ok', 'vue-i18n')
    ]).toEqual(['{name}', '%s', '@.capitalize:common.ok'])

    expect([
      ...extractPlaceholders('Hello {{name}}, see $t(common.ok)', 'i18next')
    ]).toEqual(expect.arrayContaining(['{{name}}', '$t(common.ok)']))
  })

  it('ignores literal interpolation so its content stays translatable', () => {
    expect([...extractPlaceholders("影响{'次数'}，{count}")]).toEqual([
      '{count}'
    ])
    expect([...extractPlaceholders('{"电池"} {name}')]).toEqual(['{name}'])
  })

  it('validates framework-specific linked syntax via compareMessageShape', () => {
    expect(
      compareMessageShape(
        { message: 'Hi {name}', linked: '@:common.ok' },
        { message: 'Hi', linked: '@:common.cancel', extra: 'Extra' },
        'index.ts',
        'vue-i18n'
      )
    ).toEqual([
      {
        file: 'index.ts',
        keyPath: 'message',
        message: 'missing placeholder {name}'
      },
      {
        file: 'index.ts',
        keyPath: 'linked',
        message: 'missing placeholder @:common.ok'
      },
      {
        file: 'index.ts',
        keyPath: 'linked',
        message: 'unexpected placeholder @:common.cancel'
      },
      { file: 'index.ts', keyPath: 'extra', message: 'extra target key' }
    ])
  })

  it('chunks arrays', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })
})

describe('locale files and cache', () => {
  it('lists locale files recursively', async () => {
    const dir = await createTempDir()
    await writeFile(path.join(dir, 'index.json'), '{}')
    await writeFile(path.join(dir, 'common.ts'), 'export default {}')
    await mkdir(path.join(dir, 'router'), { recursive: true })
    await writeFile(path.join(dir, 'router', 'home.js'), 'module.exports = {}')
    await writeFile(path.join(dir, 'router', 'ignored.d.ts'), 'export {}')
    await writeFile(path.join(dir, 'README.md'), '# ignored')

    await expect(listLocaleFiles(dir)).resolves.toEqual([
      'common.ts',
      'index.json',
      'router/home.js'
    ])
  })

  it('reads missing files as empty locale files', async () => {
    const dir = await createTempDir()

    await expect(readLocaleFile(dir, 'index.json')).resolves.toEqual({
      exists: false,
      message: {},
      format: 'json'
    })
  })

  it('writes locale files and translation cache', async () => {
    const dir = await createTempDir()
    const cacheDir = path.join(dir, '.translation-cache')

    await writeLocaleFile(dir, 'index.json', { hello: 'Hi' }, 'json')
    await expect(readFile(path.join(dir, 'index.json'), 'utf8')).resolves.toBe(
      '{\n  "hello": "Hi"\n}\n'
    )

    await expect(readCache(cacheDir, 'zh-cn', 'en')).resolves.toEqual({})
    await writeCache(cacheDir, 'zh-cn', 'en', { key: 'value' })
    await expect(readCache(cacheDir, 'zh-cn', 'en')).resolves.toEqual({
      key: 'value'
    })
  })
})
