// 广告报告分析页面 —— 基于 db.adReports 表（亚马逊广告报告 SP/SD/SB）
// 核心功能：
//   1. KPI：花费、广告销售额、ACOS、ROAS
//   2. 图表：花费与销售趋势折线图、Campaign 花费排行柱状图（Top10）、
//      ACOS 分布柱状图（按 Campaign 计算，Top10）
//   3. 表格：Campaign 表现明细（Campaign/报表类型/曝光/点击/CTR/花费/广告销售额/ACOS）
// 依赖说明：antd（Card/Statistic/Table/Empty 等）、@ant-design/icons、
//           useLiveQuery（实时查询 db.adReports 表）、
//           useECharts + chartColorsFor（ECharts 图表与主题配色）、
//           formatMoney / formatPercent（金额与百分比格式化）
import React, { useMemo } from 'react';
import {
  Card, Row, Col, Statistic, Empty, Spin, Typography, Table, Tag
} from 'antd';
import {
  DollarOutlined, RiseOutlined, PercentageOutlined, FundOutlined
} from '@ant-design/icons';
import { useLiveQuery } from '../hooks/useLiveQuery.js';
import db from '../db/database.js';
import { useECharts, chartColorsFor } from '../utils/useECharts.js';
import { useTheme } from '../context/ThemeContext.jsx';
import { formatMoney, formatPercent } from '../utils/parsers.js';

const { Title } = Typography;

// 将百分比数值归一化为小数（兼容 0.35 与 35 两种存储形式）
function toRatio(v) {
  const n = Number(v || 0);
  return Math.abs(n) > 1 ? n / 100 : n;
}

export default function AdvertisingAnalysis() {
  const { themeId } = useTheme();
  const colors = chartColorsFor(themeId);

  // 加载全部广告报告数据（空数组为加载中默认值）
  const data = useLiveQuery(() => db.adReports.toArray(), [], []);

  // ===== KPI 计算 =====
  const kpis = useMemo(() => {
    const list = data || [];
    // 花费：spend 求和
    const spend = list.reduce((s, x) => s + (x.spend || 0), 0);
    // 广告销售额：sevenDayTotalSales 求和
    const sales = list.reduce((s, x) => s + (x.sevenDayTotalSales || 0), 0);
    // ACOS = 花费 / 广告销售额（防御：销售额为 0 时取 0）
    const acos = sales > 0 ? spend / sales : 0;
    // ROAS = 广告销售额 / 花费（防御：花费为 0 时取 0）
    const roas = spend > 0 ? sales / spend : 0;
    return { spend, sales, acos, roas };
  }, [data]);

  // ===== 图表1：花费与销售趋势折线图（按 date 分组） =====
  const trendOption = useMemo(() => {
    const list = data || [];
    const map = new Map();
    list.forEach((x) => {
      const key = x.date || '';
      if (!key) return;
      const cur = map.get(key) || { spend: 0, sales: 0 };
      cur.spend += x.spend || 0;
      cur.sales += x.sevenDayTotalSales || 0;
      map.set(key, cur);
    });
    const items = [...map.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    if (!items.length) return null;
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
      legend: { data: ['花费', '广告销售额'], top: 0 },
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
          name: '花费', type: 'line',
          data: items.map((it) => Number(it[1].spend.toFixed(2))),
          smooth: true,
          itemStyle: { color: colors[0] },
          areaStyle: { opacity: 0.08, color: colors[0] }
        },
        {
          name: '广告销售额', type: 'line',
          data: items.map((it) => Number(it[1].sales.toFixed(2))),
          smooth: true,
          itemStyle: { color: colors[1] },
          areaStyle: { opacity: 0.08, color: colors[1] }
        }
      ]
    };
  }, [data, colors]);
  const trendChart = useECharts(trendOption, [trendOption], { toolbar: false, autoScale: false });

  // ===== 图表2：Campaign 花费排行柱状图（按 campaignName 分组求和 spend，Top10） =====
  const campaignOption = useMemo(() => {
    const list = data || [];
    const map = new Map();
    list.forEach((x) => {
      const key = x.campaignName || '未知Campaign';
      map.set(key, (map.get(key) || 0) + (x.spend || 0));
    });
    // 花费从大到小取 Top10，再反转让最大项显示在柱状图顶部
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
        formatter: (p) => `${p[0].name}<br/>花费：${formatMoney(p[0].value)}`
      },
      grid: { left: 140, right: 40, top: 20, bottom: 30 },
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
  const campaignChart = useECharts(campaignOption, [campaignOption], { toolbar: false, autoScale: false });

  // ===== 图表3：ACOS 分布柱状图（按 campaignName 分组计算 ACOS，Top10） =====
  const acosOption = useMemo(() => {
    const list = data || [];
    const map = new Map();
    list.forEach((x) => {
      const key = x.campaignName || '未知Campaign';
      const cur = map.get(key) || { spend: 0, sales: 0 };
      cur.spend += x.spend || 0;
      cur.sales += x.sevenDayTotalSales || 0;
      map.set(key, cur);
    });
    // 按 ACOS 从大到小取 Top10，再反转让最高 ACOS 显示在柱状图顶部
    const items = [...map.entries()]
      .map(([name, v]) => ({ name, acos: v.sales > 0 ? v.spend / v.sales : 0 }))
      .sort((a, b) => b.acos - a.acos)
      .slice(0, 10)
      .reverse();
    if (!items.length) return null;
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (p) => `${p[0].name}<br/>ACOS：${formatPercent(p[0].value)}`
      },
      grid: { left: 140, right: 40, top: 20, bottom: 30 },
      xAxis: { type: 'value', axisLabel: { formatter: (v) => (v * 100).toFixed(0) + '%' } },
      yAxis: { type: 'category', data: items.map((it) => it.name), axisLabel: { fontSize: 11 } },
      series: [
        {
          type: 'bar',
          data: items.map((it, idx) => ({
            value: Number(it.acos.toFixed(4)),
            // ACOS 超过 50% 视为高亏损广告，标红提示
            itemStyle: { color: it.acos > 0.5 ? '#cf1322' : colors[idx % colors.length] }
          })),
          barWidth: '60%',
          label: { show: true, position: 'right', formatter: (p) => formatPercent(p.value), fontSize: 11 }
        }
      ]
    };
  }, [data, colors]);
  const acosChart = useECharts(acosOption, [acosOption], { toolbar: false, autoScale: false });

  // ===== Campaign 表现明细（按花费降序取前 30 条） =====
  const campaignList = useMemo(() => {
    const list = data || [];
    return [...list]
      .filter((x) => x.campaignName)
      .sort((a, b) => (b.spend || 0) - (a.spend || 0))
      .slice(0, 30);
  }, [data]);

  // ===== 所有 hooks 已结束 =====
  if (!data) return <Spin tip="加载中..." style={{ marginTop: 80 }} />;
  if (data.length === 0) {
    return (
      <div>
        <Title level={4} style={{ marginTop: 0 }}>广告报告分析</Title>
        <Empty description="暂无数据，请先到「数据导入」上传对应报表" style={{ marginTop: 80 }} />
      </div>
    );
  }

  // KPI 卡片配置
  const kpiConfig = [
    { title: '花费', value: kpis.spend, formatter: (v) => formatMoney(Number(v)), icon: <DollarOutlined />, color: '#fa541c' },
    { title: '广告销售额', value: kpis.sales, formatter: (v) => formatMoney(Number(v)), icon: <RiseOutlined />, color: '#3f8600' },
    { title: 'ACOS', value: kpis.acos, formatter: (v) => formatPercent(Number(v)), icon: <PercentageOutlined />, color: kpis.acos > 0.5 ? '#cf1322' : '#722ed1' },
    { title: 'ROAS', value: kpis.roas, formatter: (v) => Number(v).toFixed(2), icon: <FundOutlined />, color: '#1e3a5f' }
  ];

  // Campaign 表现表列定义
  const columns = [
    { title: 'Campaign', dataIndex: 'campaignName', width: 200, ellipsis: true },
    { title: '报表类型', dataIndex: 'reportType', width: 100, render: (v) => <Tag color={v === 'SP' ? 'blue' : v === 'SD' ? 'purple' : 'orange'}>{v || '-'}</Tag> },
    { title: '曝光', dataIndex: 'impressions', width: 100, align: 'right', render: (v) => (v || 0).toLocaleString() },
    { title: '点击', dataIndex: 'clicks', width: 90, align: 'right', render: (v) => v || 0 },
    {
      title: 'CTR', width: 100, align: 'right',
      render: (_, r) => formatPercent(toRatio(r.ctr ?? (r.impressions ? (r.clicks || 0) / r.impressions : 0)))
    },
    {
      title: '花费', dataIndex: 'spend', width: 130, align: 'right',
      render: (v) => <strong style={{ color: '#fa541c' }}>{formatMoney(v || 0)}</strong>
    },
    {
      title: '广告销售额', dataIndex: 'sevenDayTotalSales', width: 140, align: 'right',
      render: (v) => <strong style={{ color: '#3f8600' }}>{formatMoney(v || 0)}</strong>
    },
    {
      title: 'ACOS', dataIndex: 'acos', width: 110, align: 'right',
      render: (v) => formatPercent(toRatio(v))
    }
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>广告报告分析</Title>
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

      {/* 花费与销售趋势 */}
      <Card title="花费与销售趋势" size="small" style={{ marginBottom: 16 }}>
        {trendOption ? (
          <div ref={trendChart.ref} style={{ width: '100%', height: 320 }} />
        ) : (
          <Empty description="无数据" style={{ padding: 40 }} />
        )}
      </Card>

      {/* 图表区：Campaign 花费排行 + ACOS 分布 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="Campaign 花费排行（Top 10）" size="small">
            {campaignOption ? (
              <div ref={campaignChart.ref} style={{ width: '100%', height: 320 }} />
            ) : (
              <Empty description="无数据" style={{ padding: 40 }} />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="ACOS 分布（Top 10）" size="small">
            {acosOption ? (
              <div ref={acosChart.ref} style={{ width: '100%', height: 320 }} />
            ) : (
              <Empty description="无数据" style={{ padding: 40 }} />
            )}
          </Card>
        </Col>
      </Row>

      {/* Campaign 表现明细表格 */}
      <Card title="Campaign 表现明细" size="small">
        <Table
          rowKey={(_, idx) => idx}
          size="small"
          columns={columns}
          dataSource={campaignList}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          scroll={{ x: 800 }}
        />
      </Card>
    </div>
  );
}