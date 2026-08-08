// 数据导入页 —— 支持亚马逊 6 类报表导入（交易明细/利润报表/英文结算/业务报告/广告报告/库存报告）
// 上传后自动识别文件类型，按 dedupKey 去重入库，并记录导入日志
// 云端不可达时数据保存在本地缓存，云端恢复后自动同步；云端未建表时给出建表引导
import React, { useState } from 'react';
import {
  Upload, Button, Card, Table, Tag, message, Modal, Statistic,
  Row, Col, Typography, Alert, Divider
} from 'antd';
import {
  InboxOutlined, FileExcelOutlined, CheckCircleOutlined,
  WarningOutlined, DeleteOutlined
} from '@ant-design/icons';
import { useLiveQuery } from '../hooks/useLiveQuery.js';
import db, { checkCloudStatus } from '../db/database.js';
import { parseExcelFile, FILE_TYPE } from '../utils/excelImporter.js';

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

// 云端表不存在错误识别（Supabase / PostgreSQL 常见错误关键词）
function isMissingTableError(err) {
  const msg = String(err?.message || err || '');
  return ['relation', 'does not exist', '42P01', 'could not'].some((k) => msg.includes(k));
}

export default function DataImport() {
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState(null);

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

  const handleFile = async (file) => {
    setImporting(true);
    try {
      const result = await parseExcelFile(file);
      const { fileType, rows, sheetName } = result;

      // 根据识别出的类型找到对应的数据库表；未知类型直接报错
      const config = FILE_TYPE_CONFIG[fileType];
      if (!config) {
        throw new Error(`无法识别的文件类型：${fileType}。请到「帮助中心 → 报表字典」查看 6 类报表的正确格式`);
      }

      let successCount = 0;
      let duplicateCount = 0;
      const errorCount = 0;

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
        else newRows.push(row);
      }
      if (newRows.length) await config.table.bulkAdd(newRows);
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
          totalParsed: rows.length
        });
      } catch (logErr) {
        if (isMissingTableError(logErr)) {
          message.warning('云端未创建对应数据表，请登录 Supabase 控制台执行 supabase_schema.sql 建表后重试');
        } else {
          console.error('写入导入日志失败:', logErr);
        }
      }

      setReport({
        fileName: file.name,
        fileType,
        totalParsed: rows.length,
        successCount,
        duplicateCount,
        errorCount
      });
      message.success(`${config.name}导入完成：成功 ${successCount} 条，重复 ${duplicateCount} 条`);

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
    } catch (err) {
      console.error('导入失败:', err);
      if (isMissingTableError(err)) {
        // 云端表不存在：引导用户建表
        message.error('云端未创建对应数据表，请登录 Supabase 控制台执行 supabase_schema.sql 建表后重试');
      } else {
        message.error(`导入失败：${err.message}`);
      }
      setReport({ fileName: file.name, error: err.message });
    } finally {
      setImporting(false);
    }
    return false; // 阻止 antd 默认上传
  };

  const handleClearAll = () => {
    Modal.confirm({
      title: '确认清空所有数据？',
      content: '将删除全部 6 类报表（交易明细/利润报表/英文结算/业务报告/广告报告/库存报告）数据，操作不可恢复。',
      okText: '清空',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        await db.cleanAll();
        setReport(null);
        message.success('已清空所有数据');
      }
    });
  };

  // fileType → 中文名（导入报告、导入历史共用）
  const typeText = (t) => FILE_TYPE_CONFIG[t]?.name || '未知';

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

      {/* 数据管理 */}
      <Row justify="end" style={{ marginBottom: 16 }}>
        <Col>
          <Button danger size="small" icon={<DeleteOutlined />} onClick={handleClearAll}>
            清空所有数据
          </Button>
        </Col>
      </Row>

      <Card style={{ marginBottom: 16 }}>
        <Dragger
          accept=".xlsx,.xls,.csv"
          multiple={false}
          showUploadList={false}
          beforeUpload={handleFile}
          disabled={importing}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">
            {importing ? '正在解析和导入...' : '点击或拖拽 Excel 文件到此区域上传'}
          </p>
          <p className="ant-upload-hint">
            支持 .xlsx / .csv 格式。系统将自动识别 6 类报表：交易明细、利润报表、英文结算报表、业务报告、广告报告、库存报告
          </p>
        </Dragger>
      </Card>

      {report && (
        <Card title={<><FileExcelOutlined /> 导入报告</>} style={{ marginBottom: 16 }}>
          {report.error ? (
            <Alert
              type="error"
              showIcon
              message={`文件 ${report.fileName} 导入失败`}
              description={report.error}
            />
          ) : (
            <Row gutter={16}>
              <Col span={6}>
                <Statistic title="文件名" value={report.fileName} valueStyle={{ fontSize: 14 }} />
              </Col>
              <Col span={4}>
                <Statistic title="文件类型" value={typeText(report.fileType)} valueStyle={{ fontSize: 14 }} />
              </Col>
              <Col span={4}>
                <Statistic title="解析条数" value={report.totalParsed} />
              </Col>
              <Col span={4}>
                <Statistic
                  title="成功导入"
                  value={report.successCount}
                  valueStyle={{ color: '#3f8600' }}
                  prefix={<CheckCircleOutlined />}
                />
              </Col>
              <Col span={4}>
                <Statistic
                  title="重复跳过"
                  value={report.duplicateCount}
                  valueStyle={{ color: '#fa8c16' }}
                  prefix={<WarningOutlined />}
                />
              </Col>
              <Col span={2}>
                <Statistic title="异常" value={report.errorCount} valueStyle={{ color: '#cf1322' }} />
              </Col>
            </Row>
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
              { title: '重复', dataIndex: 'duplicateCount', width: 70, align: 'right' }
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
