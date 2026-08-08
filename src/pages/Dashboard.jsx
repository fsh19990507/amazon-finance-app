import React, { useState, useMemo, useEffect } from 'react';
import {
  Card, Row, Col, Statistic, Empty, Alert, Spin, Typography,
  Space, Tag, Select, DatePicker, Button, Tooltip, Badge, Modal, Segmented
} from 'antd';
import {
  DollarOutlined, RiseOutlined, FallOutlined, ShoppingOutlined,
  PercentageOutlined, ClockCircleOutlined, PayCircleOutlined,
  ExclamationCircleOutlined, FireOutlined, FullscreenOutlined,
  ArrowUpOutlined, ArrowDownOutlined, CalendarOutlined
} from '@ant-design/icons';
import { useLiveQuery } from '../hooks/useLiveQuery.js';
import db from '../db/database.js';
import { formatMoney, formatPercent } from '../utils/parsers.js';
import {
  getTransactionSummaryByMonth,
  buildExpenseBreakdown,
  computeTotalExpense,
  getProfitSeriesByDimension,
  computeMoM,
  getPreviousPeriod,
  detectAnomalies,
  buildDailyHeatmapData,
  buildWaterfallItems,
  getAllTransactions,
  getAllProfitReports
} from '../utils/dataAggregator.js';
import { useECharts, buildWaterfallOption, buildCalendarHeatmapOption, chartColorsFor } from '../utils/useECharts.js';
import { useStore } from '../context/StoreContext.jsx';
import { useRate } from '../context/RateContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

export default function Dashboard() {
  const { currentStoreId, compareMode, compareStoreIds } = useStore();
  const { formatDual } = useRate();
  const { can } = useAuth();
  // 主题图表配色：随主题联动（热力图配色独立，不受影响）
  const { themeId } = useTheme();
  const colors = chartColorsFor(themeId);

  const [dimension, setDimension] = useState('month');
  const [customRange, setCustomRange] = useState(['2026-01', '2026-12']);
  const [activeMonth, setActiveMonth] = useState(null);
  const [series, setSeries] = useState([]);
  const [allTxs, setAllTxs] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [showAnomalyModal, setShowAnomalyModal] = useState(false);

  const profitReports = useLiveQuery(() => db.profitReports.toArray(), [], []);
  const txSummary = useLiveQuery(
    () => getTransactionSummaryByMonth(activeMonth),
    [activeMonth],
    null
  );

  // 过滤当前店铺的利润报表
  const storeReports = useMemo(() => {
    if (!profitReports) return [];
    if (currentStoreId === 'all' || !currentStoreId) return profitReports;
    return profitReports.filter((r) => r.storeId === currentStoreId);
  }, [profitReports, currentStoreId]);

  const sortedReports = useMemo(() => {
    return [...storeReports].sort((a, b) => String(a.month).localeCompare(String(b.month)));
  }, [storeReports]);

  // 加载所有交易明细（用于异常检测和热力图）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const txs = await getAllTransactions(
        compareMode && compareStoreIds.length ? undefined : currentStoreId
      );
      if (!cancelled) {
        setAllTxs(txs);
        setAnomalies(detectAnomalies(txs.filter((t) => t.month === activeMonth)));
      }
    })();
    return () => { cancelled = true; };
  }, [currentStoreId, activeMonth, compareMode, compareStoreIds, profitReports]);

  // 维度切换 → 真正拉数据
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await getProfitSeriesByDimension(
        dimension === 'custom' ? 'custom' : dimension,
        dimension === 'custom' ? customRange : undefined,
        currentStoreId
      );
      // 按店铺过滤
      let filtered = s;
      if (currentStoreId !== 'all' && currentStoreId && sortedReports.length) {
        filtered = s.filter((item) => {
          const r = storeReports.find((r) => r.month === item.key);
          return !!r;
        });
      }
      if (!cancelled) setSeries(filtered);
    })();
    return () => { cancelled = true; };
  }, [dimension, customRange, storeReports, currentStoreId]);

  // 默认选最新月份
  useEffect(() => {
    if (!activeMonth && sortedReports.length) {
      setActiveMonth(sortedReports[sortedReports.length - 1].month);
    }
  }, [sortedReports, activeMonth]);

  const currentProfit = useMemo(
    () => sortedReports.find((r) => r.month === activeMonth) || null,
    [sortedReports, activeMonth]
  );

  // 上一期数据（用于环比）
  const prevPeriod = useMemo(
    () => getPreviousPeriod(series, activeMonth),
    [series, activeMonth]
  );

  const expenseTotal = currentProfit ? computeTotalExpense(currentProfit) : 0;
  const salesTotal = currentProfit
    ? (currentProfit.fbaSalesAmount || 0) + (currentProfit.fbmSalesAmount || 0)
    : 0;
  const refundTotal = currentProfit
    ? (currentProfit.fbaSalesRefund || 0) + (currentProfit.fbmSalesRefund || 0)
      + (currentProfit.commissionRefund || 0) + (currentProfit.fbaFeeRefund || 0)
    : 0;
  const orderCount = currentProfit
    ? (currentProfit.fbaSalesCount || 0) + (currentProfit.fbmSalesCount || 0)
    : 0;

  // 趋势图
  const trendOption = useMemo(() => {
    if (!series.length) return null;
    const labels = series.map((s) => s.label);
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        formatter: (params) => {
          let html = `${params[0].axisValue}<br/>`;
          params.forEach((p) => {
            html += `${p.marker}${p.seriesName}: $${Number(p.value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<br/>`;
          });
          return html;
        }
      },
      legend: { data: ['销售额', '总支出', '毛利润'], top: 0 },
      grid: { left: 60, right: 30, top: 40, bottom: 40 },
      xAxis: {
        type: 'category',
        data: labels,
        boundaryGap: false,
        axisLabel: { rotate: labels.length > 6 ? 30 : 0 }
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
          name: '销售额', type: 'line',
          data: series.map((s) => Number(s.sales.toFixed(2))),
          smooth: true,
          itemStyle: { color: colors[1] },
          areaStyle: { opacity: 0.1, color: colors[1] },
          markLine: { data: [], silent: true },
          markPoint: {
            data: series.length > 1 ? [{ type: 'max', name: '最高' }, { type: 'min', name: '最低' }] : []
          }
        },
        {
          name: '总支出', type: 'line',
          data: series.map((s) => Number(s.expense.toFixed(2))),
          smooth: true,
          itemStyle: { color: colors[2] },
          areaStyle: { opacity: 0.1, color: colors[2] },
          markLine: { data: [], silent: true }
        },
        {
          name: '毛利润', type: 'line',
          data: series.map((s) => Number(s.grossProfit.toFixed(2))),
          smooth: true,
          itemStyle: { color: colors[0] },
          lineStyle: { width: 3 },
          markLine: { data: [], silent: true },
          markPoint: {
            data: [{ type: 'max', name: '最高' }, { type: 'min', name: '最低' }]
          }
        }
      ]
    };
  }, [series, colors]);
  const trendChart = useECharts(trendOption, [trendOption], { toolbar: true, autoScale: true });

  // 费用饼图
  const expenseOption = useMemo(() => {
    if (!currentProfit) return null;
    const items = buildExpenseBreakdown(currentProfit).slice(0, 12);
    if (!items.length) return null;
    return {
      tooltip: {
        trigger: 'item',
        formatter: (p) => `${p.name}: $${Math.abs(p.value).toFixed(2)} (${p.percent}%)`
      },
      legend: { type: 'scroll', orient: 'vertical', right: 10, top: 20, bottom: 20 },
      series: [
        {
          name: '费用结构',
          type: 'pie',
          radius: ['50%', '75%'],
          center: ['40%', '50%'],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
          label: {
            show: true,
            position: 'outside',
            formatter: '{b}\n{d}%',
            fontSize: 11
          },
          emphasis: {
            label: { show: true, fontSize: 16, fontWeight: 'bold' },
            itemStyle: { shadowBlur: 20, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.4)' },
            scaleSize: 10
          },
          data: items.map((it, idx) => ({
            name: it.name,
            value: Math.abs(it.value),
            itemStyle: { color: colors[idx % colors.length] }
          }))
        }
      ]
    };
  }, [currentProfit, colors]);
  const expenseChart = useECharts(expenseOption, [expenseOption], { toolbar: false, autoScale: false });

  // 瀑布图
  const waterfallOption = useMemo(() => {
    if (!currentProfit) return null;
    const items = buildWaterfallItems(currentProfit, 6);
    return buildWaterfallOption(items, { title: '利润瀑布图', unit: '$' });
  }, [currentProfit]);
  const waterfallChart = useECharts(waterfallOption, [waterfallOption], { toolbar: false, autoScale: true });

  // 日历热力图
  const heatmapOption = useMemo(() => {
    if (!allTxs.length) return null;
    const data = buildDailyHeatmapData(allTxs.filter((t) => t.month === activeMonth));
    return buildCalendarHeatmapOption(data, { title: '每日销售热力图', unit: '$' });
  }, [allTxs, activeMonth]);
  const heatmapChart = useECharts(heatmapOption, [heatmapOption], { toolbar: false, autoScale: false });

  // KPI 卡片（含环比）
  const kpiCards = useMemo(() => {
    const buildCard = (title, value, formatter, icon, color, prevValue) => {
      const mom = prevValue !== undefined && prevValue !== null ? computeMoM(value, prevValue) : null;
      return {
        title, value, formatter, icon, color,
        mom,
        prevValue
      };
    };

    const prev = prevPeriod;
    return [
      buildCard('亚马逊回款', currentProfit?.disbursement || 0, (v) => formatDual(v, { color: true }), <DollarOutlined />, '#1e3a5f', prev?.disbursement),
      buildCard('销售额', salesTotal, (v) => formatDual(v, { color: true }), <RiseOutlined />, '#3f8600', prev?.sales),
      buildCard('退款', refundTotal, (v) => formatDual(v, { color: true }), <FallOutlined />, '#cf1322', undefined),
      buildCard('总支出', expenseTotal, (v) => formatDual(v, { color: true }), <FallOutlined />, '#fa541c', prev?.expense),
      buildCard('毛利润', currentProfit?.grossProfit || 0, (v) => formatDual(v, { color: true }), <DollarOutlined />, (currentProfit?.grossProfit || 0) < 0 ? '#cf1322' : '#3f8600', prev?.grossProfit),
      buildCard('毛利率', currentProfit?.profitMargin || 0, (v) => formatPercent(v), <PercentageOutlined />, (currentProfit?.profitMargin || 0) < 0 ? '#cf1322' : '#3f8600', undefined),
      buildCard('ROI', currentProfit?.roi || 0, (v) => formatPercent(v), <PercentageOutlined />, (currentProfit?.roi || 0) < 0 ? '#cf1322' : '#3f8600', undefined),
      buildCard('订单量', orderCount, (v) => `${v} 单`, <ShoppingOutlined />, '#1e3a5f', undefined),
      buildCard('退款率', currentProfit?.refundRate || 0, (v) => formatPercent(v), <PercentageOutlined />, '#fa8c16', undefined),
      buildCard('已发放资金', txSummary?.disbursedAmount || 0, (v) => formatDual(v, { color: true }), <PayCircleOutlined />, '#3f8600', undefined),
      buildCard('已推迟资金', txSummary?.postponedAmount || 0, (v) => formatDual(v, { color: true }), <ClockCircleOutlined />, '#fa8c16', undefined)
    ];
  }, [currentProfit, txSummary, salesTotal, refundTotal, expenseTotal, orderCount, prevPeriod, formatDual]);

  // ===== 所有 hooks 已结束 =====
  if (!profitReports) return <Spin tip="加载中..." style={{ marginTop: 80 }} />;
  if (profitReports.length === 0) {
    return (
      <div>
        <Title level={4} style={{ marginTop: 0 }}>财务总览</Title>
        <Empty description="暂无数据，请先到「数据导入」上传利润报表和交易明细" style={{ marginTop: 80 }} />
      </div>
    );
  }

  const renderKpiCard = (kpi, idx) => (
    <Col xs={12} sm={8} md={6} lg={4} xl={4} key={idx}>
      <Card size="small" hoverable>
        <Statistic
          title={
            <Space size={4}>
              <span style={{ color: kpi.color }}>{kpi.icon}</span>
              <Text style={{ fontSize: 13 }}>{kpi.title}</Text>
            </Space>
          }
          value={kpi.value}
          formatter={(v) => kpi.formatter(v)}
        />
        {kpi.mom && kpi.mom.deltaPercent !== null && (
          <div style={{ marginTop: 4, fontSize: 12 }}>
            {kpi.mom.direction === 'up' ? (
              <Tag color="green"><ArrowUpOutlined /> {(kpi.mom.deltaPercent * 100).toFixed(1)}%</Tag>
            ) : kpi.mom.direction === 'down' ? (
              <Tag color="red"><ArrowDownOutlined /> {(Math.abs(kpi.mom.deltaPercent) * 100).toFixed(1)}%</Tag>
            ) : (
              <Tag>持平</Tag>
            )}
            <Text type="secondary" style={{ marginLeft: 4 }}>环比</Text>
          </div>
        )}
      </Card>
    </Col>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>财务总览</Title>
        {anomalies.length > 0 && (
          <Badge count={anomalies.length} offset={[-4, -2]}>
            <Button size="small" type="primary" danger icon={<ExclamationCircleOutlined />} onClick={() => setShowAnomalyModal(true)}>
              异常提醒
            </Button>
          </Badge>
        )}
      </div>

      {/* 异常提醒弹窗 */}
      <Modal
        title={<span><FireOutlined style={{ color: '#fa541c' }} /> 异常交易提醒</span>}
        open={showAnomalyModal}
        onCancel={() => setShowAnomalyModal(false)}
        footer={[
          <Button key="close" onClick={() => setShowAnomalyModal(false)}>关闭</Button>
        ]}
        width={700}
      >
        <Alert
          type="warning"
          showIcon
          message={`检测到 ${anomalies.length} 笔异常交易`}
          description="单笔金额绝对值大于月均值 3 倍"
          style={{ marginBottom: 12 }}
        />
        <div style={{ maxHeight: 400, overflow: 'auto' }}>
          {anomalies.map((a, i) => (
            <Card key={i} size="small" style={{ marginBottom: 8, borderLeft: '3px solid #fa541c' }}>
              <Row gutter={8}>
                <Col span={5}><Text type="secondary">日期：</Text>{a.date}</Col>
                <Col span={5}><Text type="secondary">类型：</Text>{a.type}</Col>
                <Col span={8}><Text type="secondary">订单：</Text>{a.orderId}</Col>
                <Col span={6} style={{ textAlign: 'right' }}>
                  <Text strong style={{ color: a.total < 0 ? '#cf1322' : '#3f8600' }}>
                    {formatMoney(a.total)}
                  </Text>
                </Col>
              </Row>
              <div style={{ marginTop: 4, fontSize: 12, color: '#fa8c16' }}>{a.anomalyReason}</div>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 2 }}>{a.productName || '-'}</div>
            </Card>
          ))}
        </div>
      </Modal>

      {/* 筛选区 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Text strong>选择月份：</Text>
          <Select
            value={activeMonth || undefined}
            onChange={setActiveMonth}
            style={{ width: 160 }}
            options={sortedReports.map((r) => ({ value: r.month, label: r.month }))}
          />
          <Text strong style={{ marginLeft: 24 }}>时间维度：</Text>
          <Segmented
            value={dimension}
            onChange={(v) => setDimension(v)}
            size="small"
            options={[
              { value: 'month', label: '月' },
              { value: 'quarter', label: '季' },
              { value: 'year', label: '年' },
              { value: 'custom', label: '自定义' }
            ]}
          />
          {dimension === 'custom' && (
            <RangePicker
              picker="month"
              onChange={(dates) => {
                if (dates && dates[0] && dates[1]) {
                  const s = dates[0].format('YYYY-MM');
                  const e = dates[1].format('YYYY-MM');
                  setCustomRange([s, e]);
                }
              }}
            />
          )}
          {dimension !== 'month' && sortedReports.length === 1 && (
            <Tag color="orange">单月数据，建议使用月维度</Tag>
          )}
        </Space>
      </Card>

      {/* KPI 卡片 */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {kpiCards.map((kpi, idx) => renderKpiCard(kpi, idx))}
      </Row>

      {/* 趋势图 */}
      <Card title="趋势图（销售额 / 总支出 / 毛利润）" size="small" style={{ marginBottom: 16 }}>
        {trendOption ? (
          <div ref={trendChart.ref} style={{ width: '100%', height: 340 }} />
        ) : (
          <Empty description="无数据" style={{ padding: 40 }} />
        )}
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {/* 费用结构 */}
        <Col xs={24} lg={12}>
          <Card title={`费用结构（${activeMonth || '无'}）`} size="small">
            {expenseOption ? (
              <div ref={expenseChart.ref} style={{ width: '100%', height: 320 }} />
            ) : (
              <Empty description="无数据" style={{ padding: 40 }} />
            )}
          </Card>
        </Col>
        {/* 瀑布图 */}
        <Col xs={24} lg={12}>
          <Card title="利润瀑布图" size="small">
            {waterfallOption ? (
              <div ref={waterfallChart.ref} style={{ width: '100%', height: 320 }} />
            ) : (
              <Empty description="无数据" style={{ padding: 40 }} />
            )}
          </Card>
        </Col>
      </Row>

      {/* 日历热力图 */}
      <Card title="每日销售热力图" size="small" style={{ marginBottom: 16 }}>
        {heatmapOption ? (
          <div ref={heatmapChart.ref} style={{ width: '100%', height: 180 }} />
        ) : (
          <Empty description="无数据" style={{ padding: 40 }} />
        )}
      </Card>

      <Alert
        type="info"
        showIcon
        style={{ marginTop: 16 }}
        message="数据来源"
        description={
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>利润报表（店铺级汇总）：亚马逊回款、销售额、退款、总支出、毛利润、毛利率、ROI、订单量、退款率</li>
            <li>交易明细（按月聚合）：已发放资金、已推迟资金、异常检测</li>
            <li>当前数据月份：{sortedReports.map((r) => r.month).join('、') || '无'}</li>
            <li>当前店铺：{currentStoreId === 'all' ? '全部店铺' : (storeReports[0]?.store || currentStoreId)}</li>
          </ul>
        }
      />
    </div>
  );
}
