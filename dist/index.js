#!/usr/bin/env node

// src/cli.ts
import { cac } from "cac";

// src/commands/check.ts
import path2 from "path";

// src/locale/files.ts
import { access, mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import fg from "fast-glob";

// src/utils/fs.ts
function isFileNotFound(error) {
  return error.code === "ENOENT";
}

// src/locale/source.ts
import prettier from "prettier";
import {
  Project,
  SyntaxKind
} from "ts-morph";

// src/locale/messages.ts
function flattenMessages(value, prefix = "") {
  return Object.entries(value).flatMap(([key, item]) => {
    const keyPath = prefix ? `${prefix}.${key}` : key;
    if (typeof item === "string") {
      return [{ keyPath, source: item }];
    }
    if (isPlainObject(item)) {
      return flattenMessages(item, keyPath);
    }
    return [];
  });
}
function getValue(value, keyPath) {
  return keyPath.split(".").reduce((acc, key) => {
    if (!isPlainObject(acc)) return void 0;
    return acc[key];
  }, value);
}
function setValue(value, keyPath, item) {
  const keys = keyPath.split(".");
  const lastKey = keys.pop();
  if (!lastKey) return;
  let current2 = value;
  keys.forEach((key) => {
    const next = current2[key];
    if (!isPlainObject(next)) {
      current2[key] = {};
    }
    current2 = current2[key];
  });
  current2[lastKey] = item;
}
function pruneToBase(base, target) {
  const result = {};
  Object.entries(base).forEach(([key, baseValue]) => {
    const targetValue = target[key];
    if (typeof baseValue === "string") {
      if (typeof targetValue === "string") {
        result[key] = targetValue;
      }
      return;
    }
    if (isPlainObject(baseValue)) {
      result[key] = pruneToBase(
        baseValue,
        isPlainObject(targetValue) ? targetValue : {}
      );
    }
  });
  return result;
}
function getMissingItems(base, target, overwrite) {
  return flattenMessages(base).filter((item) => {
    const targetValue = getValue(target, item.keyPath);
    return overwrite || typeof targetValue !== "string" || targetValue.length === 0;
  });
}
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/locale/source.ts
function parseLocaleSource(source, filePath) {
  if (filePath.endsWith(".json")) {
    return JSON.parse(source);
  }
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile(filePath, source, {
    overwrite: true
  });
  const expression = getDefaultObjectExpression(sourceFile);
  if (!expression) {
    throw new Error(
      `${filePath} must export an object literal through "export default" or "module.exports"`
    );
  }
  return objectLiteralToValue(expression);
}
async function formatLocaleSource(value, format) {
  if (format === "json") {
    return formatJson(value);
  }
  const config = await prettier.resolveConfig(process.cwd());
  const assignment = format === "cjs" ? "module.exports = " : "export default ";
  return prettier.format(`${assignment}${toTsLiteral(value)}
`, {
    ...config,
    parser: "typescript",
    semi: false,
    singleQuote: true
  });
}
function getLocaleFormat(source, filePath) {
  if (filePath.endsWith(".json")) return "json";
  return /\bmodule\.exports\s*=/.test(source) ? "cjs" : "esm";
}
function getDefaultFormat(filePath) {
  if (filePath.endsWith(".json")) return "json";
  if (filePath.endsWith(".cjs")) return "cjs";
  return "esm";
}
function getDefaultObjectExpression(sourceFile) {
  const exportAssignment = sourceFile.getExportAssignment(
    (node) => !node.isExportEquals()
  );
  const exportExpression = exportAssignment?.getExpression();
  if (exportExpression?.isKind(SyntaxKind.ObjectLiteralExpression)) {
    return exportExpression;
  }
  const moduleExports = sourceFile.getFirstDescendant((node) => {
    if (!node.isKind(SyntaxKind.BinaryExpression)) return false;
    if (node.getOperatorToken().getText() !== "=") return false;
    const left = node.getLeft().getText();
    return left === "module.exports" || left === "exports.default";
  });
  if (moduleExports?.isKind(SyntaxKind.BinaryExpression)) {
    const right = moduleExports.getRight();
    if (right.isKind(SyntaxKind.ObjectLiteralExpression)) {
      return right;
    }
  }
  return void 0;
}
function objectLiteralToValue(node) {
  const result = {};
  node.getProperties().forEach((property) => {
    if (!property.isKind(SyntaxKind.PropertyAssignment)) {
      return;
    }
    const name = getPropertyName(property);
    const initializer = property.getInitializer();
    if (!initializer) return;
    if (initializer.isKind(SyntaxKind.StringLiteral) || initializer.isKind(SyntaxKind.NoSubstitutionTemplateLiteral)) {
      result[name] = initializer.getLiteralText();
      return;
    }
    if (initializer.isKind(SyntaxKind.ObjectLiteralExpression)) {
      result[name] = objectLiteralToValue(initializer);
      return;
    }
    throw new Error(
      `Unsupported i18n value at key "${name}": ${initializer.getText()}`
    );
  });
  return result;
}
function getPropertyName(property) {
  const nameNode = property.getNameNode();
  if (nameNode.isKind(SyntaxKind.StringLiteral) || nameNode.isKind(SyntaxKind.NoSubstitutionTemplateLiteral)) {
    return nameNode.getLiteralText();
  }
  return property.getName();
}
function formatJson(value) {
  return `${JSON.stringify(value, null, 2)}
`;
}
function toTsLiteral(value, indent = 0) {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (!isPlainObject(value)) {
    return "undefined";
  }
  const entries = Object.entries(value);
  if (entries.length === 0) {
    return "{}";
  }
  const pad = "  ".repeat(indent);
  const nextPad = "  ".repeat(indent + 1);
  const lines = entries.map(([key, item]) => {
    return `${nextPad}${formatObjectKey(key)}: ${toTsLiteral(item, indent + 1)}`;
  });
  return `{
${lines.join(",\n")}
${pad}}`;
}
function formatObjectKey(key) {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
}

// src/locale/files.ts
async function listLocaleFiles(dir) {
  const files = await fg(["**/*.{ts,js,json}", "!**/*.d.ts"], {
    cwd: dir,
    absolute: false,
    onlyFiles: true
  });
  return files.sort();
}
async function readLocaleFile(dir, relativeFile) {
  const filePath = path.join(dir, relativeFile);
  try {
    const source = await readFile(filePath, "utf8");
    return {
      exists: true,
      message: parseLocaleSource(source, filePath),
      format: getLocaleFormat(source, filePath)
    };
  } catch (error) {
    if (isFileNotFound(error)) {
      return {
        exists: false,
        message: {},
        format: getDefaultFormat(filePath)
      };
    }
    throw error;
  }
}
async function writeLocaleFile(dir, relativeFile, value, format) {
  const filePath = path.join(dir, relativeFile);
  await mkdir(path.dirname(filePath), { recursive: true });
  const source = await formatLocaleSource(value, format);
  await writeFile(filePath, source);
}

// src/locale/validation.ts
var COMMON_PLACEHOLDER_PATTERNS = [/\{(?!\s*['"])[^{}]+\}/g, /%[sdifjoO]/g];
var FRAMEWORK_PLACEHOLDER_PATTERNS = {
  "vue-i18n": [/@(?:\.[A-Za-z]+)?:[A-Za-z0-9_.$-]+/g],
  i18next: [/\{\{[^{}]+\}\}/g, /\$t\([^()]+\)/g],
  "react-i18next": [/\{\{[^{}]+\}\}/g, /\$t\([^()]+\)/g]
};
function getFrameworkPatterns(framework) {
  if (!framework) {
    return [];
  }
  return FRAMEWORK_PLACEHOLDER_PATTERNS[framework.toLowerCase()] ?? [];
}
function extractPlaceholders(value, framework) {
  const patterns = [
    ...COMMON_PLACEHOLDER_PATTERNS,
    ...getFrameworkPatterns(framework)
  ];
  return new Set(
    patterns.flatMap(
      (pattern) => [...value.matchAll(pattern)].map((match) => match[0])
    )
  );
}
function compareMessageShape(base, target, file, framework) {
  const issues = [];
  const baseItems = flattenMessages(base);
  const targetItems = flattenMessages(target);
  const baseKeySet = new Set(baseItems.map((item) => item.keyPath));
  const targetKeySet = new Set(targetItems.map((item) => item.keyPath));
  baseItems.forEach((item) => {
    const targetValue = getValue(target, item.keyPath);
    if (typeof targetValue !== "string") {
      issues.push({
        file,
        keyPath: item.keyPath,
        message: "missing target translation"
      });
      return;
    }
    const sourcePlaceholders = extractPlaceholders(item.source, framework);
    const targetPlaceholders = extractPlaceholders(targetValue, framework);
    sourcePlaceholders.forEach((placeholder) => {
      if (!targetPlaceholders.has(placeholder)) {
        issues.push({
          file,
          keyPath: item.keyPath,
          message: `missing placeholder ${placeholder}`
        });
      }
    });
    targetPlaceholders.forEach((placeholder) => {
      if (!sourcePlaceholders.has(placeholder)) {
        issues.push({
          file,
          keyPath: item.keyPath,
          message: `unexpected placeholder ${placeholder}`
        });
      }
    });
    if (targetValue.length === 0) {
      issues.push({
        file,
        keyPath: item.keyPath,
        message: "empty translation"
      });
    }
  });
  targetKeySet.forEach((keyPath) => {
    if (!baseKeySet.has(keyPath)) {
      issues.push({ file, keyPath, message: "extra target key" });
    }
  });
  return issues;
}

// src/commands/check.ts
async function check(options) {
  const baseFiles = await listLocaleFiles(options.baseDir);
  const targetFiles = await listLocaleFiles(options.targetDir);
  const targetFileSet = new Set(targetFiles);
  const baseFileSet = new Set(baseFiles);
  const issues = [];
  for (const file of baseFiles) {
    if (!targetFileSet.has(file)) {
      issues.push({
        file,
        keyPath: "",
        message: `missing target file ${path2.join(options.targetDir, file)}`
      });
      continue;
    }
    const [baseFile, targetFile] = await Promise.all([
      readLocaleFile(options.baseDir, file),
      readLocaleFile(options.targetDir, file)
    ]);
    issues.push(
      ...compareMessageShape(
        baseFile.message,
        targetFile.message,
        file,
        options.framework
      )
    );
  }
  targetFiles.forEach((file) => {
    if (!baseFileSet.has(file)) {
      issues.push({ file, keyPath: "", message: "extra target file" });
    }
  });
  if (issues.length > 0) {
    const errorMessage = `Found ${issues.length} i18n issue(s):
${issues.map(
      (issue) => [issue.file, issue.keyPath, issue.message].filter(Boolean).join(" - ")
    ).join("\n")}`;
    throw new Error(errorMessage);
  }
  console.log(`i18n check passed: ${options.baseDir} -> ${options.targetDir}`);
}

// src/commands/translate.ts
import { createOpenAI } from "@ai-sdk/openai";
import {
  NoObjectGeneratedError,
  extractJsonMiddleware,
  generateObject,
  generateText,
  wrapLanguageModel
} from "ai";
import { z } from "zod";

// src/logger.ts
import { appendFile, mkdir as mkdir2, rm, writeFile as writeFile2 } from "fs/promises";
import os from "os";
import path3 from "path";
var RunLogger = class {
  /** 日志所在目录。 */
  dir;
  /** 日志文件完整路径。 */
  filePath;
  /** 延迟创建文件,确保只在真正写入时才落盘。 */
  ready = null;
  constructor(name, dir) {
    this.dir = dir ?? path3.join(os.tmpdir(), "i18n-ai-translator-logs");
    const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    this.filePath = path3.join(this.dir, `${name}-${stamp}-${process.pid}.log`);
  }
  ensure() {
    if (!this.ready) {
      this.ready = (async () => {
        await mkdir2(this.dir, { recursive: true });
        await writeFile2(
          this.filePath,
          `# i18n-ai-translator log
# started ${(/* @__PURE__ */ new Date()).toISOString()}

`
        );
      })();
    }
    return this.ready;
  }
  /** 写入一行日志;日志失败绝不影响主流程。 */
  async write(level, message) {
    try {
      await this.ensure();
      await appendFile(
        this.filePath,
        `[${(/* @__PURE__ */ new Date()).toISOString()}] ${level} ${message}
`
      );
    } catch {
    }
  }
  info(message) {
    return this.write("INFO", message);
  }
  warn(message) {
    return this.write("WARN", message);
  }
  error(message) {
    return this.write("ERROR", message);
  }
  /** 记录一段模型输出(单独成块,便于排查)。 */
  async modelOutput(label, content) {
    try {
      await this.ensure();
      await appendFile(
        this.filePath,
        `[${(/* @__PURE__ */ new Date()).toISOString()}] MODEL ${label}
${content}

`
      );
    } catch {
    }
  }
  /** 删除日志文件(正常结束时调用)。 */
  async discard() {
    try {
      await rm(this.filePath, { force: true });
    } catch {
    }
  }
};
var current = null;
function startLogger(name, dir) {
  current = new RunLogger(name, dir);
  return current;
}
function getLogger() {
  return current;
}
async function endLogger(success) {
  const logger = current;
  current = null;
  if (!logger) {
    return null;
  }
  if (success) {
    await logger.discard();
    return null;
  }
  return logger.filePath;
}

// src/translation-cache.ts
import { createHash } from "crypto";
import { mkdir as mkdir3, readFile as readFile2, writeFile as writeFile3 } from "fs/promises";
import path4 from "path";
async function readCache(cacheDir, base, target) {
  const cacheFile = getCacheFile(cacheDir, base, target);
  try {
    return JSON.parse(await readFile2(cacheFile, "utf8"));
  } catch (error) {
    if (isFileNotFound(error)) {
      return {};
    }
    throw error;
  }
}
async function writeCache(cacheDir, base, target, cache) {
  await mkdir3(cacheDir, { recursive: true });
  await writeFile3(getCacheFile(cacheDir, base, target), formatJson2(cache));
}
function getCacheKey(target, source, glossaryVersion) {
  return createHash("sha256").update([target, source, glossaryVersion || ""].join("\n")).digest("hex");
}
function getCacheFile(cacheDir, base, target) {
  return path4.join(cacheDir, `${base}__${target}.json`);
}
function formatJson2(value) {
  return `${JSON.stringify(value, null, 2)}
`;
}

// src/utils/arrays.ts
function chunk(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

// src/commands/translate.ts
var translationSchema = z.object({
  translations: z.record(z.string(), z.string())
});
function getTargetFormat(targetFile, baseFile) {
  return targetFile.exists ? targetFile.format : baseFile.format;
}
async function translate(options) {
  const files = await listLocaleFiles(options.baseDir);
  const cache = await readCache(options.cacheDir, options.base, options.target);
  const apiKey = options.apiKey;
  let changedFiles = 0;
  let translatedCount = 0;
  let cachedCount = 0;
  if (!options.dryRun && !apiKey) {
    throw new Error("Missing --api-key or LLM_API_KEY/OPENAI_API_KEY");
  }
  const llmApiKey = apiKey || "";
  const openai = options.dryRun ? null : createOpenAI({
    apiKey: llmApiKey,
    baseURL: options.baseURL
  });
  for (const file of files) {
    const baseFile = await readLocaleFile(options.baseDir, file);
    const targetFile = await readLocaleFile(options.targetDir, file);
    const targetMessage = options.prune ? pruneToBase(baseFile.message, targetFile.message) : targetFile.message;
    const missingItems = getMissingItems(
      baseFile.message,
      targetMessage,
      options.overwrite
    );
    if (missingItems.length === 0) {
      if (!options.dryRun && (options.prune || !targetFile.exists)) {
        await writeLocaleFile(
          options.targetDir,
          file,
          targetMessage,
          getTargetFormat(targetFile, baseFile)
        );
        changedFiles += 1;
      }
      continue;
    }
    console.log(`${file}: ${missingItems.length} item(s) to translate`);
    if (options.dryRun) {
      continue;
    }
    const uncachedItems = [];
    missingItems.forEach((item) => {
      const cacheKey = getCacheKey(
        options.target,
        item.source,
        options.glossary
      );
      const cached = cache[cacheKey];
      if (cached) {
        setValue(targetMessage, item.keyPath, cached);
        cachedCount += 1;
      } else {
        uncachedItems.push(item);
      }
    });
    for (const batch of chunk(uncachedItems, options.batchSize)) {
      const translatedItems = await translateBatch(batch, options, openai);
      const batchMap = new Map(batch.map((item) => [item.keyPath, item.source]));
      translatedItems.forEach((item) => {
        const source = batchMap.get(item.keyPath);
        if (!source) {
          throw new Error(`LLM returned unknown keyPath: ${item.keyPath}`);
        }
        setValue(targetMessage, item.keyPath, item.translation);
        cache[getCacheKey(options.target, source, options.glossary)] = item.translation;
        translatedCount += 1;
      });
    }
    const issues = compareMessageShape(
      baseFile.message,
      targetMessage,
      file,
      options.framework
    );
    const extraKeyIssues = issues.filter(
      (issue) => issue.message === "extra target key"
    );
    const fatalIssues = issues.filter(
      (issue) => issue.message !== "extra target key"
    );
    if (extraKeyIssues.length > 0) {
      const note = `${file}: ${extraKeyIssues.length} extra target key(s) not in base (use --prune to remove): ${extraKeyIssues.map((issue) => issue.keyPath).join(", ")}`;
      console.warn(note);
      await getLogger()?.warn(note);
    }
    if (fatalIssues.length > 0) {
      const details = fatalIssues.slice(0, 20).map((issue) => `${issue.file}:${issue.keyPath} ${issue.message}`).join("\n");
      throw new Error(
        `Validation failed after translating ${file}:
${details}`
      );
    }
    await writeLocaleFile(
      options.targetDir,
      file,
      targetMessage,
      getTargetFormat(targetFile, baseFile)
    );
    changedFiles += 1;
  }
  if (!options.dryRun) {
    await writeCache(options.cacheDir, options.base, options.target, cache);
  }
  console.log(
    [
      `Done. files=${changedFiles}`,
      `translated=${translatedCount}`,
      `cached=${cachedCount}`,
      `target=${options.target}`
    ].join(" ")
  );
}
function buildSystemPrompt(options) {
  return [
    "You are an i18n translation engine for a web application.",
    'You receive a JSON object whose "messages" field maps each key to its source string.',
    'Return a JSON object whose "translations" field maps the SAME keys to their translated strings.',
    "Use every key exactly once. Do not add, drop, or rename keys, and never change the keys themselves.",
    "Only the string values are translated.",
    "Preserve placeholders like {name}, {n}, %s, HTML tags, and line breaks.",
    `For literal interpolation wrappers like {'...'} or {"..."}, keep the braces and quotes but translate the text inside them.`,
    options.framework ? `This project uses the "${options.framework}" i18n framework. Preserve all of its special message syntax exactly as written in the source, including linked messages, interpolation, plural/select forms, and modifiers.` : "",
    "Do not translate product names, device models, protocol names, airport codes, or brand names.",
    "Use concise UI wording suitable for enterprise software.",
    options.glossary ? `Terminology glossary:
${options.glossary}` : ""
  ].filter(Boolean).join("\n");
}
function buildMessagesMap(items) {
  return Object.fromEntries(items.map((item) => [item.keyPath, item.source]));
}
function buildUserPrompt(items, options) {
  return JSON.stringify({
    sourceLanguage: options.base,
    targetLanguage: options.target,
    messages: buildMessagesMap(items)
  });
}
function sliceJsonObject(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    return null;
  }
  return text.slice(start, end + 1);
}
function extractJsonObject(text) {
  const json = sliceJsonObject(text);
  if (json === null) {
    throw new Error("LLM response did not contain a JSON object");
  }
  return json;
}
function createTranslationModel(openai, options) {
  return wrapLanguageModel({
    model: openai.chat(options.model),
    middleware: extractJsonMiddleware({
      transform: (text) => sliceJsonObject(text) ?? text
    })
  });
}
async function translateBatchAsText(items, options, openai) {
  const { text } = await generateText({
    model: openai.chat(options.model),
    system: [
      buildSystemPrompt(options),
      "Respond with ONLY a JSON object, no markdown and no code fences.",
      'The JSON shape must be: {"translations":{"<key>":"<translated string>"}}.'
    ].join("\n"),
    prompt: buildUserPrompt(items, options)
  });
  await getLogger()?.modelOutput("fallback raw text", text);
  return translationSchema.parse(JSON.parse(extractJsonObject(text))).translations;
}
async function translateBatch(items, options, openai) {
  const logger = getLogger();
  let translations;
  try {
    const { object } = await generateObject({
      model: createTranslationModel(openai, options),
      schema: translationSchema,
      system: buildSystemPrompt(options),
      prompt: buildUserPrompt(items, options)
    });
    translations = object.translations;
    await logger?.modelOutput(
      "generateObject translations",
      JSON.stringify(object.translations)
    );
  } catch (error) {
    if (!NoObjectGeneratedError.isInstance(error)) {
      throw error;
    }
    await logger?.warn(`Structured output failed: ${error.cause ?? "no cause"}`);
    await logger?.modelOutput(
      "raw text (structured output failed)",
      error.text ?? "<empty>"
    );
    console.warn(
      "Structured output failed; falling back to plain-text JSON parsing..."
    );
    translations = await translateBatchAsText(items, options, openai);
  }
  return items.map((item) => {
    const translation = translations[item.keyPath];
    if (typeof translation !== "string") {
      throw new Error(`LLM did not return keyPath: ${item.keyPath}`);
    }
    return { keyPath: item.keyPath, translation };
  });
}

// src/options.ts
import path5 from "path";
function resolveOptions(options) {
  if (!options.target && !options.targetDir) {
    throw new Error(
      "Missing required option: --target <language> or --target-dir <dir>"
    );
  }
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1) {
    throw new Error("--batch-size must be a positive integer");
  }
  const root = options.root ? path5.resolve(options.root) : void 0;
  const baseDir = path5.resolve(
    options.baseDir || path5.join(root || ".", options.base)
  );
  const targetDir = path5.resolve(
    options.targetDir || path5.join(root || ".", options.target)
  );
  const cacheDir = path5.resolve(
    options.cacheDir || (root ? path5.join(path5.dirname(root), ".translation-cache") : ".translation-cache")
  );
  return { ...options, baseDir, targetDir, cacheDir };
}

// src/cli.ts
function toResolvedOptions(options) {
  const batchSize = Array.isArray(options.batchSize) ? options.batchSize.at(-1) : options.batchSize;
  const cliOptions = {
    root: options.root,
    base: options.base || "zh-cn",
    target: options.target || "",
    baseDir: options.baseDir,
    targetDir: options.targetDir,
    cacheDir: options.cacheDir,
    overwrite: Boolean(options.overwrite),
    prune: Boolean(options.prune),
    dryRun: Boolean(options.dryRun),
    batchSize: batchSize ?? 100,
    model: options.model || process.env.LLM_MODEL || "gpt-4.1-mini",
    baseURL: options.baseUrl || process.env.LLM_BASE_URL,
    apiKey: options.apiKey || process.env.LLM_API_KEY || process.env.OPENAI_API_KEY,
    glossary: options.glossary,
    framework: options.framework
  };
  return resolveOptions(cliOptions);
}
function withLocaleOptions(command) {
  return command.option("--root <dir>", "Locale root containing base and target folders").option("--base <language>", "Base locale folder under root", {
    default: "zh-cn"
  }).option("--target <language>", "Target locale folder under root").option("--base-dir <dir>", "Explicit base locale directory").option("--target-dir <dir>", "Explicit target locale directory").option("--cache-dir <dir>", "Translation cache directory").option("--batch-size <number>", "Translation batch size", {
    default: 100,
    type: [Number]
  }).option("--model <model>", "LLM model", {
    default: process.env.LLM_MODEL || "gpt-4.1-mini"
  }).option("--base-url <url>", "OpenAI-compatible base URL", {
    default: process.env.LLM_BASE_URL
  }).option(
    "--api-key <key>",
    "LLM API key (overrides LLM_API_KEY/OPENAI_API_KEY)"
  ).option("--glossary <text>", "Extra terminology guidance").option(
    "--framework <name>",
    "Target i18n framework whose message syntax must be preserved (e.g. vue-i18n, react-i18next, i18next, formatjs)"
  ).option("--overwrite", "Re-translate existing target strings").option("--prune", "Remove target keys not present in base files").option(
    "--dry-run",
    "Print changes without calling the LLM or writing files"
  );
}
function createCli() {
  const cli = cac("i18n-ai-translator");
  withLocaleOptions(
    cli.command("translate", "Translate missing target locale messages")
  ).example(
    "pnpm cli translate --root ../packages/locales/lang --base zh-cn --target en --dry-run"
  ).action(async (options) => {
    await translate(toResolvedOptions(options));
  });
  withLocaleOptions(
    cli.command("check", "Validate target locale message shape")
  ).example(
    "pnpm cli check --root ../packages/locales/lang --base zh-cn --target en"
  ).example("pnpm cli check --base-dir ./lang/zh-cn --target-dir ./lang/en").action(async (options) => {
    await check(toResolvedOptions(options));
  });
  cli.help();
  return cli;
}

// src/index.ts
async function main() {
  const cli = createCli();
  if (process.argv.length <= 2) {
    cli.outputHelp();
    return;
  }
  cli.parse(process.argv, { run: false });
  startLogger(cli.matchedCommandName || "run");
  await cli.runMatchedCommand();
  await endLogger(true);
}
main().catch(async (error) => {
  const detail = error?.stack || error?.message || String(error);
  await getLogger()?.error(detail);
  const logPath = await endLogger(false);
  console.error(error?.message || error);
  if (logPath) {
    console.error(`
Logs saved to: ${logPath}`);
  }
  process.exit(1);
});
