// 操作日志工具 —— 记录重要操作（删除、导入、账户变更等）
import db from '../db/database.js';

export const LOG_ACTIONS = {
  IMPORT_TX: 'import_transactions',
  IMPORT_PROFIT: 'import_profit_report',
  DELETE_SINGLE_TX: 'delete_single_transaction',
  DELETE_BY_BATCH: 'delete_by_batch',
  DELETE_BY_TYPE: 'delete_by_type',
  DELETE_BY_MONTH: 'delete_by_month',
  DELETE_BY_STORE: 'delete_by_store',
  DELETE_ALL: 'delete_all',
  FACTORY_RESET: 'factory_reset',
  ADD_ACCOUNT: 'add_account',
  EDIT_ACCOUNT: 'edit_account',
  DELETE_ACCOUNT: 'delete_account',
  ADD_STORE: 'add_store',
  EDIT_STORE: 'edit_store',
  DELETE_STORE: 'delete_store',
  EDIT_ROLE: 'edit_role'
};

export async function writeLog({ accountId, action, targetType, targetId, amount, detail }) {
  if (!accountId) return;
  try {
    await db.operationLogs.add({
      accountId,
      action,
      targetType: targetType || '',
      targetId: targetId || '',
      amount: amount || 0,
      detail: detail || '',
      createdAt: Date.now()
    });
  } catch (e) {
    console.warn('writeLog failed:', e);
  }
}

export async function getLogs({ limit = 100, accountId, action } = {}) {
  let coll = db.operationLogs.orderBy('createdAt').reverse();
  const rows = await coll.limit(limit).toArray();
  let result = rows;
  if (accountId) result = result.filter((r) => r.accountId === accountId);
  if (action) result = result.filter((r) => r.action === action);
  return result;
}

export const actionLabels = {
  [LOG_ACTIONS.IMPORT_TX]: '导入交易明细',
  [LOG_ACTIONS.IMPORT_PROFIT]: '导入利润报表',
  [LOG_ACTIONS.DELETE_SINGLE_TX]: '删除单条交易',
  [LOG_ACTIONS.DELETE_BY_BATCH]: '按批次删除',
  [LOG_ACTIONS.DELETE_BY_TYPE]: '按类型删除',
  [LOG_ACTIONS.DELETE_BY_MONTH]: '按月份删除',
  [LOG_ACTIONS.DELETE_BY_STORE]: '按店铺删除',
  [LOG_ACTIONS.DELETE_ALL]: '清空全部数据',
  [LOG_ACTIONS.FACTORY_RESET]: '工厂重置',
  [LOG_ACTIONS.ADD_ACCOUNT]: '新增账户',
  [LOG_ACTIONS.EDIT_ACCOUNT]: '编辑账户',
  [LOG_ACTIONS.DELETE_ACCOUNT]: '删除账户',
  [LOG_ACTIONS.ADD_STORE]: '新增店铺',
  [LOG_ACTIONS.EDIT_STORE]: '编辑店铺',
  [LOG_ACTIONS.DELETE_STORE]: '删除店铺',
  [LOG_ACTIONS.EDIT_ROLE]: '编辑角色'
};
