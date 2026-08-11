// 数据导入页 —— 支持亚马逊 6 类报表导入（交易明细/利润报表/英文结算/业务报告/广告报告/库存报告）
// 上传后自动识别文件类型，按 dedupKey 去重入库，并记录导入日志
// 云端不可达时数据保存在本地缓存，云端恢复后自动同步；云端未建表时给出建表引导
import React, { useState, useRef } from 'react';
import {
  Upload, Button, Card, Table, Tag, message, Modal, Statistic,
  Row, Col, Typography, Alert, Divider, Popconfirm
} from 'antd';
import {
  InboxOutlined, FileExcelOutlined, CheckCircleOutlined,
  WarningOutlined, DeleteOutlined
} from '@ant-design/icons';
import { useLiveQuery } from '../hooks/useLiveQuery.js';
import db, { checkCloudStatus } from '../db/database.js';
import { pushFullDb, createEmptyDb } from '../db/githubStore.js';
import { parseExcelFile, FILE_TYPE } from '../utils/excelImporter.js';
import { useStore } from '../context/StoreContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { PERM, permLevelName } from '../utils/permissions.js';

const { Dragger } = Upload;
const { Text, Title } = Typography;

// 6 类报表 → 数据库表 / 中文名 映射（导入入库与展示共用）
const FILE_TYPE_CONFIG = {
  [FILE_TYPE.TRANSACTION]: { table: db.transactions, name: '交易明细' },
  [FILE_TYPE.PROFIT]: { table: db.profitReports, name: '利润报表' },
  [FILE_TYPE.SETTLEMENT]: { table: db.settlements, name: '英文结算报表' },
  [FILE_TYPE.BUSINESS]: { table: db.businessReports, name: '业务报告' },
  [FILE_TYPE.AD]: { table: db.adReports, name: '广告报告' },
  [FILE_TYPE.INVENTORY]: { table: db.inventoryRecords, name: '库存报告' }
};

// 云端存储错误识别（旧版 Supabase 兼容；GitHub 模式下多数错误不会触发）
function isMissingTableError(err) {
  const msg = String(err?.message || err || '');
  return ['relation', 'does not exist', '42P01', 'could not'].some((k) => msg.includes(k));
}

export default function DataImport() {
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState(null);
  // 批量导入队列：一次可拖入多个文件，逐个串行导入，避免并发写库冲突
  const queueRef = useRef([]);
  const processingRef = useRef(false);
  const [progress, setProgress] = useState(null); // { done, total }
  // 店铺上下文：导入的数据归属当前选中店铺；权限：清空全部数据需管理员
  const { stores, currentStoreId } = useStore();
  const { can } = useAuth();

  // 给导入的数据行补写店铺归属（storeId）
  // 规则：利润报表优先按 Excel「店铺」名称匹配 stores 表；其余/未命中归入当前选中店铺；
  //       顶栏为「全部店铺」时回退到第一个店铺，避免数据无归属
  const assignStoreToRows = async (rows, fileType) => {
    if (!rows || !rows.length) return rows;
    // 给行补写去重键店铺后缀（dedupKey 原不含店铺，跨店铺同 SKU 会被误判重复跳过）
    const withStoreSuffix = (row) => {
      if (row.dedupKey) row.dedupKey = `${row.dedupKey}|${row.storeId}`;
      return row;
    };
    const targetStoreId = currentStoreId && currentStoreId !== 'all'
      ? currentStoreId
      : (stores && stores.length ? stores[0].id : 'default');
    // 利润报表：按 Excel 店铺名匹配 stores 表
    if (fileType === FILE_TYPE.PROFIT && stores && stores.length) {
      const nameToId = new Map(stores.map((s) => [String(s.name || '').trim(), s.id]));
      for (const row of rows) {
        const matched = row.store && nameToId.get(String(row.store).trim());
        row.storeId = matched || targetStoreId;
        withStoreSuffix(row);
      }
      return rows;
    }
    // 其余 5 类报表（交易明细/结算/业务/广告/库存）：无店铺列，统一归入目标店铺
    for (const row of rows) {
      row.storeId = targetStoreId;
      withStoreSuffix(row);
    }
    return rows;
  };

  // 6 类报表数据量统计（云端不可达时回退本地缓存）
  const transactionsCount = useLiveQuery(() => db.transactions.count(), [], 0);
  const profitReportsCount = useLiveQuery(() => db.profitReports.count(), [], 0);
  const settlementsCount = useLiveQuery(() => db.settlements.count(), [], 0);
  const businessReportsCount = useLiveQuery(() => db.businessReports.count(), [], 0);
  const adReportsCount = useLiveQuery(() => db.adReports.count(), [], 0);
  const inventoryRecordsCount = useLiveQuery(() => db.inventoryRecords.count(), [], 0);
  const importLogs = useLiveQuery(
    () => db.importLogs.reverse().limit(20).toArray(),
    [],
    []
  );

  // 导入单个文件，返回该文件的处理结果（供批量队列汇总）
  const importOneFile = async (file) => {
    // 函数内二次校验（按钮 disabled / 入口拦截之外的最后防线，防 devtools 绕过）
    if (!can(PERM.IMPORT_DATA)) {
      return { fileName: file?.name || '', error: `需要 ${permLevelName(PERM.IMPORT_DATA)} 及以上权限才能导入数据` };
    }
    try {
      const result = await parseExcelFile(file);
      const { fileType, rows, sheetName } = result;

      // 根据识别出的类型找到对应的数据库表；未知类型直接报错
      const config = FILE_TYPE_CONFIG[fileType];
      if (!config) {
        return { fileName: file.name, error: `无法识别的文件类型：${fileType}。请到「帮助中心 → 报表字典」查看 6 类报表的正确格式` };
      }

      // 生成导入批次 ID：本次导入的所有行共享同一 batchId，
      // 供「导入历史」按批次删除该次导入的全部数据
      const batchId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      let successCount = 0;
      let duplicateCount = 0;
      const errorCount = 0;

      // 先补写店铺归属（storeId + dedupKey 店铺后缀），再按该键去重，
      // 保证与存量数据（迁移 v2 后均带后缀）格式一致，避免重复导入
      if (rows && rows.length) {
        await assignStoreToRows(rows, fileType);
      }

      // 读取该表已有记录的 dedupKey 集合，仅入库新行（同文件内重复行也跳过）
      let existingKeys = new Set();
      try {
        existingKeys = new Set(
          (await config.table.toArray()).map((r) => r.dedupKey)
        );
      } catch (e) {
        // 云端不可达且本地无缓存（如首次离线导入）：按空集合处理，允许导入
        existingKeys = new Set();
      }
      const newRows = [];
      for (const row of rows) {
        if (existingKeys.has(row.dedupKey)) duplicateCount++;
        else {
          // 记录导入批次（供按批次删除）
          row.importBatchId = batchId;
          newRows.push(row);
        }
      }
      // 入库（店铺归属已在上面补写完成）
      if (newRows.length) {
        await config.table.bulkAdd(newRows);
      }
      successCount = newRows.length;

      // 写入导入日志（失败不阻塞导入结果，只提示）
      try {
        await db.importLogs.add({
          fileName: file.name,
          fileType,
          sheetName,
          importedAt: new Date().toISOString(),
          successCount,
          duplicateCount,
          errorCount,
          totalParsed: rows.length,
          importBatchId: batchId
        });
      } catch (logErr) {
        if (isMissingTableError(logErr)) {
          message.warning('导入日志写入失败（云端存储异常），可到「设置 → 云端同步」检查配置');
        } else {
          console.error('写入导入日志失败:', logErr);
        }
      }

      return {
        fileName: file.name,
        fileType,
        totalParsed: rows.length,
        successCount,
        duplicateCount,
        errorCount
      };
    } catch (err) {
      console.error('导入失败:', err);
      return { fileName: file.name, error: err.message };
    }
  };

  // 批量导入：依次处理队列里的所有文件，最后汇总成一份报告
  const runQueue = async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    setImporting(true);
    setReport(null);
    const total = queueRef.current.length;
    setProgress({ done: 0, total });
    const results = [];
    while (queueRef.current.length) {
      const file = queueRef.current.shift();
      setProgress((p) => ({ done: p.done + 1, total: p.total }));
      // eslint-disable-next-line no-await-in-loop
      results.push(await importOneFile(file));
    }
    processingRef.current = false;
    setImporting(false);
    setProgress(null);

    // 汇总统计
    const ok = results.filter((r) => !r.error);
    const failed = results.filter((r) => r.error);
    const totalParsed = ok.reduce((s, r) => s + (r.totalParsed || 0), 0);
    const successCount = ok.reduce((s, r) => s + (r.successCount || 0), 0);
    const duplicateCount = ok.reduce((s, r) => s + (r.duplicateCount || 0), 0);
    setReport({ fileCount: results.length, totalParsed, successCount, duplicateCount, errorCount: failed.length, files: results });

    if (ok.length) {
      message.success(`批量导入完成：${ok.length} 个文件，成功 ${successCount} 条，重复 ${duplicateCount} 条`);
    }
    // 空文件告警：成功 0 条且解析 0 行，提示用户检查文件内容
    if (ok.some((r) => !r.error && !r.successCount && (!r.totalParsed || r.totalParsed === 0))) {
      message.warning('有文件解析出 0 条数据（文件内无数据或表头格式不匹配），请在报告中查看明细');
    }
    if (failed.length) {
      message.warning(`${failed.length} 个文件导入失败，详见导入报告`);
    }

    // 云端不可达时追加提示：数据已保存到本地缓存，恢复后自动同步
    try {
      const cloud = await checkCloudStatus();
      if (cloud.status !== 'online') {
        message.warning('数据已保存到本地，云端恢复后自动同步');
      }
    } catch (e) {
      // 云端检测异常不影响导入结果
      console.warn('云端状态检测失败:', String(e?.message || e));
    }
  };

  // 拖入/选择文件入口：加入队列并启动批量处理
  const handleBeforeUpload = (file, fileList) => {
    // 权限校验：导入数据需普通用户及以上（Lv.2+），只读用户（Lv.1）不可写库
    if (!can(PERM.IMPORT_DATA)) {
      message.error('只读用户无导入权限，请使用可写账号登录');
      return false;
    }
    // 选择多个文件时，只用最后一个文件触发一次入队，避免重复
    if (fileList && fileList.length > 1 && fileList[fileList.length - 1] !== file) {
      return false;
    }
    const files = fileList && fileList.length ? fileList : [file];
    queueRef.current.push(...files);
    runQueue();
    return false; // 阻止 antd 默认上传
  };

  const handleClearAll = () => {
    // 权限校验：清空全部数据仅管理员（Lv.4）可操作
    if (!can(PERM.DELETE_ALL)) {
      message.error('需要管理员权限才能清空全部数据');
      return;
    }
    Modal.confirm({
      title: '确认清空所有数据？',
      content: '将删除全部 6 类报表（交易明细/利润报表/英文结算/业务报告/广告报告/库存报告）数据，操作不可恢复，云端与本机会一并清空。',
      okText: '清空',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        await db.cleanAll();
        // 同步清空云端：全量推送空库并清除待同步标记，避免"本地空表待上传"覆盖云端数据
        try {
          await pushFullDb(createEmptyDb());
        } catch (e) {
          message.warning('本地已清空，但云端清空失败，请到「设置 → 云端同步」手动「推送到云端」');
        }
        setReport(null);
        message.success('已清空所有数据（云端与本机）');
      }
    });
  };

  // fileType → 中文名（导入报告、导入历史共用）
  const typeText = (t) => FILE_TYPE_CONFIG[t]?.name || '未知';

  // 删除某次导入：按 batchId 删除该批导入的业务数据 + 删除导入日志
  // 说明：仅能删除带 importBatchId 的新导入（旧版存量日志无批次号，无法定位数据）
  const handleDeleteImport = async (log) => {
    // 按批次删除整批数据 = 批量删除，级别须为 DELETE_BY_BATCH(3)，与设置页"按月份/类型删除"一致
    if (!can(PERM.DELETE_BY_BATCH)) {
      message.error(`需要 ${permLevelName(PERM.DELETE_BY_BATCH)} 及以上权限才能删除整批导入`);
      return;
    }
    try {
      const { importBatchId, fileType } = log;
      if (importBatchId) {
        // 找到该类型对应的表，删除本批次数据
        const cfg = FILE_TYPE_CONFIG[fileType];
        if (cfg && cfg.table) {
          const all = await cfg.table.toArray();
          const kept = all.filter((r) => String(r.importBatchId || '') !== String(importBatchId));
          if (kept.length !== all.length) {
            await cfg.table.bulkPut(kept);
          }
        }
      }
      // 删除导入日志
      await db.importLogs.delete(log.id);
      message.success('已删除该次导入' + (importBatchId ? '及其数据' : '（存量记录无批次，仅删除日志）'));
    } catch (e) {
      message.error('删除失败: ' + e.message);
    }
  };

  // 顶部 6 类报表统计卡片
  const statCards = [
    { title: '交易明细', value: transactionsCount },
    { title: '利润报表', value: profitReportsCount },
    { title: '英文结算', value: settlementsCount },
    { title: '业务报告', value: businessReportsCount },
    { title: '广告报告', value: adReportsCount },
    { title: '库存报告', value: inventoryRecordsCount }
  ];

  return (
    <div>
      <Title level={4} style={{ marginTop: 0, marginBottom: 16 }}>数据导入</Title>

      {/* 6 类报表数据量统计 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {statCards.map((c) => (
          <Col xs={12} md={4} key={c.title}>
            <Card size="small">
              <Statistic title={c.title} value={c.value} suffix="条" />
            </Card>
          </Col>
        ))}
      </Row>

      {/* 数据管理（清空全部数据仅管理员可操作） */}
      <Row justify="end" style={{ marginBottom: 16 }}>
        <Col>
          <Button danger size="small" icon={<DeleteOutlined />} onClick={handleClearAll} disabled={!can(PERM.DELETE_ALL)}>
            清空所有数据{!can(PERM.DELETE_ALL) ? '（仅管理员）' : ''}
          </Button>
        </Col>
      </Row>

      <Card style={{ marginBottom: 16 }}>
        <Dragger
          accept=".xlsx,.xls,.csv"
          multiple
          showUploadList={false}
          beforeUpload={handleBeforeUpload}
          disabled={importing}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">
            {importing
              ? `正在解析和导入...（${progress?.done ?? 0}/${progress?.total ?? 0}）`
              : '点击或拖拽 Excel 文件到此区域上传（支持一次选择多个文件）'}
          </p>
          <p className="ant-upload-hint">
            支持 .xlsx / .csv 格式，可一次拖入多个文件批量导入。系统将自动识别 6 类报表：交易明细、利润报表、英文结算报表、业务报告、广告报告、库存报告
          </p>
        </Dragger>
      </Card>

      {report && (
        <Card title={<><FileExcelOutlined /> 导入报告</>} style={{ marginBottom: 16 }}>
          {report.files && report.files.some((f) => f.error) && report.files.length === 1 ? (
            <Alert
              type="error"
              showIcon
              message={`文件 ${report.files[0].fileName} 导入失败`}
              description={report.files[0].error}
            />
          ) : (
            <Row gutter={16}>
              <Col span={4}>
                <Statistic title="文件数" value={report.fileCount} />
              </Col>
              <Col span={5}>
                <Statistic title="解析条数" value={report.totalParsed} />
              </Col>
              <Col span={5}>
                <Statistic
                  title="成功导入"
                  value={report.successCount}
                  valueStyle={{ color: '#3f8600' }}
                  prefix={<CheckCircleOutlined />}
                />
              </Col>
              <Col span={5}>
                <Statistic
                  title="重复跳过"
                  value={report.duplicateCount}
                  valueStyle={{ color: '#fa8c16' }}
                  prefix={<WarningOutlined />}
                />
              </Col>
              <Col span={5}>
                <Statistic title="失败文件" value={report.errorCount} valueStyle={{ color: '#cf1322' }} />
              </Col>
            </Row>
          )}
          {report.files && report.files.length > 1 && (
            <Table
              size="small"
              rowKey="fileName"
              pagination={false}
              dataSource={report.files}
              style={{ marginTop: 12 }}
              columns={[
                { title: '文件名', dataIndex: 'fileName', ellipsis: true },
                {
                  title: '类型',
                  dataIndex: 'fileType',
                  width: 110,
                  render: (t, r) => (r.error ? <Tag color="red">失败</Tag> : <Tag color="blue">{typeText(t)}</Tag>)
                },
                { title: '解析', dataIndex: 'totalParsed', width: 70, align: 'right' },
                { title: '成功', dataIndex: 'successCount', width: 70, align: 'right' },
                { title: '重复', dataIndex: 'duplicateCount', width: 70, align: 'right' },
                {
                  title: '说明',
                  dataIndex: 'error',
                  width: 200,
                  ellipsis: true,
                  render: (v) => v || ''
                }
              ]}
            />
          )}
        </Card>
      )}

      <Card title="导入历史" size="small">
        {importLogs && importLogs.length ? (
          <Table
            size="small"
            rowKey="id"
            pagination={{ pageSize: 10 }}
            scroll={{ x: 700 }}
            dataSource={importLogs}
            columns={[
              {
                title: '时间',
                dataIndex: 'importedAt',
                width: 180,
                render: (v) => new Date(v).toLocaleString('zh-CN')
              },
              { title: '文件名', dataIndex: 'fileName', ellipsis: true },
              {
                title: '类型',
                dataIndex: 'fileType',
                width: 100,
                render: (t) => <Tag color="blue">{typeText(t)}</Tag>
              },
              { title: '解析', dataIndex: 'totalParsed', width: 70, align: 'right' },
              { title: '成功', dataIndex: 'successCount', width: 70, align: 'right' },
              { title: '重复', dataIndex: 'duplicateCount', width: 70, align: 'right' },
              {
                title: '操作', width: 110, fixed: 'right',
                render: (_, log) => (
                  <Popconfirm
                    title={log.importBatchId ? '删除该次导入及对应数据？' : '删除该次导入记录？'}
                    description={log.importBatchId
                      ? `将删除 ${typeText(log.fileType)} ${log.successCount} 条数据并移除记录，操作不可恢复。`
                      : '存量记录无批次号，仅删除导入日志，不影响已导入数据。'}
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => handleDeleteImport(log)}
                  >
                    <Button type="link" size="small" danger icon={<DeleteOutlined />} disabled={!can(PERM.DELETE_BY_BATCH)}>
                      删除
                    </Button>
                  </Popconfirm>
                )
              }
            ]}
          />
        ) : (
          <Alert type="info" showIcon message="暂无导入记录，请上传 Excel 文件" />
        )}
      </Card>

      <Divider />
      <Alert
        type="info"
        showIcon
        message="支持的数据文件"
        description={
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>
              <Text strong>交易明细</Text>：单行表头，需包含「交易类型」字段（10 列：日期/交易状态/交易类型/订单编号/商品详情/商品价格总额/促销返点总额/亚马逊所收费用/其他/总计）
            </li>
            <li>
              <Text strong>利润报表</Text>：双行表头，第 1 行需包含「亚马逊回款」（165 列店铺级汇总）
            </li>
            <li>
              <Text strong>英文结算报表</Text>：Settlement Report V2（tab 分隔），表头含 settlement-id / total-amount
            </li>
            <li>
              <Text strong>业务报告</Text>：销售量与访问量（Sales & Traffic），表头含 sessions / units ordered
            </li>
            <li>
              <Text strong>广告报告</Text>：广告活动报告（SP/SD/SB），表头含 campaign name / impressions / clicks
            </li>
            <li>
              <Text strong>库存报告</Text>：FBA 库存 / 滞留 / 赔偿，表头含 fnsku / sku / case id 等
            </li>
          </ul>
        }
      />
    </div>
  );
}
