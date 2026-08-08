// 结算报表分析页面 —— 基于 db.settlements 表（亚马逊英文结算报表）
// 核心功能：
//   1. KPI：结算总额、费用总额、订单数、结算期间数
//   2. 图表：交易类型构成饼图（Top8+其他）、SKU 费用排行柱状图（Top10）、月度到账趋势折线图
//   3. 表格：最近结算明细（结算ID/日期/金额/币种/交易类型/订单号/SKU）
// 依赖说明：antd（Card/Statistic/Table/Empty 等）、@ant-design/icons、
//           useLiveQuery（实时查询 db.settlements 表）、
//           useECharts + chartColorsFor（ECharts 图表与主题配色）、
//           formatMoney（金额格式化）
import React, { useMemo } from 'react';
import {
  Card, Row, Col, Statistic, Empty, Spin, Typography, Table, Tag
} from 'antd';
import {
  DollarOutlined, AccountBookOutlined, ShoppingOutlined, CalendarOutlined
} from '@ant-design/icons';
import { useLiveQuery } from '../hooks/useLiveQuery.js';
import db from '../db/database.js';
import { useECharts, chartColorsFor } from '../utils/useECharts.js';
import { useTheme } from '../context/ThemeContext.jsx';
import { useStore } from '../context/StoreContext.jsx';
import { matchesStoreId } from '../utils/dataAggregator.js';
import { formatMoney } from '../utils/parsers.js';

const { Title } = Typography;

// 结算报表中的四类费用字段（计算费用总额 / SKU 费用排行时使用）
const FEE_FIELDS = ['itemFeeAmount', 'shipmentFeeAmount', 'orderFeeAmount', 'otherFeeAmount'];

export default function SettlementAnalysis() {
  const { themeId } = useTheme();
  const colors = chartColorsFor(themeId);
  const { currentStoreId } = useStore();

  // 加载结算报表数据（按当前选中店铺过滤；「全部店铺」时不限制）
  const data = useLiveQuery(
    () => db.settlements.toArray().then((rows) =>
      !currentStoreId || currentStoreId === 'all' ? rows : rows.filter((r) => matchesStoreId(r, currentStoreId))
    ),
    [currentStoreId],
    []
  );

  // ===== KPI 计算 =====
  const kpis = useMemo(() => {
    const list = data || [];
    // 结算总额：totalAmount 求和
    const totalAmount = list.reduce((sum, x) => sum + (x.totalAmount || 0), 0);
    // 费用总额：四类费用之和取绝对值
    const feeTotal = list.reduce((sum, x) => {
      const fee = FEE_FIELDS.reduce((s, f) => s + (x[f] || 0), 0);
      return sum + Math.abs(fee);
    }, 0);
    // 订单数：orderId 非空去重统计
    const orderCount = new Set(list.map((x) => x.orderId).filter(Boolean)).size;
    // 结算期间数：settlementId 去重统计
    const settlementCount = new Set(list.map((x) => x.settlementId).filter(Boolean)).size;
    return { totalAmount, feeTotal, orderCount, settlementCount };
  }, [data]);

  // ===== 图表1：交易类型构成饼图（按 totalAmount 分组求和，取 Top8 + 其他） =====
  const typeOption = useMemo(() => {
    const list = data || [];
    const map = new Map();
    list.forEach((x) => {
      const key = x.transactionType || '未知类型';
      map.set(key, (map.get(key) || 0) + (x.totalAmount || 0));
    });
    const items = [...map.entries()]
      .map(([name, value]) => ({ name, value: Math.abs(value) }))
      .sort((a, b) => b.value - a.value);
    if (!items.length) return null;
    // 取金额前 8 的类型，其余合并为「其他」
    const top8 = items.slice(0, 8);
    const rest = items.slice(8).reduce((s, x) => s + x.value, 0);
    if (rest > 0) top8.push({ name: '其他', value: rest });
    return {
      tooltip: {
        trigger: 'item',
        formatter: (p) => `${p.name}: ${formatMoney(p.value)}（${p.percent}%）`
      },
      legend: { type: 'scroll', orient: 'vertical', right: 10, top: 20, bottom: 20 },
      series: [
        {
          name: '交易类型',
          type: 'pie',
          radius: ['45%', '70%'],
          center: ['38%', '50%'],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
          label: { show: true, position: 'outside', formatter: '{b}\n{d}%', fontSize: 11 },
          emphasis: {
            label: { show: true, fontSize: 16, fontWeight: 'bold' },
            itemStyle: { shadowBlur: 20, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.4)' },
            scaleSize: 10
          },
          data: top8.map((it, idx) => ({
            name: it.name,
            value: Number(it.value.toFixed(2)),
            itemStyle: { color: colors[idx % colors.length] }
          }))
        }
      ]
    };
  }, [data, colors]);
  const typeChart = useECharts(typeOption, [typeOption], { toolbar: false, autoScale: false });

  // ===== 图表2：SKU 费用排行柱状图（四类费用绝对值求和，Top10） =====
  const skuFeeOption = useMemo(() => {
    const list = data || [];
    const map = new Map();
    list.forEach((x) => {
      const key = x.sku || '未知SKU';
      const fee = FEE_FIELDS.reduce((s, f) => s + (x[f] || 0), 0);
      map.set(key, (map.get(key) || 0) + Math.abs(fee));
    });
    // 金额从大到小取 Top10，再反转让最大项显示在柱状图顶部
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
        formatter: (p) => `${p[0].name}<br/>费用：${formatMoney(p[0].value)}`
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
  const skuFeeChart = useECharts(skuFeeOption, [skuFeeOption], { toolbar: false, autoScale: false });

  // ===== 图表3：月度到账趋势折线图（按 month 分组求和 totalAmount） =====
  const monthOption = useMemo(() => {
    const list = data || [];
    const map = new Map();
    list.forEach((x) => {
      const key = x.month || '未知月份';
      map.set(key, (map.get(key) || 0) + (x.totalAmount || 0));
    });
    const items = [...map.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    if (!items.length) return null;
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        formatter: (p) => `${p[0].axisValue}<br/>结算总额：${formatMoney(p[0].value)}`
      },
      legend: { data: ['结算总额'], top: 0 },
      grid: { left: 70, right: 30, top: 40, bottom: 45 },
      xAxis: {
        type: 'category',
        data: items.map((it) => it[0]),
        boundaryGap: false,
        axisLabel: { rotate: items.length > 6 ? 30 : 0 }
      },
      yAxis: {
        type: 'value',
        scale: true,
        axisLabel: { formatter: (v) => '$' + (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v) }
      },
      dataZoom: [
        { type: 'inside', start: 0, end: 100 },
        { type: 'slider', start: 0, end: 100, height: 20, bottom: 5 }
      ],
      series: [
        {
          name: '结算总额',
          type: 'line',
          data: items.map((it) => Number(it[1].toFixed(2))),
          smooth: true,
          itemStyle: { color: colors[0] },
          areaStyle: { opacity: 0.1, color: colors[0] },
          markPoint: {
            data: items.length > 1 ? [{ type: 'max', name: '最高' }, { type: 'min', name: '最低' }] : []
          }
        }
      ]
    };
  }, [data, colors]);
  const monthChart = useECharts(monthOption, [monthOption], { toolbar: false, autoScale: false });

  // ===== 最近结算明细（按结算日期倒序取前 30 条） =====
  const recentList = useMemo(() => {
    const list = data || [];
    return [...list]
      .map((x) => ({ ...x, _date: x.postedDate || x.depositDate || x.startDate || '' }))
      .filter((x) => x._date)
      .sort((a, b) => String(b._date).localeCompare(String(a._date)))
      .slice(0, 30);
  }, [data]);

  // ===== 所有 hooks 已结束 =====
  if (!data) return <Spin tip="加载中..." style={{ marginTop: 80 }} />;
  if (data.length === 0) {
    return (
      <div>
        <Title level={4} style={{ marginTop: 0 }}>结算报表分析</Title>
        <Empty description="暂无数据，请先到「数据导入」上传对应报表" style={{ marginTop: 80 }} />
      </div>
    );
  }

  // KPI 卡片配置
  const kpiConfig = [
    { title: '结算总额', value: kpis.totalAmount, formatter: (v) => formatMoney(Number(v)), icon: <DollarOutlined />, color: '#3f8600' },
    { title: '费用总额', value: kpis.feeTotal, formatter: (v) => formatMoney(Number(v)), icon: <AccountBookOutlined />, color: '#fa541c' },
    { title: '订单数', value: kpis.orderCount, formatter: (v) => `${v} 单`, icon: <ShoppingOutlined />, color: '#1e3a5f' },
    { title: '结算期间数', value: kpis.settlementCount, formatter: (v) => `${v} 个`, icon: <CalendarOutlined />, color: '#722ed1' }
  ];

  // 最近结算明细表列定义
  const columns = [
    { title: '结算ID', dataIndex: 'settlementId', width: 160, ellipsis: true },
    { title: '结算日期', dataIndex: '_date', width: 110 },
    {
      title: '金额', dataIndex: 'totalAmount', width: 120, align: 'right',
      render: (v) => (
        <strong style={{ color: (v || 0) < 0 ? '#cf1322' : '#3f8600' }}>
          {formatMoney(v || 0)}
        </strong>
      )
    },
    { title: '币种', dataIndex: 'currency', width: 70, render: (v) => <Tag>{v || '-'}</Tag> },
    { title: '交易类型', dataIndex: 'transactionType', width: 140, ellipsis: true },
    { title: '订单号', dataIndex: 'orderId', width: 160, ellipsis: true },
    { title: 'SKU', dataIndex: 'sku', width: 140, ellipsis: true }
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>结算报表分析</Title>
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

      {/* 图表区：交易类型饼图 + SKU 费用排行 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="交易类型构成（Top 8）" size="small">
            {typeOption ? (
              <div ref={typeChart.ref} style={{ width: '100%', height: 320 }} />
            ) : (
              <Empty description="无数据" style={{ padding: 40 }} />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="SKU 费用排行（Top 10）" size="small">
            {skuFeeOption ? (
              <div ref={skuFeeChart.ref} style={{ width: '100%', height: 320 }} />
            ) : (
              <Empty description="无数据" style={{ padding: 40 }} />
            )}
          </Card>
        </Col>
      </Row>

      {/* 月度到账趋势 */}
      <Card title="月度到账趋势" size="small" style={{ marginBottom: 16 }}>
        {monthOption ? (
          <div ref={monthChart.ref} style={{ width: '100%', height: 320 }} />
        ) : (
          <Empty description="无数据" style={{ padding: 40 }} />
        )}
      </Card>

      {/* 最近结算明细表格 */}
      <Card title="最近结算明细" size="small">
        <Table
          rowKey={(_, idx) => idx}
          size="small"
          columns={columns}
          dataSource={recentList}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          scroll={{ x: 800 }}
        />
      </Card>
    </div>
  );
}
