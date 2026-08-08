// 库存报告分析页面 —— 基于 db.inventoryRecords 表（库存/滞留/赔偿三类报表）
// 核心功能：
//   1. KPI：可售库存、预留、在途、滞留 SKU 数、赔偿总额
//   2. 图表：库存分布柱状图（Top10）、滞留库存告警表格、赔偿汇总柱状图（Top10）
//   3. 表格：库存明细（SKU/FNSKU/ASIN/可售/预留/在途/总量）
// 依赖说明：antd（Card/Statistic/Table/Empty 等）、@ant-design/icons、
//           useLiveQuery（实时查询 db.inventoryRecords 表）、
//           useECharts + chartColorsFor（ECharts 图表与主题配色）、
//           formatMoney（金额格式化）
import React, { useMemo } from 'react';
import {
  Card, Row, Col, Statistic, Empty, Spin, Typography, Table, Tag
} from 'antd';
import {
  DatabaseOutlined, ClockCircleOutlined, RocketOutlined,
  WarningOutlined, PayCircleOutlined
} from '@ant-design/icons';
import { useLiveQuery } from '../hooks/useLiveQuery.js';
import db from '../db/database.js';
import { useECharts, chartColorsFor } from '../utils/useECharts.js';
import { useTheme } from '../context/ThemeContext.jsx';
import { useStore } from '../context/StoreContext.jsx';
import { matchesStoreId } from '../utils/dataAggregator.js';
import { formatMoney } from '../utils/parsers.js';

const { Title } = Typography;

export default function InventoryAnalysis() {
  const { themeId } = useTheme();
  const colors = chartColorsFor(themeId);
  const { currentStoreId } = useStore();

  // 加载库存报告数据（按当前选中店铺过滤；「全部店铺」时不限制）
  const data = useLiveQuery(
    () => db.inventoryRecords.toArray().then((rows) =>
      !currentStoreId || currentStoreId === 'all' ? rows : rows.filter((r) => matchesStoreId(r, currentStoreId))
    ),
    [currentStoreId],
    []
  );

  // ===== KPI 计算 =====
  const kpis = useMemo(() => {
    const list = data || [];
    // 可售库存：available 求和
    const available = list.reduce((s, x) => s + (x.available || 0), 0);
    // 预留：reserved 求和
    const reserved = list.reduce((s, x) => s + (x.reserved || 0), 0);
    // 在途：inbound 求和
    const inbound = list.reduce((s, x) => s + (x.inbound || 0), 0);
    // 滞留 SKU 数：reportType=stranded 且 strandedQty>0 的记录，按 sku 去重统计
    const strandedSkus = new Set(
      list
        .filter((x) => x.reportType === 'stranded' && (x.strandedQty || 0) > 0)
        .map((x) => x.sku)
        .filter(Boolean)
    );
    // 赔偿总额：reportType=reimbursement 的 amount 求和
    const reimbursement = list
      .filter((x) => x.reportType === 'reimbursement')
      .reduce((s, x) => s + (x.amount || 0), 0);
    return { available, reserved, inbound, strandedSkus: strandedSkus.size, reimbursement };
  }, [data]);

  // ===== 图表1：库存分布柱状图（仅 inventory，按 sku 分组求和 available，Top10） =====
  const distOption = useMemo(() => {
    const list = (data || []).filter((x) => x.reportType === 'inventory');
    const map = new Map();
    list.forEach((x) => {
      const key = x.sku || '未知SKU';
      map.set(key, (map.get(key) || 0) + (x.available || 0));
    });
    // 库存量从大到小取 Top10，再反转让最大项显示在柱状图顶部
    const items = [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
      .reverse();
    if (!items.length) return null;
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (p) => `${p[0].name}<br/>可售库存：${p[0].value} 件`
      },
      grid: { left: 130, right: 40, top: 20, bottom: 30 },
      xAxis: { type: 'value', minInterval: 1 },
      yAxis: { type: 'category', data: items.map((it) => it.name), axisLabel: { fontSize: 11 } },
      series: [
        {
          type: 'bar',
          data: items.map((it, idx) => ({
            value: it.value,
            itemStyle: { color: colors[idx % colors.length] }
          })),
          barWidth: '60%',
          label: { show: true, position: 'right', formatter: (p) => p.value.toFixed(0), fontSize: 11 }
        }
      ]
    };
  }, [data, colors]);
  const distChart = useECharts(distOption, [distOption], { toolbar: false, autoScale: false });

  // ===== 图表2：滞留库存告警（表格，仅 stranded 且 strandedQty>0，按滞留量降序） =====
  const strandedList = useMemo(() => {
    const list = data || [];
    return list
      .filter((x) => x.reportType === 'stranded' && (x.strandedQty || 0) > 0)
      .sort((a, b) => (b.strandedQty || 0) - (a.strandedQty || 0))
      .slice(0, 30);
  }, [data]);

  // ===== 图表3：赔偿汇总柱状图（仅 reimbursement，按 sku 分组求和 amount，Top10） =====
  const reimbOption = useMemo(() => {
    const list = (data || []).filter((x) => x.reportType === 'reimbursement');
    const map = new Map();
    list.forEach((x) => {
      const key = x.sku || '未知SKU';
      map.set(key, (map.get(key) || 0) + (x.amount || 0));
    });
    // 赔偿金额从大到小取 Top10，再反转让最大项显示在柱状图顶部
    const items = [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
      .reverse();
    if (!items.length) return null;
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (p) => `${p[0].name}<br/>赔偿金额：${formatMoney(p[0].value)}`
      },
      grid: { left: 130, right: 40, top: 20, bottom: 30 },
      xAxis: {
        type: 'value',
        axisLabel: { formatter: (v) => '$' + (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v) }
      },
      yAxis: { type: 'category', data: items.map((it) => it.name), axisLabel: { fontSize: 11 } },
      series: [
        {
          type: 'bar',
          data: items.map((it, idx) => ({
            value: Number(it.value.toFixed(2)),
            itemStyle: { color: colors[idx % colors.length] }
          })),
          barWidth: '60%',
          label: { show: true, position: 'right', formatter: (p) => '$' + p.value.toFixed(0), fontSize: 11 }
        }
      ]
    };
  }, [data, colors]);
  const reimbChart = useECharts(reimbOption, [reimbOption], { toolbar: false, autoScale: false });

  // ===== 库存明细（仅 inventory，取前 50 条） =====
  const detailList = useMemo(() => {
    const list = data || [];
    return list.filter((x) => x.reportType === 'inventory').slice(0, 50);
  }, [data]);

  // ===== 所有 hooks 已结束 =====
  if (!data) return <Spin tip="加载中..." style={{ marginTop: 80 }} />;
  if (data.length === 0) {
    return (
      <div>
        <Title level={4} style={{ marginTop: 0 }}>库存报告分析</Title>
        <Empty description="暂无数据，请先到「数据导入」上传对应报表" style={{ marginTop: 80 }} />
      </div>
    );
  }

  // KPI 卡片配置
  const kpiConfig = [
    { title: '可售库存', value: kpis.available, formatter: (v) => `${v} 件`, icon: <DatabaseOutlined />, color: '#3f8600' },
    { title: '预留', value: kpis.reserved, formatter: (v) => `${v} 件`, icon: <ClockCircleOutlined />, color: '#fa8c16' },
    { title: '在途', value: kpis.inbound, formatter: (v) => `${v} 件`, icon: <RocketOutlined />, color: '#722ed1' },
    { title: '滞留 SKU 数', value: kpis.strandedSkus, formatter: (v) => `${v} 个`, icon: <WarningOutlined />, color: kpis.strandedSkus > 0 ? '#cf1322' : '#1e3a5f' },
    { title: '赔偿总额', value: kpis.reimbursement, formatter: (v) => formatMoney(Number(v)), icon: <PayCircleOutlined />, color: '#1e3a5f' }
  ];

  // 滞留库存告警表列定义
  const strandedColumns = [
    { title: 'SKU', dataIndex: 'sku', width: 160, ellipsis: true },
    { title: '商品名称', dataIndex: 'productName', width: 200, ellipsis: true },
    {
      title: '滞留数量', dataIndex: 'strandedQty', width: 100, align: 'right',
      render: (v) => <Tag color="red">{v || 0} 件</Tag>
    },
    { title: '滞留原因', dataIndex: 'strandedReason', width: 200, ellipsis: true, render: (v) => v || '-' }
  ];

  // 库存明细表列定义
  const detailColumns = [
    { title: 'SKU', dataIndex: 'sku', width: 160, ellipsis: true },
    { title: 'FNSKU', dataIndex: 'fnsku', width: 140, ellipsis: true, render: (v) => v || '-' },
    { title: 'ASIN', dataIndex: 'asin', width: 130, ellipsis: true, render: (v) => v || '-' },
    { title: '可售', dataIndex: 'available', width: 90, align: 'right', render: (v) => v || 0 },
    { title: '预留', dataIndex: 'reserved', width: 90, align: 'right', render: (v) => v || 0 },
    { title: '在途', dataIndex: 'inbound', width: 90, align: 'right', render: (v) => v || 0 },
    { title: '总量', dataIndex: 'totalQty', width: 90, align: 'right', render: (v) => <strong>{v || 0}</strong> }
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>库存报告分析</Title>
      </div>

      {/* KPI 卡片 */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {kpiConfig.map((kpi, idx) => (
          <Col xs={12} sm={8} md={6} lg={4} key={idx}>
            <Card size="small">
              <Statistic
                title={
                  <span>
                    <span style={{ color: kpi.color, marginRight: 4 }}>{kpi.icon}</span>
                    {kpi.title}
                  </span>
                }
                value={kpi.value}
                formatter={kpi.formatter}
              />
            </Card>
          </Col>
        ))}
      </Row>

      {/* 图表区：库存分布 + 滞留库存告警 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="库存分布（Top 10）" size="small">
            {distOption ? (
              <div ref={distChart.ref} style={{ width: '100%', height: 320 }} />
            ) : (
              <Empty description="无数据" style={{ padding: 40 }} />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="滞留库存告警" size="small">
            {strandedList.length ? (
              <Table
                rowKey={(_, idx) => idx}
                size="small"
                columns={strandedColumns}
                dataSource={strandedList}
                pagination={false}
                scroll={{ x: 600, y: 320 }}
              />
            ) : (
              <Empty description="暂无滞留库存" style={{ padding: 40 }} />
            )}
          </Card>
        </Col>
      </Row>

      {/* 赔偿汇总 */}
      <Card title="赔偿汇总（Top 10）" size="small" style={{ marginBottom: 16 }}>
        {reimbOption ? (
          <div ref={reimbChart.ref} style={{ width: '100%', height: 320 }} />
        ) : (
          <Empty description="无数据" style={{ padding: 40 }} />
        )}
      </Card>

      {/* 库存明细表格 */}
      <Card title="库存明细" size="small">
        <Table
          rowKey={(_, idx) => idx}
          size="small"
          columns={detailColumns}
          dataSource={detailList}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          scroll={{ x: 800 }}
        />
      </Card>
    </div>
  );
}