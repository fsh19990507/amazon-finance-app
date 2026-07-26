// 金额/日期/百分比解析工具
// 所有函数纯函数，无副作用，便于单元验证

/**
 * 解析金额字符串，支持以下格式：
 *   'US$650.06'       -> 650.06
 *   '-US$176.05'      -> -176.05
 *   'US$1,509.79'     -> 1509.79
 *   'US$0.00'         -> 0
 *   650.06 (数值)     -> 650.06
 *   '' / null / undef -> 0
 *   '汇总' (非数值)    -> 0
 */
export function parseMoney(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;

  let s = value.trim();
  if (!s) return 0;

  // 去除 US$ 前缀（可能在前也可能在负号之后）
  s = s.replace(/US\$/gi, '').trim();

  // 去除千分位逗号
  s = s.replace(/,/g, '');

  // 去除空白
  s = s.trim();

  if (s === '' || s === '-' || s === '汇总') return 0;

  const num = parseFloat(s);
  return isFinite(num) ? num : 0;
}

/**
 * 解析百分比字符串：
 *   '1.15%'    -> 0.0115
 *   '-11.66%'  -> -0.1166
 *   '0.00%'    -> 0
 *   0.0115 (数值) -> 0.0115
 */
export function parsePercent(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;

  let s = value.trim();
  if (!s) return 0;

  s = s.replace(/%/g, '').trim();
  s = s.replace(/,/g, '');

  if (s === '' || s === '-') return 0;

  const num = parseFloat(s);
  if (!isFinite(num)) return 0;
  return num / 100;
}

/**
 * 解析交易明细日期，支持以下输入：
 *   - Date 对象 -> 'YYYY-MM-DD'
 *   - '06-30-26' (MM-DD-YY) -> '2026-06-30'
 *   - '2026-06-30' (YYYY-MM-DD) -> 直接返回
 *   - Excel 序列号 (数字) -> 'YYYY-MM-DD'（用 1899-12-30 作为 epoch，规避 1900 闰年 bug）
 *   - 其他 -> 原值返回
 */
export function parseTransactionDate(value) {
  if (value === null || value === undefined || value === '') return '';

  // Date 对象
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return '';
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 数字（Excel 序列号）
  if (typeof value === 'number') {
    if (!isFinite(value) || value < 1) return '';
    // Excel epoch: 1899-12-30 (序列号 1 = 1899-12-31，但 Excel 错把 1900 当闰年所以用 30)
    const ms = Math.round((value - 25569) * 86400 * 1000); // 25569 = 1970-01-01 的 Excel 序列号
    const d = new Date(ms);
    if (isNaN(d.getTime())) return '';
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  if (typeof value !== 'string') return '';

  const s = value.trim();
  if (!s) return '';

  // 纯数字字符串（Excel 序列号），转 number 后按序列号处理
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = parseFloat(s);
    if (isFinite(n) && n > 1) {
      // 复用数字分支逻辑
      const ms = Math.round((n - 25569) * 86400 * 1000);
      const d = new Date(ms);
      if (!isNaN(d.getTime())) {
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, '0');
        const day = String(d.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
    }
  }

  // YYYY-MM-DD 直接返回
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // YYYY/MM/DD
  const ymdSlash = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (ymdSlash) {
    const [, y, mo, da] = ymdSlash;
    return `${y}-${mo.padStart(2, '0')}-${da.padStart(2, '0')}`;
  }

  // MM-DD-YY 或 M-D-YY（连字符）
  const m1 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2})$/);
  if (m1) {
    const [, mm, dd, yy] = m1;
    const yearNum = parseInt(yy, 10);
    const year = yearNum <= 50 ? 2000 + yearNum : 1900 + yearNum;
    return `${year}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }

  // MM/DD/YY 或 M/D/YY（斜杠）
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (m2) {
    const [, mm, dd, yy] = m2;
    const yearNum = parseInt(yy, 10);
    const year = yearNum <= 50 ? 2000 + yearNum : 1900 + yearNum;
    return `${year}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }

  // MM/DD/YYYY 或 M/D/YYYY
  const m3 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m3) {
    const [, mm, dd, yyyy] = m3;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }

  return s; // 无法解析返回原值
}

/**
 * 从交易明细日期 '2026-06-30' 提取月份 '2026-06'
 */
export function getMonthFromDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return '';
  return dateStr.slice(0, 7);
}

/**
 * 解析利润报表月份：'202606' -> '2026-06'
 * 也兼容 '2026-06' 直接返回
 */
export function parseReportMonth(value) {
  if (!value) return '';
  const s = String(value).trim();
  if (!s) return '';

  // YYYY-MM
  if (/^\d{4}-\d{2}$/.test(s)) return s;

  // YYYYMM
  const m = s.match(/^(\d{4})(\d{2})$/);
  if (!m) return s;
  return `${m[1]}-${m[2]}`;
}

/**
 * 数值保留 2 位小数（用 Number.toFixed + parseFloat 规避浮点精度问题）
 */
export function round2(num) {
  if (!isFinite(num)) return 0;
  return parseFloat(num.toFixed(2));
}

/**
 * 数值格式化为带 $ 和千分位的字符串：1509.79 -> '$1,509.79'，-176.05 -> '-$176.05'
 */
export function formatMoney(num, currency = '$') {
  if (!isFinite(num)) num = 0;
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  return `${sign}${currency}${abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

/**
 * 数值格式化为百分比：0.0115 -> '1.15%'，-0.1166 -> '-11.66%'
 */
export function formatPercent(num, digits = 2) {
  if (!isFinite(num)) num = 0;
  return `${(num * 100).toFixed(digits)}%`;
}
