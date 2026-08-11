// 商品名称自动翻译工具 —— 联网翻译 + IndexedDB 本地缓存
// 使用 MyMemory 免费 API（无需 key，适合 demo 场景）
import db from '../db/database.js';

const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 翻译缓存 7 天

function isEnglish(text) {
  if (!text || typeof text !== 'string') return false;
  // 至少包含 3 个连续英文字母，且英文字符占比 > 40%
  const letters = text.match(/[a-zA-Z]/g) || [];
  const nonSpace = text.replace(/\s/g, '');
  return letters.length >= 3 && letters.length / Math.max(nonSpace.length, 1) > 0.4;
}

function normalizeKey(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

async function fetchMyMemory(text) {
  const encoded = encodeURIComponent(text.slice(0, 300));
  const url = `https://api.mymemory.translated.net/get?q=${encoded}&langpair=en|zh-CN`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const data = await res.json();
    const translated = data?.responseData?.translatedText;
    if (translated && translated.toLowerCase() !== text.toLowerCase()) {
      return translated;
    }
  } catch {
    // ignore
  }
  return null;
}

async function translateOne(text) {
  // 仅使用 MyMemory，避免公共 LibreTranslate 实例不稳定导致大量网络报错
  let result = await fetchMyMemory(text);
  if (!result && text.length > 80) {
    // 长文本尝试截断后重试
    result = await fetchMyMemory(text.slice(0, 80) + '...');
  }
  return result;
}

/**
 * 批量翻译商品名称，优先读本地缓存，未命中则联网翻译并缓存。
 * @param {string[]} names 商品名称列表
 * @param {object} opts
 * @param {boolean} opts.skipNetwork 是否跳过联网（仅读缓存）
 * @param {boolean} opts.persist 是否写入本地缓存（默认 true；只读用户传 false，只展示不落库、不触发云端上传）
 * @returns {Map<string, string>} key 为原始名称，value 为中文翻译（无翻译则为空字符串）
 */
export async function translateProductNames(names, opts = {}) {
  const { skipNetwork = false, persist = true } = opts;
  const result = new Map();
  const toFetch = [];

  for (const name of names) {
    const key = normalizeKey(name);
    if (!key || !isEnglish(name)) {
      result.set(name, '');
      continue;
    }
    try {
      const cached = await db.translations?.get(key);
      if (cached && cached.text && Date.now() - cached.updatedAt < CACHE_TTL) {
        result.set(name, cached.text);
      } else {
        toFetch.push(name);
      }
    } catch {
      toFetch.push(name);
    }
  }

  if (!opts.skipNetwork && toFetch.length > 0) {
    // 逐个翻译，避免触发频率限制
    for (const name of toFetch) {
      const translated = await translateOne(name);
      const key = normalizeKey(name);
      if (translated) {
        result.set(name, translated);
        // persist=false（只读用户）：仅内存展示，不写库、不触发云端上传
        if (persist) {
          try {
            await db.translations?.put({ original: key, text: translated, updatedAt: Date.now() });
          } catch {
            // ignore cache write error
          }
        }
      } else {
        result.set(name, '');
      }
    }
  } else {
    for (const name of toFetch) result.set(name, '');
  }

  return result;
}

/**
 * 判断是否需要翻译（英文商品名）
 */
export function needsTranslation(name) {
  return isEnglish(name);
}
