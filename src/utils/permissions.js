// 权限定义 —— 每个操作所需最低级别
// 级别：4=管理员，3=高级用户，2=普通用户，1=只读用户

export const PERM = {
  // 数据导入
  IMPORT_DATA: 2,
  // 导出
  EXPORT_EXCEL: 2,
  EXPORT_PDF: 3,
  // 删除（分级）
  DELETE_SINGLE_TX: 2,       // 单条交易删除
  DELETE_BY_BATCH: 3,         // 按批次删除
  DELETE_BY_TYPE: 3,          // 按类型删除（仅删交易/仅删利润）
  DELETE_BY_MONTH: 3,         // 按月份删除
  DELETE_BY_STORE: 3,         // 按店铺删除
  DELETE_ALL: 4,              // 清空全部
  FACTORY_RESET: 4,           // 工厂重置
  // 账户管理
  MANAGE_ACCOUNTS: 4,
  MANAGE_ROLES: 4,
  MANAGE_STORES: 4,
  // 视图管理
  SAVE_VIEW: 2,
  MANAGE_ALL_VIEWS: 3,
  // 操作日志查看
  VIEW_LOGS: 3,
  // 其他
  CHANGE_PASSWORD: 1,
  USE_GLOBAL_SEARCH: 1
};

/**
 * 检查是否有权限
 * @param {number} userLevel 当前用户级别
 * @param {number} requiredLevel 所需最低级别
 * @returns {boolean}
 */
export function hasPermission(userLevel, requiredLevel) {
  if (!userLevel || typeof userLevel !== 'number') return false;
  return userLevel >= requiredLevel;
}

/**
 * 权限文案：返回操作所需级别名称
 */
export function permLevelName(level) {
  const map = { 4: '管理员', 3: '高级用户', 2: '普通用户', 1: '只读用户' };
  return map[level] || `Lv.${level}`;
}
