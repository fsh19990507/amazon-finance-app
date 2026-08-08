// Excel 导入核心模块
// 严格按真实数据结构实现：交易明细单行表头，利润报表双行表头
// 支持亚马逊 6 类报表：交易明细 / 利润报表 / 英文结算 / 业务报告 / 广告报告 / 库存报告
import * as XLSX from 'xlsx';
import {
  parseMoney,
  parsePercent,
  parseTransactionDate,
  parseReportMonth,
  getMonthFromDate
} from './parsers.js';
import {
  extractSettlementRows,
  extractBusinessRows,
  extractAdRows,
  extractInventoryRows,
  guessAdReportType
} from '../db/reportParsers.js';

// ============== 类型识别 ==============

export const FILE_TYPE = {
  TRANSACTION: 'transaction',
  PROFIT: 'profit',
  SETTLEMENT: 'settlement',
  BUSINESS: 'business',
  AD: 'ad',
  INVENTORY: 'inventory',
  UNKNOWN: 'unknown'
};

// 列名归一化（忽略大小写/空格/连字符/下划线），用于识别英文报表表头
function normKey(s) {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
}

/**
 * 从二维数组识别文件类型
 * - 第1行包含「交易类型」 → transaction
 * - 第1行包含「亚马逊回款」 → profit
 * - 前 8 行含 settlement-id + total-amount → settlement（英文结算）
 * - 前 8 行含 sessions + units ordered → business（业务报告）
 * - 前 8 行含 campaign name + impressions + clicks → ad（广告报告）
 * - 前 8 行含 fnsku / stranded / case id → inventory（库存报告）
 */
export function identifyFileType(matrix) {
  if (!matrix || !matrix.length || !matrix[0]) return FILE_TYPE.UNKNOWN;
  const row1 = matrix[0].map((c) => String(c ?? '').trim());
  if (row1.includes('交易类型')) return FILE_TYPE.TRANSACTION;
  if (row1.includes('亚马逊回款')) return FILE_TYPE.PROFIT;

  // 新类型：合并前 8 行关键词检测（结算报表表头可能在第 3-4 行）
  const scanLimit = Math.min(8, matrix.length);
  const allKeys = new Set();
  for (let i = 0; i < scanLimit; i++) {
    (matrix[i] || []).forEach((c) => allKeys.add(normKey(c)));
  }
  const has = (...ks) => ks.some((k) => allKeys.has(k));

  if (has('settlementid', 'settlementstartdate') && has('totalamount')) return FILE_TYPE.SETTLEMENT;
  if (has('sessions') && has('unitsordered')) return FILE_TYPE.BUSINESS;
  if (has('campaignname', 'campaignid') && has('impressions') && has('clicks')) return FILE_TYPE.AD;
  if (has('fnsku', 'strandedreason', 'caseid', 'quantityavailable', 'available')) return FILE_TYPE.INVENTORY;
  return FILE_TYPE.UNKNOWN;
}

// ============== 文件读取 ==============

/**
 * 读取 File/Blob 为二维数组
 * cellDates: true 让日期单元格返回 Date 对象而非序列号
 * 特殊处理：英文结算报表是 tab 分隔的 flat file（.txt），
 * XLSX 默认按逗号解析会把整行读成 1 列，这里兜底按 tab 手动拆行
 * @param {File} file
 * @returns {Promise<{matrix: any[][], sheetName: string}>}
 */
export async function parseWorkbook(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true, raw: false });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  let matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false, raw: false });

  // tab 分隔 flat file 兜底：若首行只有 1 列且内容含 tab，说明 XLSX 未正确切分，手动重建
  if (matrix.length > 0 && matrix[0].length === 1) {
    const first = String(matrix[0][0] ?? '');
    if (first.includes('\t')) {
      const text = new TextDecoder('utf-8').decode(buf);
      matrix = text
        .split(/\r?\n/)
        .filter((line) => line.trim() !== '')
        .map((line) => line.split('\t').map((c) => c.trim()));
    }
  }

  return { matrix, sheetName };
}

// ============== 交易明细解析 ==============

// 交易明细表头 → 字段名映射（按列顺序）
const TRANSACTION_HEADERS = [
  '日期', '交易状态', '交易类型', '订单编号', '商品详情',
  '商品价格总额', '促销返点总额', '亚马逊所收费用', '其他', '总计 (USD)'
];

const TRANSACTION_FIELD_MAP = {
  '日期': 'date',
  '交易状态': 'status',
  '交易类型': 'type',
  '订单编号': 'orderId',
  '商品详情': 'productName',
  '商品价格总额': 'productAmount',
  '促销返点总额': 'promoAmount',
  '亚马逊所收费用': 'amazonFee',
  '其他': 'other',
  '总计 (USD)': 'total'
};

/**
 * 从二维数组提取交易明细记录
 * 第1行为表头，第2行起为数据
 */
export function extractTransactionRows(matrix) {
  if (!matrix || matrix.length < 2) return [];

  const headerRow = matrix[0].map((c) => String(c ?? '').trim());
  // 校验表头匹配度
  const matched = TRANSACTION_HEADERS.filter((h) => headerRow.includes(h)).length;
  if (matched < TRANSACTION_HEADERS.length * 0.8) {
    throw new Error(`交易明细表头匹配度不足：${matched}/${TRANSACTION_HEADERS.length}`);
  }

  // 构建列索引
  const colIndex = {};
  TRANSACTION_HEADERS.forEach((h) => {
    const idx = headerRow.indexOf(h);
    if (idx >= 0) colIndex[h] = idx;
  });

  const rows = [];
  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i];
    if (!row || row.every((c) => c === '' || c === null || c === undefined)) continue;

    const dateRaw = row[colIndex['日期']];
    const dateStr = parseTransactionDate(dateRaw);
    if (!dateStr) continue; // 跳过无日期行

    const obj = {
      date: dateStr,
      month: getMonthFromDate(dateStr),
      status: String(row[colIndex['交易状态']] ?? '').trim(),
      type: String(row[colIndex['交易类型']] ?? '').trim(),
      orderId: String(row[colIndex['订单编号']] ?? '').trim(),
      productName: String(row[colIndex['商品详情']] ?? '').trim(),
      productAmount: parseMoney(row[colIndex['商品价格总额']]),
      promoAmount: parseMoney(row[colIndex['促销返点总额']]),
      amazonFee: parseMoney(row[colIndex['亚马逊所收费用']]),
      other: parseMoney(row[colIndex['其他']]),
      total: parseMoney(row[colIndex['总计 (USD)']]),
      // 去重键
      dedupKey: ''
    };
    obj.dedupKey = `${obj.orderId}|${obj.type}|${obj.date}`;
    rows.push(obj);
  }
  return rows;
}

// ============== 利润报表解析 ==============

// 利润报表需要的字段（按第2行子字段名匹配，取首次出现位置）
const PROFIT_FIELDS = [
  // 基础
  ['时间', 'month'],
  ['汇率(人民币)', 'exchangeRate'],
  ['店铺', 'store'],
  ['站点', 'site'],
  ['亚马逊回款', 'disbursement'],
  // 销量
  ['FBA销量', 'fbaSalesCount'],
  ['FBM销量', 'fbmSalesCount'],
  ['多渠道销量', 'multiChannelCount'],
  // 退款
  ['FBA退款量', 'fbaRefundCount'],
  ['FBM退款量', 'fbmRefundCount'],
  ['退款率', 'refundRate'],
  // 广告
  ['SP广告订单量', 'spAdOrders'],
  ['SD广告订单量', 'sdAdOrders'],
  ['SP广告销售额', 'spAdSales'],
  ['SD广告销售额', 'sdAdSales'],
  // 利润
  ['毛利润', 'grossProfit'],
  ['毛利率', 'profitMargin'],
  ['ROI', 'roi'],
  // 销售额
  ['FBA销售额', 'fbaSalesAmount'],
  ['FBM销售额', 'fbmSalesAmount'],
  ['FBA买家运费', 'fbaBuyerShipping'],
  ['FBM买家运费', 'fbmBuyerShipping'],
  ['促销折扣', 'promoDiscount'],
  // 退款金额
  ['FBA销售额退款', 'fbaSalesRefund'],
  ['FBM销售额退款', 'fbmSalesRefund'],
  ['佣金退款', 'commissionRefund'],
  ['FBA配送费退款', 'fbaFeeRefund'],
  // 订单支出
  ['销售佣金', 'commission'],
  ['独家销售计划', 'exclusiveSales'],
  ['商标使用许可佣金', 'trademarkLicense'],
  ['FBA配送费-非多渠道订单', 'fbaFee'],
  ['FBA配送费-多渠道订单', 'fbaMcfFee'],
  ['FBM便捷配送费', 'fbmShipping'],
  ['礼品包装费扣除', 'giftWrap'],
  ['买家运费扣除', 'buyerShipping'],
  ['MCF计重费', 'mcfWeightFee'],
  ['固定费', 'fixedFee'],
  ['媒体类成交费', 'mediaFee'],
  ['FBA计重费', 'fbaWeightFee'],
  ['COD扣款', 'codFee'],
  // 广告花费
  ['SP', 'adSpend'],
  ['SD', 'sdAdSpend'],
  ['SB商品集', 'sbProduct'],
  ['SB视频', 'sbVideo'],
  ['SB旗舰店', 'sbStore'],
  ['差异分摊', 'adDiff'],
  ['广告花费占比', 'adSpendRate'],
  // 推广费
  ['LD费', 'ldFee'],
  ['优惠券', 'coupon'],
  ['Vine', 'vine'],
  ['推广费占比', 'promoRate'],
  // 其余服务费
  ['订阅费', 'subscription'],
  ['月仓储费报告', 'storageFee'],
  ['月仓储费差额', 'storageDiff'],
  ['月仓储费占比', 'storageRate'],
  ['长期仓储费报告', 'longTermStorageFee'],
  ['长期仓储费差额', 'longTermStorageDiff'],
  ['长期仓储费占比', 'longTermStorageRate'],
  ['销毁费', 'disposalFee'],
  ['移除费', 'removalFee'],
  ['专属服务费', 'exclusiveServiceFee'],
  ['AWD月仓储费', 'awdStorageFee'],
  ['AWD手续费', 'awdHandlingFee'],
  ['AWD配送费', 'awdShippingFee'],
  ['仓储超量费', 'storageOverFee'],
  ['退货入仓费', 'returnInboundFee'],
  ['入库配置费', 'inboundConfigFee'],
  ['入库缺陷费', 'inboundDefectFee'],
  ['人工处理费', 'manualFee'],
  ['贴标费', 'labelingFee'],
  ['包装袋费', 'bagFee'],
  ['不透明包装袋费', 'opaqueBagFee'],
  ['气泡膜包装费', 'bubbleWrapFee'],
  ['SKU超量费', 'skuOverFee'],
  ['邮资计重费', 'postageWeightFee'],
  ['退货标签费', 'returnLabelFee'],
  // 商品成本
  ['FBA采购成本', 'fbaPurchaseCost'],
  ['FBM采购成本', 'fbmPurchaseCost'],
  ['FBA头程费用', 'fbaFirstMile'],
  ['FBM头程费用', 'fbmFirstMile'],
  ['商品成本-FBM运费', 'fbmShippingCost'],
  ['测评本金', 'reviewPrincipal'],
  ['测评佣金', 'reviewCommission'],
  ['自定义费用-固定费用', 'customFixedFee']
];

// 需要按金额解析的字段
const MONEY_FIELDS = new Set([
  'disbursement', 'spAdSales', 'sdAdSales', 'grossProfit',
  'fbaSalesAmount', 'fbmSalesAmount', 'fbaBuyerShipping', 'fbmBuyerShipping', 'promoDiscount',
  'fbaSalesRefund', 'fbmSalesRefund', 'commissionRefund', 'fbaFeeRefund',
  'commission', 'exclusiveSales', 'trademarkLicense', 'fbaFee', 'fbaMcfFee', 'fbmShipping',
  'giftWrap', 'buyerShipping', 'mcfWeightFee', 'fixedFee', 'mediaFee', 'fbaWeightFee', 'codFee',
  'adSpend', 'sdAdSpend', 'sbProduct', 'sbVideo', 'sbStore', 'adDiff',
  'ldFee', 'coupon', 'vine',
  'subscription', 'storageFee', 'storageDiff', 'longTermStorageFee', 'longTermStorageDiff',
  'disposalFee', 'removalFee', 'exclusiveServiceFee', 'awdStorageFee', 'awdHandlingFee',
  'awdShippingFee', 'storageOverFee', 'returnInboundFee', 'inboundConfigFee', 'inboundDefectFee',
  'manualFee', 'labelingFee', 'bagFee', 'opaqueBagFee', 'bubbleWrapFee', 'skuOverFee',
  'postageWeightFee', 'returnLabelFee',
  'fbaPurchaseCost', 'fbmPurchaseCost', 'fbaFirstMile', 'fbmFirstMile', 'fbmShippingCost',
  'reviewPrincipal', 'reviewCommission', 'customFixedFee',
  'exchangeRate'
]);

// 需要按百分比解析的字段
const PERCENT_FIELDS = new Set([
  'refundRate', 'profitMargin', 'roi', 'adSpendRate', 'promoRate',
  'storageRate', 'longTermStorageRate'
]);

// 数值字段（直接 parseFloat）
const NUMBER_FIELDS = new Set([
  'fbaSalesCount', 'fbmSalesCount', 'multiChannelCount',
  'fbaRefundCount', 'fbmRefundCount',
  'spAdOrders', 'sdAdOrders'
]);

/**
 * 从二维数组提取利润报表记录
 * 第2行为子字段名，第3行起为数据，跳过"汇总"行
 * 防御：若第2行不是有效子字段表头（如单行表头旧格式/纯数据），直接抛错，
 *       避免所有字段解析为 0 产生静默脏数据
 */
export function extractProfitRows(matrix) {
  if (!matrix || matrix.length < 3) return [];

  // 第1行大类 + 第2行子字段
  const headerRow = matrix[1].map((c) => String(c ?? '').trim());

  // 校验第2行是否为利润报表子字段表头：
  // 至少命中一个关键字段（时间/店铺/亚马逊回款/毛利润等），否则判为旧格式/无表头
  const criticalFields = ['时间', '店铺', '亚马逊回款', '毛利润', 'FBA销售额', '销售佣金'];
  const headerHit = headerRow.filter((h) => criticalFields.includes(h)).length;
  if (headerHit === 0) {
    throw new Error('利润报表表头格式异常：第 2 行未找到子字段（时间/店铺/亚马逊回款等）。请确认是「亚马逊后台下载的双行表头利润报表」，旧版单行表头不支持');
  }

  // 构建子字段名 → 列索引（首次出现位置）
  const colIndex = {};
  headerRow.forEach((h, idx) => {
    if (h && !(h in colIndex)) colIndex[h] = idx;
  });

  const rows = [];
  for (let i = 2; i < matrix.length; i++) {
    const row = matrix[i];
    if (!row || row.every((c) => c === '' || c === null || c === undefined)) continue;

    // 跳过"汇总"行
    const firstCell = String(row[0] ?? '').trim();
    if (firstCell === '汇总') continue;

    const obj = {};
    for (const [subName, fieldName] of PROFIT_FIELDS) {
      const idx = colIndex[subName];
      if (idx === undefined) {
        obj[fieldName] = 0;
        continue;
      }
      const raw = row[idx];
      if (MONEY_FIELDS.has(fieldName)) {
        obj[fieldName] = parseMoney(raw);
      } else if (PERCENT_FIELDS.has(fieldName)) {
        obj[fieldName] = parsePercent(raw);
      } else if (NUMBER_FIELDS.has(fieldName)) {
        const n = parseFloat(String(raw ?? '0').replace(/,/g, ''));
        obj[fieldName] = isFinite(n) ? n : 0;
      } else {
        obj[fieldName] = String(raw ?? '').trim();
      }
    }

    // 月份处理
    obj.month = parseReportMonth(obj.month);
    // 去重键
    obj.dedupKey = `${obj.month}|${obj.store}`;
    rows.push(obj);
  }
  return rows;
}

// ============== 导入主入口 ==============

/**
 * 解析 Excel 文件，自动识别类型并提取记录
 * @param {File} file
 * @returns {Promise<{fileType: string, sheetName: string, rows: any[], headerPreview: any[]}>}
 */
export async function parseExcelFile(file) {
  let matrix = [];
  let sheetName = '';
  try {
    const parsed = await parseWorkbook(file);
    matrix = parsed.matrix;
    sheetName = parsed.sheetName;
  } catch (e) {
    // 文件损坏/加密/无法解析：给出友好中文提示
    throw new Error(`文件无法解析（可能已损坏、被加密或不是 Excel 文件）：${e?.message || e}. 请确认文件完整后重试`);
  }
  const fileType = identifyFileType(matrix);
  let rows = [];
  try {
    if (fileType === FILE_TYPE.TRANSACTION) {
      rows = extractTransactionRows(matrix);
    } else if (fileType === FILE_TYPE.PROFIT) {
      rows = extractProfitRows(matrix);
    } else if (fileType === FILE_TYPE.SETTLEMENT) {
      rows = extractSettlementRows(matrix);
    } else if (fileType === FILE_TYPE.BUSINESS) {
      rows = extractBusinessRows(matrix);
    } else if (fileType === FILE_TYPE.AD) {
      rows = extractAdRows(matrix, guessAdReportType(file?.name));
    } else if (fileType === FILE_TYPE.INVENTORY) {
      rows = extractInventoryRows(matrix);
    } else {
      throw new Error('无法识别文件类型。请到「帮助中心 → 报表字典」查看 6 类报表的正确格式后重新下载');
    }
  } catch (e) {
    // 解析错误统一包装：提示去帮助中心报表字典
    throw new Error(`${e.message}。可到「帮助中心 → 报表字典」查看正确格式`);
  }
  return {
    fileType,
    sheetName,
    rows,
    headerPreview: matrix.slice(0, 2)
  };
}
