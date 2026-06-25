# i18n-ai-translator

[中文文档](./README.zh-CN.md)

LLM-based locale file synchronizer and translator.

It recursively reads `.ts`, `.js`, and `.json` locale files from a base locale
directory, writes corresponding files at the same relative paths in the target
locale directory, and fills missing translations with an OpenAI-compatible LLM
through Vercel AI SDK.

## Supported File Formats

- `.ts` / `.js` with `export default { ... }`
- `.ts` / `.js` with `module.exports = { ... }`
- `.json`

Only string leaves are translated. Nested object shape, key paths, and
placeholders (including vue-i18n linked message syntax) are validated before
files are written. Use `--framework` to tell the model which i18n framework the
target project uses so its specific syntax is preserved.

## Run with npx (no install)

Run it straight from GitHub without cloning or installing globally (replace
`<your-username>` with the actual repo path):

```bash
# Default branch
npx github:Kafuu-Chinocya/i18n-ai-translator translate --help

# Pin a branch / tag / commit
npx github:Kafuu-Chinocya/i18n-ai-translator#v0.0.1 translate ...
```

Use it inside a target project, passing LLM config via environment variables:

```bash
cd /path/to/other-project
LLM_API_KEY=sk-xxx \
LLM_BASE_URL=https://api.openai.com/v1 \
LLM_MODEL=gpt-4.1-mini \
npx github:Kafuu-Chinocya/i18n-ai-translator translate \
  --root ./src/lang --base zh-cn --target en --framework vue-i18n --dry-run
```

> The prebuilt `dist/` output is committed to the repo, so npx runs it directly
> without a build step; the first run installs runtime dependencies (a bit slow)
> and later runs are cached.

## Build and Global Install

The repository is developed with pnpm, but the build output `dist/index.js` is
plain node and can be installed globally with npm and used in any directory.

```bash
# Build inside the tool directory (outputs to dist/)
pnpm install
pnpm build

# Register as a global command (run in the tool directory)
npm link
```

Then run it from any project directory:

```bash
cd /path/to/other-project
i18n-ai-translator translate --root ./src/lang --base zh-cn --target en --framework vue-i18n --dry-run
i18n-ai-translator check    --root ./src/lang --base zh-cn --target en
```

Unlink with `npm unlink -g i18n-ai-translator`. After changing source, just run
`pnpm build` again; no need to re-link.

> Path options (`--root` / `--base-dir` / `--target-dir`) resolve relative to
> your current working directory.

## Run Logs

Each run records model output and errors under the system temp directory
(`<tmp>/i18n-ai-translator-logs/`):

- On **failure**: the log is kept and its path is printed to the terminal
  (`Logs saved to: ...`) so you can inspect the raw model responses.
- On **successful completion**: that run's log is deleted automatically.

## Commands

For this repository:

```bash
pnpm cli translate --root ../packages/locales/lang --base zh-cn --target en --dry-run
pnpm cli translate --root ../packages/locales/lang --base zh-cn --target en
pnpm cli check --root ../packages/locales/lang --base zh-cn --target en
```

For another project:

```bash
pnpm cli translate --root ../other-system/src/lang --base zh-cn --target en

pnpm cli translate -- \
  --base-dir ../other-system/src/lang/zh-cn \
  --target-dir ../other-system/src/lang/en
```

## Environment

```bash
LLM_API_KEY=...
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4.1-mini
```

`OPENAI_API_KEY` is also supported when `LLM_API_KEY` is not set.

## Options

- `--root <dir>`: locale root containing `<base>` and `<target>` folders
- `--base <language>`: base locale folder under `--root`
- `--target <language>`: target locale folder under `--root`
- `--base-dir <dir>`: explicit base locale directory
- `--target-dir <dir>`: explicit target locale directory
- `--cache-dir <dir>`: cache directory, defaults near the locale root
- `--batch-size <number>`: LLM batch size, defaults to `100`
- `--model <model>`: overrides `LLM_MODEL`
- `--base-url <url>`: overrides `LLM_BASE_URL`
- `--api-key <key>`: overrides `LLM_API_KEY` / `OPENAI_API_KEY`
- `--glossary <text>`: adds terminology guidance
- `--framework <name>`: target i18n framework whose message syntax must be preserved (e.g. `vue-i18n`, `react-i18next`, `i18next`, `formatjs`)
- `--overwrite`: re-translate existing target strings
- `--prune`: remove target keys not present in base files
- `--dry-run`: print pending translations without calling the LLM
