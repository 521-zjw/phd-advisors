#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = {
  programs: join(root, "data/programs.json"),
  records: join(root, "data/records.json"),
  log: join(root, "data/log.json"),
};

const PROGRAM_KEYS = new Set(["n", "u", "l", "g", "d", "dd", "o", "s"]);
const RECORD_KEYS = new Set(["id", "n", "t", "r", "i", "d", "c", "k", "h", "p", "f", "a", "v", "s", "ad", "add", "x"]);
const LOG_KEYS = new Set(["date", "title", "detail"]);
const PROGRAM_TYPES = new Set(["cycle", "jobs", "rolling", "none"]);
const errors = [];

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isHttpUrl(value) {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function requireString(object, key, path) {
  const value = object[key];
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${path}.${key} 必须是非空字符串`);
    return false;
  }
  return true;
}

function optionalString(object, key, path) {
  if (object[key] === undefined) return false;
  if (typeof object[key] !== "string" || object[key].trim() === "") {
    errors.push(`${path}.${key} 若填写，必须是非空字符串`);
    return false;
  }
  return true;
}

function unknownKeys(object, allowed, path) {
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) errors.push(`${path} 含未定义字段 ${key}`);
  }
}

function findDuplicateKeys(text) {
  const duplicates = [];
  let i = 0;
  const n = text.length;

  function fail(message) {
    const around = text.slice(Math.max(0, i - 30), Math.min(n, i + 30)).replace(/\s+/g, " ");
    throw new Error(`${message}（位置 ${i}：${around}）`);
  }

  function skipWs() {
    while (i < n && " \t\r\n".includes(text[i])) i += 1;
  }

  function parseString() {
    if (text[i] !== '"') fail("应为字符串");
    i += 1;
    let value = "";
    while (i < n) {
      const ch = text[i];
      i += 1;
      if (ch === "\\") {
        const esc = text[i];
        i += 1;
        if (esc === "u") {
          const hex = text.slice(i, i + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail("\\u 转义无效");
          value += String.fromCharCode(parseInt(hex, 16));
          i += 4;
        } else if (esc === "n") value += "\n";
        else if (esc === "t") value += "\t";
        else if (esc === "r") value += "\r";
        else if (esc === "b") value += "\b";
        else if (esc === "f") value += "\f";
        else if (esc === '"' || esc === "\\" || esc === "/") value += esc;
        else fail("未知转义");
      } else if (ch === '"') return value;
      else value += ch;
    }
    fail("字符串没有结束");
  }

  function parseLiteral(word) {
    if (!text.startsWith(word, i)) return false;
    const after = text[i + word.length];
    if (after && !",}] \t\r\n".includes(after)) return false;
    i += word.length;
    return true;
  }

  function parseNumber() {
    const start = i;
    if (text[i] === "-") i += 1;
    if (text[i] === "0") i += 1;
    else if (text[i] >= "1" && text[i] <= "9") {
      while (i < n && text[i] >= "0" && text[i] <= "9") i += 1;
    } else fail("数字无效");
    if (text[i] === ".") {
      i += 1;
      if (!(text[i] >= "0" && text[i] <= "9")) fail("小数无效");
      while (i < n && text[i] >= "0" && text[i] <= "9") i += 1;
    }
    if (text[i] === "e" || text[i] === "E") {
      i += 1;
      if (text[i] === "+" || text[i] === "-") i += 1;
      if (!(text[i] >= "0" && text[i] <= "9")) fail("指数无效");
      while (i < n && text[i] >= "0" && text[i] <= "9") i += 1;
    }
    if (i === start) fail("数字无效");
  }

  function parseValue(path) {
    skipWs();
    const ch = text[i];
    if (ch === "{") return parseObject(path);
    if (ch === "[") return parseArray(path);
    if (ch === '"') {
      parseString();
      return;
    }
    if (parseLiteral("true") || parseLiteral("false") || parseLiteral("null")) return;
    if (ch === "-" || (ch >= "0" && ch <= "9")) {
      parseNumber();
      return;
    }
    fail("无法识别的值");
  }

  function parseObject(path) {
    i += 1;
    const seen = new Map();
    skipWs();
    if (text[i] === "}") {
      i += 1;
      return;
    }
    while (i < n) {
      skipWs();
      const keyAt = i;
      const key = parseString();
      if (seen.has(key)) duplicates.push(`${path}.${key}（再次出现在位置 ${keyAt}，先前在 ${seen.get(key)}）`);
      else seen.set(key, keyAt);
      skipWs();
      if (text[i] !== ":") fail("键后面应为冒号");
      i += 1;
      parseValue(`${path}.${key}`);
      skipWs();
      if (text[i] === ",") {
        i += 1;
        continue;
      }
      if (text[i] === "}") {
        i += 1;
        return;
      }
      fail("对象里应为逗号或右花括号");
    }
    fail("对象没有结束");
  }

  function parseArray(path) {
    i += 1;
    let index = 0;
    skipWs();
    if (text[i] === "]") {
      i += 1;
      return;
    }
    while (i < n) {
      parseValue(`${path}[${index}]`);
      index += 1;
      skipWs();
      if (text[i] === ",") {
        i += 1;
        continue;
      }
      if (text[i] === "]") {
        i += 1;
        return;
      }
      fail("数组里应为逗号或右方括号");
    }
    fail("数组没有结束");
  }

  parseValue("$");
  skipWs();
  if (i !== n) fail("JSON 结束后还有内容");
  return duplicates;
}

function readJson(label, path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    errors.push(`${label} 无法读取：${error.message}`);
    return null;
  }
  if (text.charCodeAt(0) === 0xfeff) {
    errors.push(`${label} 含 UTF-8 BOM，请保存为无 BOM 的 UTF-8`);
    text = text.slice(1);
  }
  try {
    for (const duplicate of findDuplicateKeys(text)) errors.push(`${label} 有重复的键：${duplicate}`);
  } catch (error) {
    errors.push(`${label} 不是合法 JSON：${error.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    errors.push(`${label} JSON.parse 失败：${error.message}`);
    return null;
  }
}

const programs = readJson("data/programs.json", files.programs);
const records = readJson("data/records.json", files.records);
const log = readJson("data/log.json", files.log);

if (programs && !isPlainObject(programs)) errors.push("data/programs.json 必须是对象，键是项目 id");
if (records && !Array.isArray(records)) errors.push("data/records.json 必须是数组");
if (log && !Array.isArray(log)) errors.push("data/log.json 必须是数组");

const programIds = programs && isPlainObject(programs) ? Object.keys(programs) : [];

if (programs && isPlainObject(programs)) {
  for (const id of programIds) {
    const path = `programs.${id}`;
    if (!/^[A-Z][A-Z0-9_]*$/.test(id)) errors.push(`${path} 的 id 应为大写字母、数字和下划线`);
    const program = programs[id];
    if (!isPlainObject(program)) {
      errors.push(`${path} 必须是对象`);
      continue;
    }
    unknownKeys(program, PROGRAM_KEYS, path);
    for (const key of ["n", "u", "l", "g", "d", "s"]) requireString(program, key, path);
    if (program.u !== undefined && !isHttpUrl(program.u)) errors.push(`${path}.u 必须是 http(s) URL`);
    if (program.s !== undefined && !isHttpUrl(program.s)) errors.push(`${path}.s 必须是 http(s) URL`);
    if (program.dd !== undefined && !isDate(program.dd)) errors.push(`${path}.dd 必须是 YYYY-MM-DD`);
    if (typeof program.o !== "string" || !PROGRAM_TYPES.has(program.o)) {
      errors.push(`${path}.o 必须是 cycle、jobs、rolling 或 none`);
    }
  }
}

const seenIds = new Map();
if (Array.isArray(records)) {
  records.forEach((record, index) => {
    const path = `records[${index}]`;
    if (!isPlainObject(record)) {
      errors.push(`${path} 必须是对象`);
      return;
    }
    unknownKeys(record, RECORD_KEYS, path);
    if (requireString(record, "id", path)) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.id)) {
        errors.push(`${path}.id 应为小写字母、数字和连字符：${record.id}`);
      }
      if (seenIds.has(record.id)) errors.push(`${path}.id 与 records[${seenIds.get(record.id)}] 重复：${record.id}`);
      else seenIds.set(record.id, index);
    }
    for (const key of ["n", "t", "r", "i", "d", "c", "h", "p"]) requireString(record, key, path);
    if (typeof record.k !== "string" || !/^[AFPC]+$/.test(record.k) || new Set(record.k).size !== record.k.length) {
      errors.push(`${path}.k 必须是不重复的类别字母，取自 A F P C`);
    }
    if (typeof record.f !== "boolean") errors.push(`${path}.f 必须是布尔值 true 或 false`);
    if (!isDate(record.a)) errors.push(`${path}.a 必须是 YYYY-MM-DD`);
    if (!isDate(record.v)) errors.push(`${path}.v 必须是 YYYY-MM-DD`);
    if (record.h !== undefined && !isHttpUrl(record.h)) errors.push(`${path}.h 必须是 http(s) URL`);
    if (record.p !== undefined && programs && isPlainObject(programs) && !Object.prototype.hasOwnProperty.call(programs, record.p)) {
      errors.push(`${path}.p 指向不存在的项目 ${record.p}`);
    }
    if (optionalString(record, "s", path) && !isHttpUrl(record.s)) errors.push(`${path}.s 必须是 http(s) URL`);
    if (optionalString(record, "ad", path) && !isHttpUrl(record.ad)) errors.push(`${path}.ad 必须是 http(s) URL`);
    if (record.add !== undefined && !isDate(record.add)) errors.push(`${path}.add 必须是 YYYY-MM-DD`);
    optionalString(record, "x", path);
  });
}

if (Array.isArray(log)) {
  log.forEach((entry, index) => {
    const path = `log[${index}]`;
    if (!isPlainObject(entry)) {
      errors.push(`${path} 必须是对象`);
      return;
    }
    unknownKeys(entry, LOG_KEYS, path);
    for (const key of ["title", "detail"]) requireString(entry, key, path);
    if (!isDate(entry.date)) errors.push(`${path}.date 必须是 YYYY-MM-DD`);
  });
}

if (errors.length) {
  console.error(`校验失败（${errors.length}）：`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`校验通过：${programIds.length} 个项目，${records.length} 条导师记录，${log.length} 条日志。id 均唯一。`);
