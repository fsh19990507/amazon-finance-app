import React, { useState, useMemo, useEffect } from 'react';
import {
  Card, Table, Typography, Empty, Spin, Button, Space, Input, Select,
  Statistic, Row, Col, message, Drawer, Form, Dropdown, Tooltip, Tag, Alert, DatePicker
} from 'antd';
import {
  DownloadOutlined, SearchOutlined, ReloadOutlined, FilterOutlined,
  SaveOutlined, StarOutlined, DownOutlined, DeleteOutlined,
  BarChartOutlined, PieChartOutlined, ExclamationCircleOutlined
} from '@ant-design/icons';
import { useLiveQuery } from '../hooks/useLiveQuery.js';
import * as XLSX from 'xlsx';
import dayjs from 'dayjs';
import db from '../db/database.js';
import { formatMoney } from '../utils/parsers.js';
import { aggregateByProduct } from '../utils/dataAggregator.js';
import { useECharts, chartColorsFor } from '../utils/useECharts.js';
import { useStore } from '../context/StoreContext.jsx';
import { useRate } from '../context/RateContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { PERM, permLevelName } from '../utils/permissions.js';
import { translateProductNames } from '../utils/translator.js';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const QUICK_DATE_OPTIONS = [
  { key: 'all', label: '全部' },
  { key: '7days', label: '近7天' },
  { key: '30days', label: '近30天' },
  { key: 'thisMonth', label: '本月' },
  { key: 'lastMonth', label: '上月' },
  { key: 'thisQuarter', label: '本季度' },
  { key: 'thisYear', label: '本年' },
  { key: 'custom', label: '自定义' }
];

function getDateRange(quickKey, customRange) {
  if (quickKey === 'all') return null;
  if (quickKey === 'custom' && customRange && customRange.length === 2) {
    return [customRange[0].format('YYYY-MM-DD'), customRange[1].format('YYYY-MM-DD')];
  }
  const now = dayjs();
  switch (quickKey) {
    case '7days':
      return [now.subtract(6, 'day').format('YYYY-MM-DD'), now.format('YYYY-MM-DD')];
    case '30days':
      return [now.subtract(29, 'day').format('YYYY-MM-DD'), now.format('YYYY-MM-DD')];
    case 'thisMonth':
      return [now.startOf('month').format('YYYY-MM-DD'), now.endOf('month').format('YYYY-MM-DD')];
    case 'lastMonth':
      return [now.subtract(1, 'month').startOf('month').format('YYYY-MM-DD'), now.subtract(1, 'month').endOf('month').format('YYYY-MM-DD')];
    case 'thisQuarter':
      return [now.startOf('quarter').format('YYYY-MM-DD'), now.endOf('quarter').format('YYYY-MM-DD')];
    case 'thisYear':
      return [now.startOf('year').format('YYYY-MM-DD'), now.endOf('year').format('YYYY-MM-DD')];
    default:
      return null;
  }
}

export default function ProductAnalysis() {
  const { currentStoreId } = useStore();
  const { formatDual, rate } = useRate();
  const { currentAccount, can } = useAuth();
  // 主题图表配色：随主题联动
  const { themeId } = useTheme();
  const colors = chartColorsFor(themeId);

  const [keyword, setKeyword] = useState('');
  const [filterMonth, setFilterMonth] = useState('all');
  const [quickDate, setQuickDate] = useState('all');
  const [customDateRange, setCustomDateRange] = useState(null);
  const [sortField, setSortField] = useState('salesAmount');
  const [sortOrder, setSortOrder] = useState('descend');
  const [selectedPieName, setSelectedPieName] = useState(null);

  const [showSaveViewDrawer, setShowSaveViewDrawer] = useState(false);
  const [viewName, setViewName] = useState('');
  const [savedViews, setSavedViews] = useState([]);
  const [showViewDropdown, setShowViewDropdown] = useState(false);

  const [translations, setTranslations] = useState(new Map());
  const [translating, setTranslating] = useState(false);

  const allTransactions = useLiveQuery(() => db.transactions.toArray(), [], []);

  const mySavedViews = useLiveQuery(
    () => db.savedViews
      .where('[page+accountId]')
      .equals(['product', currentAccount?.id || 0])
      .reverse()
      .sortBy('createdAt')
      .toArray(),
    [currentAccount?.id],
    []
  );

  useEffect(() => {
    if (Array.isArray(mySavedViews)) setSavedViews(mySavedViews);
  }, [mySavedViews]);

  const monthOptions = useMemo(() => {
    if (!allTransactions) return [];
    const set = new Set(allTransactions.map((t) => t.month).filter(Boolean));
    return Array.from(set).sort();
  }, [allTransactions]);

  const storeTransactions = useMemo(() => {
    if (!allTransactions) return [];
    if (currentStoreId === 'all' || !currentStoreId) return allTransactions;
    return allTransactions.filter((t) => t.storeId === currentStoreId);
  }, [allTransactions, currentStoreId]);

  const dateRange = useMemo(() => getDateRange(quickDate, customDateRange), [quickDate, customDateRange]);

  const filteredTx = useMemo(() => {
    if (!storeTransactions) return [];
    let result = storeTransactions;
    if (filterMonth !== 'all') result = result.filter((t) => t.month === filterMonth);
    if (dateRange) {
      const [start, end] = dateRange;
      result = result.filter((t) => t.date >= start && t.date <= end);
    }
    if (keyword.trim()) {
      const k = keyword.trim().toLowerCase();
      result = result.filter((t) => (t.productName || '').toLowerCase().includes(k));
    }
    return result;
  }, [storeTransactions, filterMonth, keyword, dateRange]);

  const productRows = useMemo(() => {
    const rows = aggregateByProduct(filteredTx).map((r, idx) => ({
      ...r,
      id: `${idx}-${String(r.productName).replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '').slice(0, 40)}`
    }));
    const dir = sortOrder === 'ascend' ? 1 : -1;
    return rows.sort((a, b) => {
      const av = a[sortField] || 0;
      const bv = b[sortField] || 0;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [filteredTx, sortField, sortOrder]);

  // 自动翻译英文商品名（联网 + 缓存）
  useEffect(() => {
    if (!productRows.length) {
      setTranslations(new Map());
      return;
    }
    const names = productRows.map((r) => r.productName).filter(Boolean);
    let cancelled = false;
    (async () => {
      setTranslating(true);
      try {
        const map = await translateProductNames(names);
        if (!cancelled) setTranslations(map);
      } catch (e) {
        console.error('商品翻译失败:', e);
      } finally {
        if (!cancelled) setTranslating(false);
      }
    })();
    return () => { cancelled = true; };
  }, [productRows]);

  const totals = useMemo(() => {
    return productRows.reduce(
      (acc, r) => {
        acc.salesAmount += r.salesAmount;
        acc.orderCount += r.orderCount;
        acc.amazonFee += r.amazonFee;
        acc.netAmount += r.netAmount;
        return acc;
      },
      { salesAmount: 0, orderCount: 0, amazonFee: 0, netAmount: 0 }
    );
  }, [productRows]);

  const topProduct = useMemo(() => {
    if (!productRows.length) return null;
    return productRows.reduce((max, p) => (p.salesAmount || 0) > (max.salesAmount || 0) ? p : max, productRows[0]);
  }, [productRows]);

  const lossProducts = useMemo(() => {
    return productRows.filter((p) => (p.netAmount || 0) < -0.01);
  }, [productRows]);

  // 按销售额降序排列，用于图表展示（不受表格排序影响）
  const chartData = useMemo(() => {
    return [...productRows].sort((a, b) => (b.salesAmount || 0) - (a.salesAmount || 0));
  }, [productRows]);

  const barOption = useMemo(() => {
    if (!chartData.length) return null;
    const top10 = chartData.slice(0, 10).reverse();
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (p) => {
          const item = top10[p[0].dataIndex];
          const cny = item.salesAmount * (rate || 7.2);
          return `${item.productName}<br/>销售额：${formatMoney(item.salesAmount)}<br/>≈ ¥${cny.toFixed(2)}<br/>订单数：${item.orderCount} 单`;
        }
      },
      grid: { left: 140, right: 30, top: 20, bottom: 30 },
      xAxis: {
        type: 'value',
        scale: true,
        axisLabel: { formatter: (v) => '$' + (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v) }
      },
      yAxis: {
        type: 'category',
        data: top10.map((it) => it.productName.length > 20 ? it.productName.slice(0, 20) + '...' : it.productName),
        axisLabel: { fontSize: 11 }
      },
      series: [
        {
          type: 'bar',
          data: top10.map((it, idx) => ({
            value: it.salesAmount,
            itemStyle: {
              color: idx === 0 ? '#faad14' : idx === 1 ? '#bfbfbf' : idx === 2 ? '#d46b08' : '#1890ff'
            }
          })),
          barWidth: '60%',
          label: {
            show: true,
            position: 'right',
            formatter: (p) => '$' + p.value.toFixed(0),
            fontSize: 11
          }
        }
      ]
    };
  }, [chartData, rate]);
  const barChart = useECharts(barOption, [barOption], { toolbar: true, autoScale: true });

  const pieOption = useMemo(() => {
    if (!chartData.length) return null;
    const top8 = chartData.slice(0, 8);
    const otherSales = chartData.slice(8).reduce((s, p) => s + (p.salesAmount || 0), 0);
    const data = top8.map((p, idx) => ({
      name: p.productName.length > 15 ? p.productName.slice(0, 15) + '...' : p.productName,
      fullName: p.productName,
      value: p.salesAmount,
      itemStyle: { color: colors[idx % colors.length] }
    }));
    if (otherSales > 0) {
      data.push({
        name: '其他',
        fullName: '其他',
        value: otherSales,
        itemStyle: { color: '#D9D9D9' }
      });
    }

    return {
      tooltip: {
        trigger: 'item',
        formatter: (p) => {
          const cny = p.value * (rate || 7.2);
          return `${p.name}<br/>销售额：$${p.value.toFixed(2)}<br/>≈ ¥${cny.toFixed(2)}<br/>占比：${p.percent}%`;
        }
      },
      legend: { type: 'scroll', orient: 'vertical', right: 10, top: 20, bottom: 20 },
      series: [
        {
          name: '销售额占比',
          type: 'pie',
          radius: ['50%', '75%'],
          center: ['40%', '50%'],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
          label: {
            show: true,
            position: 'outside',
            formatter: '{b}\n{d}%',
            fontSize: 11
          },
          emphasis: {
            label: { show: true, fontSize: 16, fontWeight: 'bold' },
            itemStyle: { shadowBlur: 20, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.5)' },
            scaleSize: 10
          },
          selectedMode: 'single',
          selectedOffset: 10,
          data
        }
      ]
    };
  }, [chartData, rate, colors]);
  const pieChart = useECharts(pieOption, [pieOption], { toolbar: false, autoScale: true });

  // 饼图点击事件：高亮对应表格行
  useEffect(() => {
    const chart = pieChart.chart;
    if (!chart) return;
    const handler = (params) => {
      if (params.name) {
        setSelectedPieName(params.data?.fullName || params.name);
      }
    };
    chart.on('click', handler);
    return () => { chart.off('click', handler); };
  }, [pieChart.chart, pieOption]);

  const handleExport = () => {
    if (!productRows.length) {
      message.warning('无数据可导出');
      return;
    }
    const exportData = productRows.map((r, idx) => ({
      '排名': idx + 1,
      '商品详情': r.productName,
      '销售额(USD)': Number(r.salesAmount.toFixed(2)),
      '销售额(CNY)': Number((r.salesAmount * (rate || 7.2)).toFixed(2)),
      '订单数': r.orderCount,
      '促销返点(USD)': Number(r.promoAmount.toFixed(2)),
      '亚马逊费用(USD)': Number(r.amazonFee.toFixed(2)),
      '其他(USD)': Number(r.other.toFixed(2)),
      '退款金额(USD)': Number(r.refundAmount.toFixed(2)),
      '净额合计(USD)': Number(r.netAmount.toFixed(2)),
      '净额合计(CNY)': Number((r.netAmount * (rate || 7.2)).toFixed(2)),
      '交易笔数': r.txCount
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '商品分析');
    const fileName = `商品分析_${filterMonth === 'all' ? '全部' : filterMonth}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
    message.success(`已导出 ${exportData.length} 条商品数据`);
  };

  const handleReset = () => {
    setKeyword('');
    setFilterMonth('all');
    setQuickDate('all');
    setCustomDateRange(null);
    setSortField('salesAmount');
    setSortOrder('descend');
  };

  const handleSaveView = async () => {
    if (!viewName.trim()) {
      message.warning('请输入视图名称');
      return;
    }
    if (!can(PERM.SAVE_VIEW)) {
      message.error(`需要 ${permLevelName(PERM.SAVE_VIEW)} 及以上权限才能保存视图`);
      return;
    }
    try {
      await db.savedViews.add({
        page: 'product',
        name: viewName.trim(),
        accountId: currentAccount?.id,
        config: {
          filterMonth, keyword, quickDate, sortField, sortOrder,
          customDateRange: customDateRange ? customDateRange.map((d) => d.format('YYYY-MM-DD')) : null
        },
        createdAt: Date.now()
      });
      message.success('视图已保存');
      setShowSaveViewDrawer(false);
      setViewName('');
    } catch (e) {
      message.error('保存失败: ' + e.message);
    }
  };

  const applyView = (view) => {
    const cfg = view.config || {};
    if (cfg.filterMonth !== undefined) setFilterMonth(cfg.filterMonth);
    if (cfg.keyword !== undefined) setKeyword(cfg.keyword);
    if (cfg.quickDate !== undefined) setQuickDate(cfg.quickDate);
    if (cfg.sortField !== undefined) setSortField(cfg.sortField);
    if (cfg.sortOrder !== undefined) setSortOrder(cfg.sortOrder);
    if (cfg.customDateRange && cfg.customDateRange.length === 2) {
      setCustomDateRange([dayjs(cfg.customDateRange[0]), dayjs(cfg.customDateRange[1])]);
    } else {
      setCustomDateRange(null);
    }
    setShowViewDropdown(false);
    message.info(`已应用视图: ${view.name}`);
  };

  const deleteView = async (viewId) => {
    try {
      await db.savedViews.delete(viewId);
      message.success('视图已删除');
    } catch (e) {
      message.error('删除失败: ' + e.message);
    }
  };

  const viewMenuItems = useMemo(() => {
    const items = [];
    if (!Array.isArray(savedViews) || savedViews.length === 0) {
      items.push({ key: 'empty', label: <Text type="secondary">暂无保存的视图</Text>, disabled: true });
    } else {
      savedViews.forEach((v) => {
        items.push({
          key: String(v.id),
          label: (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span onClick={(e) => { e.stopPropagation(); applyView(v); }} style={{ cursor: 'pointer', flex: 1 }}>
                {v.name}
              </span>
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={(e) => { e.stopPropagation(); deleteView(v.id); }}
              />
            </div>
          )
        });
      });
    }
    return items;
  }, [savedViews]);

  const columns = useMemo(() => [
    { title: '排名', width: 60, align: 'center',
      render: (_, __, idx) => (
        <Text strong style={{ color: idx === 0 ? '#faad14' : idx === 1 ? '#bfbfbf' : idx === 2 ? '#d46b08' : 'inherit' }}>
          {idx + 1}
        </Text>
      ) },
    { title: '商品详情', dataIndex: 'productName', ellipsis: true,
      sorter: (a, b) => String(a.productName || '').localeCompare(String(b.productName || '')),
      sortOrder: sortField === 'productName' ? sortOrder : null,
      render: (v, r) => {
        const translated = translations.get(v) || '';
        return (
          <Space direction="vertical" size={0} style={{ width: '100%' }}>
            <Text style={{ fontSize: 12 }}>{v || '(空)'}</Text>
            {translated && (
              <Text type="secondary" style={{ fontSize: 11 }}>({translated})</Text>
            )}
            <Space size={4}>
              {topProduct && topProduct.productName === v && (
                <Tag color="gold" style={{ margin: 0 }}>销冠</Tag>
              )}
              {(r.netAmount || 0) < -0.01 && (
                <Tag color="red" style={{ margin: 0 }}>亏损</Tag>
              )}
            </Space>
          </Space>
        );
      } },
    { title: '销售额', dataIndex: 'salesAmount', width: 140, align: 'right',
      sorter: (a, b) => (a.salesAmount || 0) - (b.salesAmount || 0), sortOrder: sortField === 'salesAmount' ? sortOrder : null,
      render: (v) => formatDual(v, { color: true }) },
    { title: '订单数', dataIndex: 'orderCount', width: 90, align: 'right',
      sorter: (a, b) => (a.orderCount || 0) - (b.orderCount || 0), sortOrder: sortField === 'orderCount' ? sortOrder : null,
      render: (v) => v },
    { title: '促销返点', dataIndex: 'promoAmount', width: 120, align: 'right',
      sorter: (a, b) => (a.promoAmount || 0) - (b.promoAmount || 0), sortOrder: sortField === 'promoAmount' ? sortOrder : null,
      render: (v) => formatDual(v, { color: true }) },
    { title: '亚马逊费用', dataIndex: 'amazonFee', width: 130, align: 'right',
      sorter: (a, b) => (a.amazonFee || 0) - (b.amazonFee || 0), sortOrder: sortField === 'amazonFee' ? sortOrder : null,
      render: (v) => formatDual(v, { color: true }) },
    { title: '退款金额', dataIndex: 'refundAmount', width: 120, align: 'right',
      sorter: (a, b) => (a.refundAmount || 0) - (b.refundAmount || 0), sortOrder: sortField === 'refundAmount' ? sortOrder : null,
      render: (v) => formatDual(v, { color: true }) },
    { title: '净额合计', dataIndex: 'netAmount', width: 140, align: 'right',
      sorter: (a, b) => (a.netAmount || 0) - (b.netAmount || 0), sortOrder: sortField === 'netAmount' ? sortOrder : null,
      render: (v) => formatDual(v, { color: true }) },
    { title: '交易笔数', dataIndex: 'txCount', width: 90, align: 'right',
      sorter: (a, b) => (a.txCount || 0) - (b.txCount || 0), sortOrder: sortField === 'txCount' ? sortOrder : null,
      render: (v) => v }
  ], [translations, sortField, sortOrder, topProduct]);

  const handleTableChange = (pagination, filters, sorter) => {
    if (sorter && sorter.field) {
      setSortField(sorter.field);
      setSortOrder(sorter.order || 'descend');
    }
  };

  if (!allTransactions) return <Spin tip="加载中..." style={{ marginTop: 80 }} />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>商品分析</Title>
        <Space>
          {lossProducts.length > 0 && (
            <Tooltip title={`${lossProducts.length} 个商品处于亏损状态`}>
              <Tag color="red" icon={<ExclamationCircleOutlined />}>
                {lossProducts.length} 个亏损
              </Tag>
            </Tooltip>
          )}
          <Dropdown
            menu={{ items: viewMenuItems }}
            trigger={['click']}
            open={showViewDropdown}
            onOpenChange={setShowViewDropdown}
            disabled={!can(PERM.SAVE_VIEW)}
          >
            <Button icon={<StarOutlined />} disabled={!can(PERM.SAVE_VIEW)}>
              我的视图 <DownOutlined />
            </Button>
          </Dropdown>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={() => setShowSaveViewDrawer(true)}
            disabled={!can(PERM.SAVE_VIEW)}
          >
            保存视图
          </Button>
          <Button icon={<DownloadOutlined />} onClick={handleExport}>
            导出 Excel
          </Button>
        </Space>
      </div>

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="商品数" value={productRows.length} suffix="个" />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="销售额合计"
              value={totals.salesAmount}
              formatter={() => formatDual(totals.salesAmount)}
              valueStyle={{ display: 'none' }}
            />
            <div style={{ color: '#3f8600', fontSize: 20, fontWeight: 600, marginTop: -8 }}>
              {formatDual(totals.salesAmount)}
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="订单数合计" value={totals.orderCount} suffix="单" />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="净额合计"
              value={totals.netAmount}
              formatter={() => formatDual(totals.netAmount)}
              valueStyle={{ display: 'none' }}
            />
            <div style={{ color: totals.netAmount < 0 ? '#cf1322' : '#3f8600', fontSize: 20, fontWeight: 600, marginTop: -8 }}>
              {formatDual(totals.netAmount)}
            </div>
          </Card>
        </Col>
      </Row>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap direction="vertical" style={{ width: '100%' }} size={12}>
          <Space wrap>
            <FilterOutlined />
            <Text strong>快捷日期：</Text>
            <Select
              value={quickDate}
              onChange={(v) => { setQuickDate(v); if (v !== 'custom') setCustomDateRange(null); }}
              style={{ width: 140 }}
              options={QUICK_DATE_OPTIONS.map((o) => ({ value: o.key, label: o.label }))}
            />
            {quickDate === 'custom' && (
              <RangePicker
                value={customDateRange}
                onChange={setCustomDateRange}
              />
            )}
          </Space>
          <Space wrap>
            <Text strong>筛选：</Text>
            <Select
              value={filterMonth}
              onChange={setFilterMonth}
              style={{ width: 140 }}
              options={[{ value: 'all', label: '全部月份' }, ...monthOptions.map((m) => ({ value: m, label: m }))]}
            />
            <Input
              placeholder="搜索商品详情"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              style={{ width: 240 }}
              prefix={<SearchOutlined />}
              allowClear
            />
            <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
          </Space>
        </Space>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <Card title={<Space><BarChartOutlined /> 销售 TOP10 排行</Space>} size="small">
            {barOption ? (
              <div ref={barChart.ref} style={{ width: '100%', height: 340 }} />
            ) : (
              <Empty description="无数据" style={{ padding: 40 }} />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title={<Space><PieChartOutlined /> 销售额占比（TOP8）</Space>} size="small">
            {pieOption ? (
              <div ref={pieChart.ref} style={{ width: '100%', height: 340 }} />
            ) : (
              <Empty description="无数据" style={{ padding: 40 }} />
            )}
          </Card>
        </Col>
      </Row>

      {lossProducts.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message={`检测到 ${lossProducts.length} 个亏损商品`}
          description="净额合计为负数的商品，请关注其成本和定价策略"
          style={{ marginBottom: 16 }}
        />
      )}

      <Card size="small">
        <Table
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={productRows}
          onChange={handleTableChange}
          onRow={(record) => ({
            className: selectedPieName && record.productName === selectedPieName ? 'ant-table-row-selected' : ''
          })}
          scroll={{ x: 1300, y: 600 }}
          pagination={{
            pageSize: 50,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100', '200'],
            showTotal: (total, range) => `${range[0]}-${range[1]} / 共 ${total} 个商品`
          }}
        />
      </Card>

      <Card size="small" style={{ marginTop: 16 }}>
        <Text type="secondary">
          说明：商品分析数据来源于交易明细按「商品详情」字段分组聚合。因交易明细无 SKU、无采购成本，
          指标为销售额（商品价格总额合计）、订单数、退款金额、亚马逊费用合计、净额合计。
          点击列标题可排序，点击「导出 Excel」可下载当前视图。支持快捷日期筛选和保存常用视图。
        </Text>
      </Card>

      <Drawer
        title="保存当前视图"
        placement="right"
        onClose={() => setShowSaveViewDrawer(false)}
        open={showSaveViewDrawer}
        width={360}
      >
        <Form layout="vertical">
          <Form.Item label="视图名称" required>
            <Input
              placeholder="例如：热销商品TOP50"
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
              maxLength={30}
              showCount
            />
          </Form.Item>
          <Alert
            type="info"
            showIcon
            size="small"
            message="将保存以下设置"
            description={
              <ul style={{ margin: '8px 0 0 16px', padding: 0 }}>
                <li>日期范围：{QUICK_DATE_OPTIONS.find((o) => o.key === quickDate)?.label}</li>
                <li>月份：{filterMonth === 'all' ? '全部' : filterMonth}</li>
                <li>关键词：{keyword || '(无)'}</li>
                <li>排序字段：{sortField}</li>
                <li>排序方式：{sortOrder === 'descend' ? '降序' : '升序'}</li>
              </ul>
            }
            style={{ marginBottom: 16 }}
          />
          <Button type="primary" block icon={<SaveOutlined />} onClick={handleSaveView}>
            保存视图
          </Button>
        </Form>
      </Drawer>
    </div>
  );
}
