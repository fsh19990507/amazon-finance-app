import React, { useState } from 'react';
import {
  Upload, Button, Card, Table, Tag, message, Modal, Statistic,
  Row, Col, Space, Typography, Alert, Divider
} from 'antd';
import {
  InboxOutlined, FileExcelOutlined, CheckCircleOutlined,
  WarningOutlined, DeleteOutlined
} from '@ant-design/icons';
import { useLiveQuery } from '../hooks/useLiveQuery.js';
import db from '../db/database.js';
import { parseExcelFile, FILE_TYPE } from '../utils/excelImporter.js';

const { Dragger } = Upload;
const { Text, Title } = Typography;

export default function DataImport() {
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState(null);

  const transactionsCount = useLiveQuery(() => db.transactions.count(), [], 0);
  const profitReportsCount = useLiveQuery(() => db.profitReports.count(), [], 0);
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

      let successCount = 0;
      let duplicateCount = 0;
      const errorCount = 0;

      if (fileType === FILE_TYPE.TRANSACTION) {
        // 仅按 DB 已有 dedupKey 去重，允许同文件内重复行
        const existingKeys = new Set(
          (await db.transactions.toArray()).map((r) => r.dedupKey)
        );
        const newRows = [];
        for (const row of rows) {
          if (existingKeys.has(row.dedupKey)) duplicateCount++;
          else newRows.push(row);
        }
        if (newRows.length) await db.transactions.bulkAdd(newRows);
        successCount = newRows.length;
      } else if (fileType === FILE_TYPE.PROFIT) {
        const existingKeys = new Set(
          (await db.profitReports.toArray()).map((r) => r.dedupKey)
        );
        const newRows = [];
        for (const row of rows) {
          if (existingKeys.has(row.dedupKey)) duplicateCount++;
          else newRows.push(row);
        }
        if (newRows.length) await db.profitReports.bulkAdd(newRows);
        successCount = newRows.length;
      }

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

      setReport({
        fileName: file.name,
        fileType,
        totalParsed: rows.length,
        successCount,
        duplicateCount,
        errorCount
      });
      message.success(`导入完成：成功 ${successCount} 条，重复 ${duplicateCount} 条`);
    } catch (err) {
      console.error('导入失败:', err);
      message.error(`导入失败：${err.message}`);
      setReport({ fileName: file.name, error: err.message });
    } finally {
      setImporting(false);
    }
    return false; // 阻止 antd 默认上传
  };

  const handleClearAll = () => {
    Modal.confirm({
      title: '确认清空所有数据？',
      content: '将删除所有交易明细和利润报表数据，操作不可恢复。',
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

  const typeText = (t) =>
    t === FILE_TYPE.TRANSACTION ? '交易明细' :
    t === FILE_TYPE.PROFIT ? '利润报表' : '未知';

  return (
    <div>
      <Title level={4} style={{ marginTop: 0, marginBottom: 16 }}>数据导入</Title>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card size="small">
            <Statistic title="交易明细" value={transactionsCount} suffix="条" />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic title="利润报表" value={profitReportsCount} suffix="条" />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text type="secondary">数据管理</Text>
              <Button danger size="small" icon={<DeleteOutlined />} onClick={handleClearAll}>
                清空所有数据
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>

      <Card style={{ marginBottom: 16 }}>
        <Dragger
          accept=".xlsx,.xls"
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
            支持 .xlsx 格式。系统将自动识别「交易明细」和「利润报表」两种文件类型
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
          </ul>
        }
      />
    </div>
  );
}
