// 财务数据聚合层 —— 所有函数均被 UI 实际使用，无死代码
import db from '../db/database.js';

// ============== 基础查询 ==============

/**
 * 判断数据行是否属于指定店铺（兼容无 storeId 的存量数据：归入默认店铺）
 * @param {Object} row 数据行
 * @param {string} storeId 店铺 ID；'all'/空 表示不限制
 */
export function matchesStoreId(row, storeId) {
  if (!storeId || storeId === 'all') return true;
  if (storeId === 'default') {
    return row?.storeId === 'default' || !row?.storeId;
  }
  return row?.storeId === storeId;
}

/**
 * 取所有利润报表（按月份升序）
 * @param {string} [storeId] 店铺 ID，不传则全部
 */
export async function getAllProfitReports(storeId) {
  let all;
  if (storeId && storeId !== 'all') {
    all = (await db.profitReports.toArray()).filter((r) => matchesStoreId(r, storeId));
  } else {
    all = await db.profitReports.toArray();
  }
  return all.sort((a, b) => String(a.month).localeCompare(String(b.month)));
}

/**
 * 取所有交易明细（按日期升序）
 * @param {string} [storeId] 店铺 ID，不传则全部
 */
export async function getAllTransactions(storeId) {
  let all;
  if (storeId && storeId !== 'all') {
    all = (await db.transactions.toArray()).filter((t) => matchesStoreId(t, storeId));
  } else {
    all = await db.transactions.toArray();
  }
  return all.sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

// ============== 总支出 ==============

/** 计算单条利润报表的总支出（所有费用字段求和，含采购/头程） */
export function computeTotalExpense(profit) {
  if (!profit) return 0;
  const fields = [
    'commission', 'exclusiveSales', 'trademarkLicense',
    'fbaFee', 'fbaMcfFee', 'fbmShipping', 'giftWrap', 'buyerShipping',
    'mcfWeightFee', 'fixedFee', 'mediaFee', 'fbaWeightFee', 'codFee',
    'adSpend', 'sdAdSpend', 'sbProduct', 'sbVideo', 'sbStore', 'adDiff',
    'ldFee', 'coupon', 'vine',
    'subscription', 'storageFee', 'storageDiff',
    'longTermStorageFee', 'longTermStorageDiff',
    'disposalFee', 'removalFee', 'exclusiveServiceFee',
    'awdStorageFee', 'awdHandlingFee', 'awdShippingFee', 'storageOverFee',
    'returnInboundFee', 'inboundConfigFee', 'inboundDefectFee',
    'manualFee', 'labelingFee', 'bagFee', 'opaqueBagFee', 'bubbleWrapFee',
    'skuOverFee', 'postageWeightFee', 'returnLabelFee',
    'fbaPurchaseCost', 'fbmPurchaseCost', 'fbaFirstMile', 'fbmFirstMile',
    'fbmShippingCost', 'reviewPrincipal', 'reviewCommission', 'customFixedFee'
  ];
  let total = 0;
  for (const f of fields) total += profit[f] || 0;
  return total;
}

// ============== 交易明细汇总 ==============

/** 按月份聚合交易明细，返回资金状态/类型汇总（可按店铺过滤） */
export async function getTransactionSummaryByMonth(month, storeId) {
  let rows = await db.transactions.toArray();
  if (month) rows = rows.filter((r) => String(r.month) === String(month));
  if (storeId && storeId !== 'all') rows = rows.filter((r) => matchesStoreId(r, storeId));
  const summary = {
    total: rows.length,
    disbursedCount: 0,
    postponedCount: 0,
    disbursedAmount: 0,
    postponedAmount: 0,
    orderPaymentTotal: 0,
    serviceFeeTotal: 0,
    settlementTotal: 0,
    byType: {}
  };
  for (const r of rows) {
    if (r.status === '已发放') {
      summary.disbursedCount++;
      summary.disbursedAmount += r.total || 0;
    } else if (r.status === '已推迟') {
      summary.postponedCount++;
      summary.postponedAmount += r.total || 0;
    }
    summary.byType[r.type] = summary.byType[r.type] || { count: 0, total: 0 };
    summary.byType[r.type].count++;
    summary.byType[r.type].total += r.total || 0;
    if (r.type === '订单付款') summary.orderPaymentTotal += r.total || 0;
    else if (r.type === '服务费用') summary.serviceFeeTotal += r.total || 0;
    else if (r.type === '清算') summary.settlementTotal += r.total || 0;
  }
  return summary;
}

// ============== 费用结构 ==============

/** 费用科目定义（name: 显示名, key: profitReports 字段, group: 大类） */
export const EXPENSE_ITEMS = [
  { name: '销售佣金', key: 'commission', group: '订单支出' },
  { name: 'FBA配送费', key: 'fbaFee', group: '订单支出' },
  { name: 'FBA多渠道配送费', key: 'fbaMcfFee', group: '订单支出' },
  { name: 'FBM便捷配送费', key: 'fbmShipping', group: '订单支出' },
  { name: '礼品包装费', key: 'giftWrap', group: '订单支出' },
  { name: '买家运费扣除', key: 'buyerShipping', group: '订单支出' },
  { name: 'MCF计重费', key: 'mcfWeightFee', group: '订单支出' },
  { name: '固定费', key: 'fixedFee', group: '订单支出' },
  { name: '媒体类成交费', key: 'mediaFee', group: '订单支出' },
  { name: 'FBA计重费', key: 'fbaWeightFee', group: '订单支出' },
  { name: 'COD扣款', key: 'codFee', group: '订单支出' },
  { name: '独家销售计划', key: 'exclusiveSales', group: '订单支出' },
  { name: '商标使用许可佣金', key: 'trademarkLicense', group: '订单支出' },
  { name: 'SP广告费', key: 'adSpend', group: '广告花费' },
  { name: 'SD广告费', key: 'sdAdSpend', group: '广告花费' },
  { name: 'SB商品集', key: 'sbProduct', group: '广告花费' },
  { name: 'SB视频', key: 'sbVideo', group: '广告花费' },
  { name: 'SB旗舰店', key: 'sbStore', group: '广告花费' },
  { name: '广告差异分摊', key: 'adDiff', group: '广告花费' },
  { name: 'LD费', key: 'ldFee', group: '推广费' },
  { name: '优惠券', key: 'coupon', group: '推广费' },
  { name: 'Vine', key: 'vine', group: '推广费' },
  { name: '订阅费', key: 'subscription', group: '其余服务费' },
  { name: '月仓储费', key: 'storageFee', group: '其余服务费' },
  { name: '月仓储费差额', key: 'storageDiff', group: '其余服务费' },
  { name: '长期仓储费', key: 'longTermStorageFee', group: '其余服务费' },
  { name: '长期仓储费差额', key: 'longTermStorageDiff', group: '其余服务费' },
  { name: '销毁费', key: 'disposalFee', group: '其余服务费' },
  { name: '移除费', key: 'removalFee', group: '其余服务费' },
  { name: '专属服务费', key: 'exclusiveServiceFee', group: '其余服务费' },
  { name: 'AWD月仓储费', key: 'awdStorageFee', group: '其余服务费' },
  { name: 'AWD手续费', key: 'awdHandlingFee', group: '其余服务费' },
  { name: 'AWD配送费', key: 'awdShippingFee', group: '其余服务费' },
  { name: '仓储超量费', key: 'storageOverFee', group: '其余服务费' },
  { name: '退货入仓费', key: 'returnInboundFee', group: '其余服务费' },
  { name: '入库配置费', key: 'inboundConfigFee', group: '其余服务费' },
  { name: '入库缺陷费', key: 'inboundDefectFee', group: '其余服务费' },
  { name: '人工处理费', key: 'manualFee', group: '其余服务费' },
  { name: '贴标费', key: 'labelingFee', group: '其余服务费' },
  { name: '包装袋费', key: 'bagFee', group: '其余服务费' },
  { name: '不透明包装袋费', key: 'opaqueBagFee', group: '其余服务费' },
  { name: '气泡膜包装费', key: 'bubbleWrapFee', group: '其余服务费' },
  { name: 'SKU超量费', key: 'skuOverFee', group: '其余服务费' },
  { name: '邮资计重费', key: 'postageWeightFee', group: '其余服务费' },
  { name: '退货标签费', key: 'returnLabelFee', group: '其余服务费' },
  { name: 'FBA采购成本', key: 'fbaPurchaseCost', group: '采购成本' },
  { name: 'FBM采购成本', key: 'fbmPurchaseCost', group: '采购成本' },
  { name: 'FBA头程费用', key: 'fbaFirstMile', group: '采购成本' },
  { name: 'FBM头程费用', key: 'fbmFirstMile', group: '采购成本' },
  { name: '商品成本-FBM运费', key: 'fbmShippingCost', group: '采购成本' },
  { name: '测评本金', key: 'reviewPrincipal', group: '采购成本' },
  { name: '测评佣金', key: 'reviewCommission', group: '采购成本' },
  { name: '自定义费用', key: 'customFixedFee', group: '采购成本' }
];

/**
 * 构建费用结构明细列表（过滤 0 值，按 |value| 降序）
 * @param {object} profit 单条利润报表
 * @returns {Array<{name, key, group, value}>}
 */
export function buildExpenseBreakdown(profit) {
  if (!profit) return [];
  return EXPENSE_ITEMS
    .map((it) => ({ ...it, value: profit[it.key] || 0 }))
    .filter((it) => Math.abs(it.value) > 0.001)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
}

// ============== 时间维度聚合 ==============

/**
 * 按时间维度聚合多月份利润数据（真切换）
 * @param {'month'|'quarter'|'year'|'custom'} dim
 * @param {[string, string]} [range] 自定义时使用 ['2026-01','2026-12']
 * @returns {Promise<Array<{key, label, grossProfit, sales, expense, disbursement, count}>>}
 */
export async function getProfitSeriesByDimension(dim, range, storeId) {
  const all = await getAllProfitReports(storeId);
  if (!all.length) return [];

  const reduce = (groups) => Object.values(groups).sort((a, b) =>
    String(a.key).localeCompare(String(b.key))
  );

  if (dim === 'month') {
    return all.map((r) => ({
      key: r.month,
      label: r.month,
      grossProfit: r.grossProfit || 0,
      sales: (r.fbaSalesAmount || 0) + (r.fbmSalesAmount || 0),
      expense: computeTotalExpense(r),
      disbursement: r.disbursement || 0,
      count: 1
    }));
  }
  if (dim === 'quarter') {
    const groups = {};
    for (const r of all) {
      const [y, m] = r.month.split('-');
      const q = Math.ceil(parseInt(m, 10) / 3);
      const k = `${y}-Q${q}`;
      if (!groups[k]) groups[k] = { key: k, label: k, grossProfit: 0, sales: 0, expense: 0, disbursement: 0, count: 0 };
      groups[k].grossProfit += r.grossProfit || 0;
      groups[k].sales += (r.fbaSalesAmount || 0) + (r.fbmSalesAmount || 0);
      groups[k].expense += computeTotalExpense(r);
      groups[k].disbursement += r.disbursement || 0;
      groups[k].count++;
    }
    return reduce(groups);
  }
  if (dim === 'year') {
    const groups = {};
    for (const r of all) {
      const y = r.month.split('-')[0];
      if (!groups[y]) groups[y] = { key: y, label: y, grossProfit: 0, sales: 0, expense: 0, disbursement: 0, count: 0 };
      groups[y].grossProfit += r.grossProfit || 0;
      groups[y].sales += (r.fbaSalesAmount || 0) + (r.fbmSalesAmount || 0);
      groups[y].expense += computeTotalExpense(r);
      groups[y].disbursement += r.disbursement || 0;
      groups[y].count++;
    }
    return reduce(groups);
  }
  if (dim === 'custom' && range) {
    const [start, end] = range;
    return all
      .filter((r) => r.month >= start && r.month <= end)
      .map((r) => ({
        key: r.month,
        label: r.month,
        grossProfit: r.grossProfit || 0,
        sales: (r.fbaSalesAmount || 0) + (r.fbmSalesAmount || 0),
        expense: computeTotalExpense(r),
        disbursement: r.disbursement || 0,
        count: 1
      }));
  }
  return [];
}

// ============== 商品分析聚合 ==============

/**
 * 按 productName 聚合交易明细，输出商品维度指标
 * @param {Array} transactions 交易明细数组
 * @returns {Array} 按 productName 分组的聚合结果
 */
export function aggregateByProduct(transactions) {
  if (!transactions || !transactions.length) return [];
  const groups = {};
  for (const t of transactions) {
    const name = t.productName || '(空)';
    if (!groups[name]) {
      groups[name] = {
        productName: name,
        salesAmount: 0,       // 商品价格总额合计
        orderCount: 0,        // 订单付款笔数
        promoAmount: 0,       // 促销返点合计
        amazonFee: 0,         // 亚马逊所收费用合计
        other: 0,             // 其他合计
        netAmount: 0,         // 总计合计（净额）
        refundAmount: 0,      // 退款金额合计（type=订单付款 且 total<0 时计入？这里改为 total<0 计入退款）
        txCount: 0            // 所有相关交易笔数
      };
    }
    const g = groups[name];
    g.txCount++;
    g.salesAmount += t.productAmount || 0;
    g.promoAmount += t.promoAmount || 0;
    g.amazonFee += t.amazonFee || 0;
    g.other += t.other || 0;
    g.netAmount += t.total || 0;
    if (t.type === '订单付款') g.orderCount++;
    if ((t.total || 0) < 0 && t.type === '订单付款') g.refundAmount += t.total;
  }
  return Object.values(groups);
}

// ============== 环比/同比 ==============

/**
 * 计算两个值的环比变化
 * @returns {{delta: number, deltaPercent: number, direction: 'up'|'down'|'flat'}}
 */
export function computeMoM(current, previous) {
  if (!previous || previous === 0) {
    return { delta: current || 0, deltaPercent: null, direction: 'flat' };
  }
  const delta = (current || 0) - previous;
  const deltaPercent = delta / Math.abs(previous);
  const direction = delta > 0.001 ? 'up' : delta < -0.001 ? 'down' : 'flat';
  return { delta, deltaPercent, direction };
}

/**
 * 从序列中取指定月份的上一期数据
 * @param {Array} series getProfitSeriesByDimension 返回的序列
 * @param {string} currentKey 当前 key
 */
export function getPreviousPeriod(series, currentKey) {
  if (!series || !series.length) return null;
  const idx = series.findIndex((s) => s.key === currentKey);
  if (idx <= 0) return null;
  return series[idx - 1];
}

// ============== 异常检测 ==============

/**
 * 检测异常交易（单笔费用绝对值 > 月均值 × 倍数）
 * @param {Array} transactions
 * @param {number} [threshold=3] 倍数阈值
 */
export function detectAnomalies(transactions, threshold = 3) {
  if (!transactions || !transactions.length) return [];
  const total = transactions.reduce((s, t) => s + Math.abs(t.total || 0), 0);
  const avg = total / transactions.length;
  const anomalies = [];
  for (const t of transactions) {
    const abs = Math.abs(t.total || 0);
    if (abs > avg * threshold) {
      anomalies.push({
        ...t,
        anomalyReason: `金额 ${abs.toFixed(2)} 是均值 ${avg.toFixed(2)} 的 ${(abs / avg).toFixed(1)} 倍`
      });
    }
  }
  return anomalies;
}

// ============== 日历热力图数据 ==============

/**
 * 从交易明细生成每日交易额数据（用于日历热力图）
 * @param {Array} transactions
 * @returns {Array<{date: string, value: number}>}
 */
export function buildDailyHeatmapData(transactions) {
  if (!transactions || !transactions.length) return [];
  const map = {};
  for (const t of transactions) {
    if (!t.date) continue;
    if (!map[t.date]) map[t.date] = 0;
    // 只统计订单付款的收入
    if (t.type === '订单付款') {
      map[t.date] += t.total || 0;
    }
  }
  return Object.entries(map)
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

// ============== 瀑布图数据 ==============

/**
 * 构建瀑布图数据项（销售额 → 扣各项费用 → 毛利润）
 * @param {object} profit 单条利润报表
 * @param {number} topN 显示前 N 大费用，其余合并为"其他"
 */
export function buildWaterfallItems(profit, topN = 6) {
  if (!profit) return [];
  const sales = (profit.fbaSalesAmount || 0) + (profit.fbmSalesAmount || 0);
  const items = [
    { name: '销售额', value: sales }
  ];
  const expenses = buildExpenseBreakdown(profit)
    .filter((e) => e.value < 0)
    .slice(0, topN);
  let otherTotal = 0;
  const allExpenses = buildExpenseBreakdown(profit).filter((e) => e.value < 0);
  for (let i = topN; i < allExpenses.length; i++) {
    otherTotal += allExpenses[i].value;
  }
  for (const e of expenses) {
    items.push({ name: e.name, value: e.value });
  }
  if (Math.abs(otherTotal) > 0.001) {
    items.push({ name: '其他费用', value: otherTotal });
  }
  items.push({ name: '毛利润', value: profit.grossProfit || 0, isTotal: true });
  return items;
}
