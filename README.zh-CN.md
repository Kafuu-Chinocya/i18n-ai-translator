# i18n-ai-translator

基于 LLM 的国际化语言包同步和翻译 CLI。

它会递归读取基准语言目录中的 `.ts`、`.js` 和 `.json` 多语言文件，在目标语言目录写入对应的相对路径文件，并通过 OpenAI 兼容接口补齐缺失翻译。底层调用 Vercel AI SDK。

## 支持的文件格式

- `.ts` / `.js`，内容为 `export default { ... }`
- `.ts` / `.js`，内容为 `module.exports = { ... }`
- `.json`

工具只会翻译字符串叶子节点。写入前会校验嵌套对象结构、key path 与占位符（含 vue-i18n linked message 等链接语法）。可通过 `--framework` 指定目标项目使用的 i18n 框架，提示模型在翻译时保留其特定语法。

## 通过 npx 使用（无需安装）

无需克隆或全局安装，直接从 GitHub 运行：

```bash
# 默认分支
npx github:Kafuu-Chinocya/i18n-ai-translator translate --help

# 指定分支 / tag / commit
npx github:Kafuu-Chinocya/i18n-ai-translator#v0.0.1 translate ...
```

在目标项目目录下使用，并通过环境变量提供 LLM 配置：

```bash
cd /path/to/other-project
LLM_API_KEY=sk-xxx \
LLM_BASE_URL=https://api.openai.com/v1 \
LLM_MODEL=gpt-4.1-mini \
npx github:Kafuu-Chinocya/i18n-ai-translator translate \
  --root ./src/lang --base zh-cn --target en --framework vue-i18n --dry-run
```

> 仓库已随源码提供构建产物 `dist/`，npx 会直接运行它，无需现场构建；首次拉取会安装运行依赖，稍慢属于正常现象，之后会走缓存。

## 构建与全局安装

本仓库自身用 pnpm 开发,但构建产物是纯 node 的 `dist/index.js`,可用 npm 全局安装后在任意目录使用。

```bash
# 在工具目录构建(产物输出到 dist/)
pnpm install
pnpm build

# 注册为全局命令(在工具目录执行)
npm link
```

之后在任意项目目录直接调用:

```bash
cd /path/to/other-project
i18n-ai-translator translate --root ./src/lang --base zh-cn --target en --framework vue-i18n --dry-run
i18n-ai-translator check    --root ./src/lang --base zh-cn --target en
```

取消链接:`npm unlink -g i18n-ai-translator`。修改源码后重新执行 `pnpm build` 即可,无需重新 link。

> 路径参数(`--root` / `--base-dir` / `--target-dir`)相对你当前所在目录解析。

## 命令

在本仓库中运行：

```bash
pnpm cli translate --root ../packages/locales/lang --base zh-cn --target en --dry-run
pnpm cli translate --root ../packages/locales/lang --base zh-cn --target en
pnpm cli check --root ../packages/locales/lang --base zh-cn --target en
```

用于其他项目：

```bash
pnpm cli translate --root ../other-system/src/lang --base zh-cn --target en

pnpm cli translate -- \
  --base-dir ../other-system/src/lang/zh-cn \
  --target-dir ../other-system/src/lang/en
```

## 环境变量

```bash
LLM_API_KEY=...
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4.1-mini
```

当未设置 `LLM_API_KEY` 时，也支持使用 `OPENAI_API_KEY`。

## 参数

- `--root <dir>`：语言包根目录，内部包含 `<base>` 和 `<target>` 语言目录
- `--base <language>`：`--root` 下的基准语言目录，默认 `zh-cn`
- `--target <language>`：`--root` 下的目标语言目录
- `--base-dir <dir>`：显式指定基准语言目录
- `--target-dir <dir>`：显式指定目标语言目录
- `--cache-dir <dir>`：翻译缓存目录，默认在语言包根目录附近
- `--batch-size <number>`：LLM 批量翻译条数，默认 `100`
- `--model <model>`：覆盖 `LLM_MODEL`
- `--base-url <url>`：覆盖 `LLM_BASE_URL`
- `--api-key <key>`：覆盖 `LLM_API_KEY` / `OPENAI_API_KEY`
- `--glossary <text>`：提供额外术语表或翻译偏好
- `--framework <name>`：目标项目使用的 i18n 框架（如 `vue-i18n`、`react-i18next`、`i18next`、`formatjs`），用于提示模型保留其特定语法
- `--overwrite`：重新翻译已有目标字符串
- `--prune`：移除目标语言中不存在于基准语言的 key
- `--dry-run`：只打印待翻译内容，不调用 LLM，也不写入文件

## 运行日志

每次运行会在系统临时目录(`<tmp>/i18n-ai-translator-logs/`)记录模型输出和报错:

- 运行**出错**:保留日志,并在终端打印日志文件路径(`Logs saved to: ...`),便于排查模型返回内容;
- 运行**正常结束**:自动删除该次日志。

## 常用流程

先使用 `--dry-run` 查看缺失翻译数量：

```bash
pnpm cli translate --root ./lang --base zh-cn --target en --dry-run
```

确认后执行翻译：

```bash
pnpm cli translate --root ./lang --base zh-cn --target en
```

翻译完成后检查目标语言包：

```bash
pnpm cli check --root ./lang --base zh-cn --target en
```
