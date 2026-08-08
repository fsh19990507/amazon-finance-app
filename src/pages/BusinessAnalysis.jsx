// 业务报告分析页面 —— 基于 db.businessReports 表（亚马逊业务报告）
// 核心功能：
//   1. KPI：销售额、订单量、平均转化率、访问量
//   2. 图表：流量趋势折线图（sessions/pageViews/unitsOrdered 三线）、
//      ASIN 订单量排行柱状图（Top10）、销售额与访问量对比柱线混合图
//   3. 表格：商品表现明细（日期/ASIN/SKU/标题/访问量/订单量/销售额/转化率）
// 依赖说明：antd（Card/Statistic/Table/Empty 等）、@ant-design/icons、
//           useLiveQuery（实时查询 db.businessReports 表）、
//           useECharts + chartColorsFor（ECharts 图表与主题配色）、
//           formatMoney / formatPercent（金额与百分比格式化）
import React, { useMemo } from 'react';
import {
  Card, Row, Col, Statistic, Empty, Spin, Typography, Table
} from 'antd';
import {
  DollarOutlined, ShoppingCartOutlined, PercentageOutlined, EyeOutlined
} from '@ant-design/icons';
import { useLiveQuery } from '../hooks/useLiveQuery.js';
import db from '../db/database.js';
import { useECharts, chartColorsFor } from '../utils/useECharts.js';
import { useTheme } from '../context/ThemeContext.jsx';
import { useStore } from '../context/StoreContext.jsx';
import { matchesStoreId } from '../utils/dataAggregator.js';
import { formatMoney, formatPercent } from '../utils/parsers.js';

const { Title } = Typography;

// 将百分比数值归一化为小数（兼容 0.35 与 35 两种存储形式）
function toRatio(v) {
  const n = Number(v || 0);
  return Math.abs(n) > 1 ? n / 100 : n;
}

export default function BusinessAnalysis() {
  const { themeId } = useTheme();
  const colors = chartColorsFor(themeId);
  const { currentStoreId } = useStore();

  // 加载业务报告数据（按当前选中店铺过滤；「全部店铺」时不限制）
  const data = useLiveQuery(
    () => db.businessReports.toArray().then((rows) =>
      !currentStoreId || currentStoreId === 'all' ? rows : rows.filter((r) => matchesStoreId(r, currentStoreId))
    ),
    [currentStoreId],
    []
  );

  // ===== KPI 计算 =====
  const kpis = useMemo(() => {
    const list = data || [];
    // 销售额：orderedProductSales 求和
    const sales = list.reduce((s, x) => s + (x.orderedProductSales || 0), 0);
    // 订单量：unitsOrdered 求和
    const orders = list.reduce((s, x) => s + (x.unitsOrdered || 0), 0);
    // 访问量：sessions 求和
    const sessions = list.reduce((s, x) => s + (x.sessions || 0), 0);
    // 平均转化率（防御：len 为 0 时取 0；兼容小数/百分数两种存储）
    const avgRate = list.length
      ? list.reduce((s, x) => s + (x.conversionRate || 0), 0) / list.length
      : 0;
    return { sales, orders, sessions, avgRate: toRatio(avgRate) };
  }, [data]);

  // ===== 图表1：流量趋势折线图（按 date 分组 sessions/pageViews/unitsOrdered） =====
  const flowOption = useMemo(() => {
    const list = data || [];
    const map = new Map();
    list.forEach((x) => {
      const key = x.date || '';
      if (!key) return;
      const cur = map.get(key) || { sessions: 0, pageViews: 0, unitsOrdered: 0 };
      cur.sessions += x.sessions || 0;
      cur.pageViews += x.pageViews || 0;
      cur.unitsOrdered += x.unitsOrdered || 0;
      map.set(key, cur);
    });
    const items = [...map.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    if (!items.length) return null;
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
      legend: { data: ['访问量', '页面浏览', '订单量'], top: 0 },
      grid: { left: 70, right: 30, top: 40, bottom: 45 },
      xAxis: {
        type: 'category',
        data: items.map((it) => it[0]),
        boundaryGap: false,
        axisLabel: { rotate: items.length > 6 ? 30 : 0 }
      },
      yAxis: { type: 'value', scale: true },
      dataZoom: [
        { type: 'inside', start: 0, end: 100 },
        { type: 'slider', start: 0, end: 100, height: 20, bottom: 5 }
      ],
      series: [
        {
          name: '访问量', type: 'line',
          data: items.map((it) => it[1].sessions),
          smooth: true,
          itemStyle: { color: colors[0] },
          areaStyle: { opacity: 0.08, color: colors[0] }
        },
        {
          name: '页面浏览', type: 'line',
          data: items.map((it) => it[1].pageViews),
          smooth: true,
          itemStyle: { color: colors[1] }
        },
        {
          name: '订单量', type: 'line',
          data: items.map((it) => it[1].unitsOrdered),
          smooth: true,
          itemStyle: { color: colors[2] }
        }
      ]
    };
  }, [data, colors]);
  const flowChart = useECharts(flowOption, [flowOption], { toolbar: false, autoScale: false });

  // ===== 图表2：ASIN 订单量排行柱状图（按 asin 分组求和 unitsOrdered，Top10） =====
  const asinOption = useMemo(() => {
    const list = data || [];
    const map = new Map();
    list.forEach((x) => {
      const key = x.asin || '未知ASIN';
      map.set(key, (map.get(key) || 0) + (x.unitsOrdered || 0));
    });
    // 订单量从大到小取 Top10，再反转让最大项显示在柱状图顶部
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
        formatter: (p) => `${p[0].name}<br/>订单量：${p[0].value}`
      },
      grid: { left: 120, right: 40, top: 20, bottom: 30 },
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
  const asinChart = useECharts(asinOption, [asinOption], { toolbar: false, autoScale: false });

  // ===== 图表3：销售额与访问量对比（柱线混合图，双 y 轴） =====
  const salesOption = useMemo(() => {
    const list = data || [];
    const map = new Map();
    list.forEach((x) => {
      const key = x.date || '';
      if (!key) return;
      const cur = map.get(key) || { sales: 0, sessions: 0 };
      cur.sales += x.orderedProductSales || 0;
      cur.sessions += x.sessions || 0;
      map.set(key, cur);
    });
    const items = [...map.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    if (!items.length) return null;
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
      legend: { data: ['销售额', '访问量'], top: 0 },
      grid: { left: 70, right: 70, top: 40, bottom: 45 },
      xAxis: {
        type: 'category',
        data: items.map((it) => it[0]),
        boundaryGap: true,
        axisLabel: { rotate: items.length > 6 ? 30 : 0 }
      },
      yAxis: [
        {
          type: 'value', name: '销售额', scale: true,
          axisLabel: { formatter: (v) => '$' + (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v) }
        },
        { type: 'value', name: '访问量', scale: true, splitLine: { show: false } }
      ],
      dataZoom: [
        { type: 'inside', start: 0, end: 100 },
        { type: 'slider', start: 0, end: 100, height: 20, bottom: 5 }
      ],
      series: [
        {
          name: '销售额', type: 'bar',
          data: items.map((it) => Number(it[1].sales.toFixed(2))),
          itemStyle: { color: colors[0] },
          barMaxWidth: 24
        },
        {
          name: '访问量', type: 'line', yAxisIndex: 1,
          data: items.map((it) => it[1].sessions),
          smooth: true,
          itemStyle: { color: colors[1] }
        }
      ]
    };
  }, [data, colors]);
  const salesChart = useECharts(salesOption, [salesOption], { toolbar: false, autoScale: false });

  // ===== 商品表现明细（按日期倒序取前 30 条） =====
  const productList = useMemo(() => {
    const list = data || [];
    return [...list]
      .filter((x) => x.date)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 30);
  }, [data]);

  // ===== 所有 hooks 已结束 =====
  if (!data) return <Spin tip="加载中..." style={{ marginTop: 80 }} />;
  if (data.length === 0) {
    return (
      <div>
        <Title level={4} style={{ marginTop: 0 }}>业务报告分析</Title>
        <Empty description="暂无数据，请先到「数据导入」上传对应报表" style={{ marginTop: 80 }} />
      </div>
    );
  }

  // KPI 卡片配置
  const kpiConfig = [
    { title: '销售额', value: kpis.sales, formatter: (v) => formatMoney(Number(v)), icon: <DollarOutlined />, color: '#3f8600' },
    { title: '订单量', value: kpis.orders, formatter: (v) => `${v} 单`, icon: <ShoppingCartOutlined />, color: '#1e3a5f' },
    { title: '平均转化率', value: kpis.avgRate, formatter: (v) => formatPercent(Number(v)), icon: <PercentageOutlined />, color: '#722ed1' },
    { title: '访问量', value: kpis.sessions, formatter: (v) => `${v} 次`, icon: <EyeOutlined />, color: '#fa8c16' }
  ];

  // 商品表现表列定义
  const columns = [
    { title: '日期', dataIndex: 'date', width: 110 },
    { title: 'ASIN', dataIndex: 'asin', width: 130, ellipsis: true },
    { title: 'SKU', dataIndex: 'sku', width: 140, ellipsis: true },
    { title: '标题', dataIndex: 'title', width: 220, ellipsis: true },
    { title: '访问量', dataIndex: 'sessions', width: 100, align: 'right', render: (v) => v || 0 },
    { title: '订单量', dataIndex: 'unitsOrdered', width: 100, align: 'right', render: (v) => v || 0 },
    {
      title: '销售额', dataIndex: 'orderedProductSales', width: 130, align: 'right',
      render: (v) => <strong style={{ color: (v || 0) < 0 ? '#cf1322' : '#3f8600' }}>{formatMoney(v || 0)}</strong>
    },
    {
      title: '转化率', dataIndex: 'conversionRate', width: 110, align: 'right',
      render: (v) => formatPercent(toRatio(v))
    }
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>业务报告分析</Title>
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

      {/* 流量趋势 */}
      <Card title="流量趋势（访问量 / 页面浏览 / 订单量）" size="small" style={{ marginBottom: 16 }}>
        {flowOption ? (
          <div ref={flowChart.ref} style={{ width: '100%', height: 320 }} />
        ) : (
          <Empty description="无数据" style={{ padding: 40 }} />
        )}
      </Card>

      {/* 图表区：ASIN 订单量排行 + 销售额与访问量对比 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="ASIN 订单量排行（Top 10）" size="small">
            {asinOption ? (
              <div ref={asinChart.ref} style={{ width: '100%', height: 320 }} />
            ) : (
              <Empty description="无数据" style={{ padding: 40 }} />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="销售额与访问量对比" size="small">
            {salesOption ? (
              <div ref={salesChart.ref} style={{ width: '100%', height: 320 }} />
            ) : (
              <Empty description="无数据" style={{ padding: 40 }} />
            )}
          </Card>
        </Col>
      </Row>

      {/* 商品表现明细表格 */}
      <Card title="商品表现明细" size="small">
        <Table
          rowKey={(_, idx) => idx}
          size="small"
          columns={columns}
          dataSource={productList}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          scroll={{ x: 800 }}
        />
      </Card>
    </div>
  );
}