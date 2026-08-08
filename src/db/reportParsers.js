// ============================================================
// 亚马逊新报表解析器：英文结算报表 / 业务报告 / 广告报告 / 库存报告
// 支持 tab 分隔（Settlement flat file）与 CSV（业务/广告/库存）两种格式
// 列名用"归一化模糊匹配"（忽略大小写/空格/连字符/下划线），兼容多版本表头
// ============================================================
import {
  parseMoney,
  parsePercent,
  parseTransactionDate,
  getMonthFromDate
} from '../utils/parsers.js';

// 列名归一化：'Settlement ID' / 'settlement-id' / 'settlement_id' → 'settlementid'
function normKey(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
}

// 构建 归一化列名 → 列索引 映射（取首次出现位置）
function buildColIndex(headerRow) {
  const idx = {};
  (headerRow || []).forEach((h, i) => {
    const k = normKey(h);
    if (k && idx[k] === undefined) idx[k] = i;
  });
  return idx;
}

// 行是否为空（全部单元格为空）
function isEmptyRow(row) {
  return !row || row.every((c) => c === '' || c === null || c === undefined);
}

// 取 ISO 日期字符串的日期部分：'2003-10-03T16:00:00-07:00' → '2003-10-03'
function datePart(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const m = s.match(/^\d{4}-\d{2}-\d{2}/);
  if (m) return m[0];
  return parseTransactionDate(s);
}

// 整数解析（容忍千分位/小数）
function toInt(v) {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return isFinite(n) ? Math.round(n) : 0;
}

// 表头匹配度校验：返回 { ok, missing }
function checkHeaders(headerRow, requiredKeys) {
  const idx = buildColIndex(headerRow);
  const missing = requiredKeys.filter((k) => idx[k] === undefined);
  return { ok: missing.length === 0, missing };
}

// 缺失列 → 中文提示
function missingColsText(headerRow, requiredKeys) {
  const { missing } = checkHeaders(headerRow, requiredKeys);
  return missing.length ? missing.join('、') : '';
}

// ============================================================
// 1. 英文结算报表 Settlement Report V2（tab 分隔 flat file）
// 文件结构：前 2-3 行为元信息（Version / Billing Schedule 等），
// 之后是表头行（含 settlement-id / settlement start date），再之后是数据行
// ============================================================

const SETTLEMENT_REQUIRED = ['transactiontype', 'totalamount'];

// 表头归一化列名 → 字段名（只取本项目需要的字段）
const SETTLEMENT_MAP = {
  settlementid: 'settlementId',
  settlementstartdate: 'startDate',
  settlementenddate: 'endDate',
  depositdate: 'depositDate',
  totalamount: 'totalAmount',
  currency: 'currency',
  transactiontype: 'transactionType',
  orderid: 'orderId',
  orderitemid: 'orderItemId',
  adjustmentid: 'adjustmentId',
  shipmentid: 'shipmentId',
  marketplace: 'marketplaceName',
  marketplacename: 'marketplaceName',
  fulfillmentid: 'fulfillmentId',
  customtext: 'customText',
  shipmentfeetype: 'shipmentFeeType',
  shipmentfeeamount: 'shipmentFeeAmount',
  orderfeetype: 'orderFeeType',
  orderfeeamount: 'orderFeeAmount',
  itemrelatedfeetype: 'itemFeeType',
  itemrelatedfeeamount: 'itemFeeAmount',
  otherfeetype: 'otherFeeType',
  otherfeeamount: 'otherFeeAmount',
  shippingprice: 'shippingPrice',
  itemprice: 'itemPrice',
  itemtax: 'itemTax',
  shippingtax: 'shippingTax',
  giftwrapprice: 'giftWrapPrice',
  giftwraptax: 'giftWrapTax',
  itempromotiondiscount: 'itemPromotionDiscount',
  shipmentpromotiondiscount: 'shipmentPromotionDiscount',
  promotioalrebate: 'promotionalRebate',
  promotionalrebate: 'promotionalRebate',
  salestaxcollected: 'salesTaxCollected',
  sellerpromotionid: 'sellerPromotionId',
  discountamount: 'discountAmount',
  codcollectionfee: 'codCollectionFee',
  sku: 'sku',
  quantitypurchased: 'quantity',
  quantity: 'quantity',
  pricetype: 'priceType',
  priceamount: 'priceAmount',
  posteddate: 'postedDate',
  paiddate: 'paidDate'
};

// 金额字段（parseMoney）
const SETTLEMENT_MONEY = new Set([
  'totalAmount', 'shipmentFeeAmount', 'orderFeeAmount', 'itemFeeAmount', 'otherFeeAmount',
  'shippingPrice', 'itemPrice', 'itemTax', 'shippingTax', 'giftWrapPrice', 'giftWrapTax',
  'itemPromotionDiscount', 'shipmentPromotionDiscount', 'promotionalRebate',
  'salesTaxCollected', 'discountAmount', 'codCollectionFee', 'priceAmount'
]);

// 日期字段（datePart）
const SETTLEMENT_DATE = new Set([
  'startDate', 'endDate', 'depositDate', 'postedDate', 'paidDate'
]);

/**
 * 扫描前若干行，定位结算报表表头行
 * @returns {number} 表头行索引，找不到返回 -1
 */
function findSettlementHeaderRow(matrix) {
  const scanLimit = Math.min(8, matrix.length);
  for (let i = 0; i < scanLimit; i++) {
    const row = matrix[i];
    if (!row) continue;
    const keys = (row || []).map((c) => normKey(c));
    if (keys.includes('transactiontype') && keys.includes('totalamount')) return i;
  }
  return -1;
}

export function extractSettlementRows(matrix) {
  const headerIdx = findSettlementHeaderRow(matrix);
  if (headerIdx < 0) {
    throw new Error(
      `结算报表表头未找到：请确认文件是「结算报告 Settlement Report V2」格式（表头应含 transaction-type / total-amount）`
    );
  }
  const headerRow = matrix[headerIdx];
  const col = buildColIndex(headerRow);
  const reqMissing = missingColsText(headerRow, SETTLEMENT_REQUIRED);
  if (reqMissing) {
    throw new Error(`结算报表缺少必需列：${reqMissing}。请确认下载的是 Settlements 结算报表（V2 flat file）`);
  }

  const rows = [];
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const row = matrix[i];
    if (isEmptyRow(row)) continue;

    const obj = { storeId: 'default' };
    for (const [k, field] of Object.entries(SETTLEMENT_MAP)) {
      const idx = col[k];
      if (idx === undefined) {
        obj[field] = SETTLEMENT_MONEY.has(field) ? 0 : '';
        continue;
      }
      const raw = row[idx];
      if (SETTLEMENT_MONEY.has(field)) obj[field] = parseMoney(raw);
      else if (SETTLEMENT_DATE.has(field)) obj[field] = datePart(raw);
      else if (field === 'quantity') obj[field] = toInt(raw);
      else obj[field] = String(raw ?? '').trim();
    }

    // 月份：优先用结算结束日期，其次 postedDate
    obj.month = obj.endDate
      ? obj.endDate.slice(0, 7)
      : (obj.postedDate ? obj.postedDate.slice(0, 7) : '');
    // 去重键
    obj.dedupKey = `${obj.settlementId}|${obj.orderId}|${obj.transactionType}|${obj.postedDate}|${obj.totalAmount}`;
    rows.push(obj);
  }
  return rows;
}

// ============================================================
// 2. 业务报告 Business Report（Sales & Traffic，CSV）
// ============================================================

const BUSINESS_REQUIRED = ['sessions', 'unitsordered'];

const BUSINESS_MAP = {
  date: 'date',
  asin: 'asin',
  sku: 'sku',
  title: 'title',
  sessions: 'sessions',
  sessionpercentage: 'sessionPercentage',
  pageviews: 'pageViews',
  pageviewspercentage: 'pageViewsPercentage',
  buyboxpercentage: 'buyBoxPercentage',
  unitsordered: 'unitsOrdered',
  unitsessionpercentage: 'unitSessionPercentage',
  orderedproductsales: 'orderedProductSales',
  totalorderitems: 'totalOrderItems',
  conversionrate: 'conversionRate'
};

const BUSINESS_PERCENT = new Set([
  'sessionPercentage', 'pageViewsPercentage', 'buyBoxPercentage',
  'unitSessionPercentage', 'conversionRate'
]);
const BUSINESS_MONEY = new Set(['orderedProductSales']);
const BUSINESS_INT = new Set(['sessions', 'pageViews', 'unitsOrdered', 'totalOrderItems']);

export function extractBusinessRows(matrix) {
  if (!matrix || matrix.length < 2) return [];
  const headerRow = matrix[0];
  const reqMissing = missingColsText(headerRow, BUSINESS_REQUIRED);
  if (reqMissing) {
    throw new Error(`业务报告缺少必需列：${reqMissing}。请确认下载的是「业务报告-销售量与访问量（Sales & Traffic）」`);
  }
  const col = buildColIndex(headerRow);

  const rows = [];
  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i];
    if (isEmptyRow(row)) continue;

    const obj = { storeId: 'default' };
    for (const [k, field] of Object.entries(BUSINESS_MAP)) {
      const idx = col[k];
      if (idx === undefined) {
        obj[field] = BUSINESS_PERCENT.has(field) ? 0
          : BUSINESS_MONEY.has(field) ? 0
            : BUSINESS_INT.has(field) ? 0 : '';
        continue;
      }
      const raw = row[idx];
      if (BUSINESS_PERCENT.has(field)) obj[field] = parsePercent(raw);
      else if (BUSINESS_MONEY.has(field)) obj[field] = parseMoney(raw);
      else if (BUSINESS_INT.has(field)) obj[field] = toInt(raw);
      else obj[field] = String(raw ?? '').trim();
    }

    // 日期：兼容 '2026-06-30' 与 '06/30/2026'
    obj.date = datePart(obj.date);
    if (!obj.date) continue; // 无日期行跳过（如合计行）
    obj.month = getMonthFromDate(obj.date);
    obj.dedupKey = `${obj.date}|${obj.asin || ''}|${obj.sku || ''}`;
    rows.push(obj);
  }
  return rows;
}

// ============================================================
// 3. 广告报告 Advertising Report（SP/SD/SB，CSV）
// ============================================================

const AD_REQUIRED = ['impressions', 'clicks'];

const AD_MAP = {
  date: 'date',
  campaignname: 'campaignName',
  campaignid: 'campaignId',
  adgroupname: 'adGroupName',
  targeting: 'targeting',
  keyword: 'keyword',
  matchtype: 'matchType',
  impressions: 'impressions',
  clicks: 'clicks',
  ctr: 'ctr',
  spend: 'spend',
  '7daytotalsales': 'sevenDayTotalSales',
  totalacos: 'acos',
  totalroas: 'roas',
  orders: 'orders',
  units: 'units',
  currency: 'currency'
};

const AD_PERCENT = new Set(['ctr', 'acos', 'roas']);
const AD_MONEY = new Set(['spend', 'sevenDayTotalSales']);
const AD_INT = new Set(['impressions', 'clicks', 'orders', 'units']);

/**
 * 根据文件名推测广告类型（SP/SD/SB），用于 reportType 字段
 */
export function guessAdReportType(fileName = '') {
  const n = String(fileName || '').toLowerCase();
  if (n.includes('brand')) return 'SB';
  if (n.includes('display')) return 'SD';
  return 'SP';
}

export function extractAdRows(matrix, reportTypeHint = 'SP') {
  if (!matrix || matrix.length < 2) return [];
  const headerRow = matrix[0];
  const reqMissing = missingColsText(headerRow, AD_REQUIRED);
  if (reqMissing) {
    throw new Error(`广告报告缺少必需列：${reqMissing}。请确认下载的是「广告活动报告」（含 Impressions/Clicks 列）`);
  }
  const col = buildColIndex(headerRow);

  const rows = [];
  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i];
    if (isEmptyRow(row)) continue;

    const obj = { storeId: 'default', reportType: reportTypeHint };
    for (const [k, field] of Object.entries(AD_MAP)) {
      const idx = col[k];
      if (idx === undefined) {
        obj[field] = AD_PERCENT.has(field) ? 0
          : AD_MONEY.has(field) ? 0
            : AD_INT.has(field) ? 0 : '';
        continue;
      }
      const raw = row[idx];
      if (AD_PERCENT.has(field)) obj[field] = parsePercent(raw);
      else if (AD_MONEY.has(field)) obj[field] = parseMoney(raw);
      else if (AD_INT.has(field)) obj[field] = toInt(raw);
      else obj[field] = String(raw ?? '').trim();
    }

    obj.date = datePart(obj.date);
    if (!obj.date) continue;
    obj.month = getMonthFromDate(obj.date);
    obj.dedupKey = `${obj.date}|${obj.campaignId || ''}|${obj.adGroupName || ''}|${obj.targeting || ''}|${obj.keyword || ''}`;
    rows.push(obj);
  }
  return rows;
}

// ============================================================
// 4. 库存报告 Inventory Report
//    子类型：inventory（FBA 库存）/ stranded（滞留库存）/ reimbursement（库存赔偿）
// ============================================================

// 识别库存报告子类型
export function guessInventoryType(headerRow) {
  const keys = (headerRow || []).map((c) => normKey(c));
  const s = keys.join(',');
  if (s.includes('caseid') || s.includes('reimbursementtype') || s.includes('amounttotal')) return 'reimbursement';
  if (s.includes('strandedreason') || s.includes('strandedreasoncode')) return 'stranded';
  return 'inventory';
}

const INV_INVENTORY_MAP = {
  sku: 'sku',
  fnsku: 'fnsku',
  asin: 'asin',
  productname: 'productName',
  warehousecondition: 'condition',
  'product-name': 'productName',
  quantityavailable: 'available',
  available: 'available',
  quantityreserved: 'reserved',
  reserved: 'reserved',
  quantityinbound: 'inbound',
  inbound: 'inbound',
  quantitytotal: 'totalQty'
};

const INV_STRANDED_MAP = {
  sku: 'sku',
  asin: 'asin',
  fnsku: 'fnsku',
  productname: 'productName',
  qty: 'strandedQty',
  yourunits: 'strandedQty',
  strandedreason: 'strandedReason',
  strandedreasoncode: 'strandedReason'
};

const INV_REIMBURSEMENT_MAP = {
  approvaldate: 'date',
  reimbursementid: 'caseId',
  caseid: 'caseId',
  amazonorderid: 'orderId',
  sku: 'sku',
  asin: 'asin',
  fnsku: 'fnsku',
  productname: 'productName',
  condition: 'condition',
  currencyunit: 'currency',
  amountperunit: 'amount',
  amounttotal: 'amount',
  quantityreimbursedcash: 'qtyReimbursedCash',
  quantityreimbursedinventory: 'qtyReimbursedInventory',
  reimbursementtype: 'reimbursementType'
};

const INV_INT = new Set(['available', 'reserved', 'inbound', 'totalQty', 'strandedQty', 'qtyReimbursedCash', 'qtyReimbursedInventory']);
const INV_MONEY = new Set(['amount']);

function buildInventoryRows(matrix, headerRow, fieldMap, subType) {
  const col = buildColIndex(headerRow);
  const rows = [];
  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i];
    if (isEmptyRow(row)) continue;

    const obj = { storeId: 'default', reportType: subType, date: '' };
    for (const [k, field] of Object.entries(fieldMap)) {
      const idx = col[k];
      if (idx === undefined) {
        obj[field] = INV_MONEY.has(field) ? 0 : (INV_INT.has(field) ? 0 : '');
        continue;
      }
      const raw = row[idx];
      if (INV_MONEY.has(field)) obj[field] = parseMoney(raw);
      else if (INV_INT.has(field)) obj[field] = toInt(raw);
      else obj[field] = String(raw ?? '').trim();
    }

    // 赔偿报告日期在 approval-date 列；其他类型无日期则用空月份
    if (subType === 'reimbursement') {
      obj.date = datePart(obj.date);
      obj.month = obj.date ? getMonthFromDate(obj.date) : '';
    } else {
      obj.month = '';
    }
    obj.dedupKey = `${obj.date || ''}|${subType}|${obj.sku || ''}|${obj.fnsku || ''}`;
    rows.push(obj);
  }
  return rows;
}

export function extractInventoryRows(matrix) {
  if (!matrix || matrix.length < 2) return [];
  const headerRow = matrix[0];
  const subType = guessInventoryType(headerRow);

  if (subType === 'reimbursement') {
    if (missingColsText(headerRow, ['sku'])) {
      throw new Error(`库存赔偿报告缺少必需列：sku。请确认下载的是「库存赔偿（Reimbursements）」报告`);
    }
    return buildInventoryRows(matrix, headerRow, INV_REIMBURSEMENT_MAP, 'reimbursement');
  }
  if (subType === 'stranded') {
    if (missingColsText(headerRow, ['sku'])) {
      throw new Error(`滞留库存报告缺少必需列：sku。请确认下载的是「滞留库存（Stranded）」报告`);
    }
    return buildInventoryRows(matrix, headerRow, INV_STRANDED_MAP, 'stranded');
  }
  if (missingColsText(headerRow, ['sku'])) {
    throw new Error(`库存报告缺少必需列：sku。请确认下载的是「FBA 库存报告」（含 sku/quantity-available 列）`);
  }
  return buildInventoryRows(matrix, headerRow, INV_INVENTORY_MAP, 'inventory');
}
