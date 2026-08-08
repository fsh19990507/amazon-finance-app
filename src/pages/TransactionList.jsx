import React, { useState, useMemo, useEffect } from 'react';
import {
  Table, Card, Select, Input, Space, Tag, Typography, Empty, Button, Row, Col, Statistic,
  DatePicker, Modal, message, Popconfirm, Tooltip, Dropdown, Badge, Drawer, Form, Alert
} from 'antd';
import {
  SearchOutlined, ReloadOutlined, FilterOutlined, DeleteOutlined, StarOutlined,
  StarFilled, ExclamationCircleOutlined, DownOutlined, SaveOutlined,
  CalendarOutlined, ExportOutlined
} from '@ant-design/icons';
import { useLiveQuery } from '../hooks/useLiveQuery.js';
import { useLocation, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import db from '../db/database.js';
import { formatMoney } from '../utils/parsers.js';
import { detectAnomalies } from '../utils/dataAggregator.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useStore } from '../context/StoreContext.jsx';
import { useRate } from '../context/RateContext.jsx';
import { PERM, permLevelName } from '../utils/permissions.js';
import { writeLog, LOG_ACTIONS } from '../utils/operationLog.js';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const STATUS_COLOR = { '已发放': 'green', '已推迟': 'orange' };
const TYPE_COLOR = { '订单付款': 'blue', '清算': 'purple', '服务费用': 'gold' };

const QUICK_DATE_OPTIONS = [
  { key: 'all', label: '全部' },
  { key: 'today', label: '今天' },
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
    case 'today':
      return [now.format('YYYY-MM-DD'), now.format('YYYY-MM-DD')];
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

export default function TransactionList() {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentAccount, can } = useAuth();
  const { currentStoreId } = useStore();
  const { formatDual } = useRate();

  const initialFilter = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return {
      type: params.get('type') || 'all',
      status: params.get('status') || 'all',
      month: params.get('month') || 'all',
      keyword: params.get('keyword') || ''
    };
  }, [location.search]);

  const [filterType, setFilterType] = useState(initialFilter.type);
  const [filterStatus, setFilterStatus] = useState(initialFilter.status);
  const [filterMonth, setFilterMonth] = useState(initialFilter.month);
  const [keyword, setKeyword] = useState(initialFilter.keyword);
  const [quickDate, setQuickDate] = useState('all');
  const [customDateRange, setCustomDateRange] = useState(null);

  const [showSaveViewDrawer, setShowSaveViewDrawer] = useState(false);
  const [viewName, setViewName] = useState('');
  const [savedViews, setSavedViews] = useState([]);
  const [showViewDropdown, setShowViewDropdown] = useState(false);

  const allTransactions = useLiveQuery(() => db.transactions.toArray(), [], []);

  const mySavedViews = useLiveQuery(
    () => db.savedViews
      .where('[page+accountId]')
      .equals(['transactions', currentAccount?.id || 0])
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

  const typeOptions = useMemo(() => {
    if (!allTransactions) return [];
    const set = new Set(allTransactions.map((t) => t.type).filter(Boolean));
    return Array.from(set);
  }, [allTransactions]);

  const storeTransactions = useMemo(() => {
    if (!allTransactions) return [];
    if (currentStoreId === 'all' || !currentStoreId) return allTransactions;
    return allTransactions.filter((t) => t.storeId === currentStoreId);
  }, [allTransactions, currentStoreId]);

  const dateRange = useMemo(() => getDateRange(quickDate, customDateRange), [quickDate, customDateRange]);

  const anomalies = useMemo(() => {
    if (!storeTransactions.length) return new Set();
    const list = detectAnomalies(storeTransactions, 3);
    return new Set(list.map((a) => a.id));
  }, [storeTransactions]);

  const filteredData = useMemo(() => {
    if (!storeTransactions) return [];
    let result = storeTransactions;
    if (filterType !== 'all') result = result.filter((t) => t.type === filterType);
    if (filterStatus !== 'all') result = result.filter((t) => t.status === filterStatus);
    if (filterMonth !== 'all') result = result.filter((t) => t.month === filterMonth);
    if (dateRange) {
      const [start, end] = dateRange;
      result = result.filter((t) => t.date >= start && t.date <= end);
    }
    if (keyword.trim()) {
      const k = keyword.trim().toLowerCase();
      result = result.filter(
        (t) =>
          (t.orderId || '').toLowerCase().includes(k) ||
          (t.productName || '').toLowerCase().includes(k)
      );
    }
    return result.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [storeTransactions, filterType, filterStatus, filterMonth, keyword, dateRange]);

  const summary = useMemo(() => {
    if (!filteredData.length) return { count: 0, total: 0, income: 0, expense: 0, anomalyCount: 0 };
    let total = 0, income = 0, expense = 0, anomalyCount = 0;
    for (const t of filteredData) {
      total += t.total || 0;
      if ((t.total || 0) > 0) income += t.total;
      else expense += t.total;
      if (anomalies.has(t.id)) anomalyCount++;
    }
    return { count: filteredData.length, total, income, expense, anomalyCount };
  }, [filteredData, anomalies]);

  const handleReset = () => {
    setFilterType('all');
    setFilterStatus('all');
    setFilterMonth('all');
    setKeyword('');
    setQuickDate('all');
    setCustomDateRange(null);
    navigate('/transactions', { replace: true });
  };

  const handleDeleteSingle = async (record) => {
    if (!can(PERM.DELETE_SINGLE_TX)) {
      message.error(`需要 ${permLevelName(PERM.DELETE_SINGLE_TX)} 及以上权限才能删除交易`);
      return;
    }
    try {
      await db.transactions.delete(record.id);
      await writeLog({
        accountId: currentAccount?.id,
        action: LOG_ACTIONS.DELETE_SINGLE_TX,
        targetType: 'transaction',
        targetId: String(record.id),
        amount: record.total || 0,
        detail: `订单: ${record.orderId || '-'}, 日期: ${record.date}`
      });
      message.success('删除成功');
    } catch (e) {
      message.error('删除失败: ' + e.message);
    }
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
        page: 'transactions',
        name: viewName.trim(),
        accountId: currentAccount?.id,
        config: {
          filterType, filterStatus, filterMonth, keyword, quickDate,
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
    if (cfg.filterType !== undefined) setFilterType(cfg.filterType);
    if (cfg.filterStatus !== undefined) setFilterStatus(cfg.filterStatus);
    if (cfg.filterMonth !== undefined) setFilterMonth(cfg.filterMonth);
    if (cfg.keyword !== undefined) setKeyword(cfg.keyword);
    if (cfg.quickDate !== undefined) setQuickDate(cfg.quickDate);
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

  const columns = [
    { title: '日期', dataIndex: 'date', width: 110, fixed: 'left',
      sorter: (a, b) => String(a.date).localeCompare(String(b.date)),
      defaultSortOrder: 'descend',
      render: (v, record) => (
        <Space size={4}>
          {anomalies.has(record.id) && (
            <Tooltip title="异常交易">
              <ExclamationCircleOutlined style={{ color: '#fa541c' }} />
            </Tooltip>
          )}
          <span>{v}</span>
        </Space>
      )
    },
    { title: '交易类型', dataIndex: 'type', width: 110,
      render: (v) => v ? <Tag color={TYPE_COLOR[v] || 'default'}>{v}</Tag> : '-' },
    { title: '交易状态', dataIndex: 'status', width: 90,
      render: (v) => v ? <Tag color={STATUS_COLOR[v] || 'default'}>{v}</Tag> : '-' },
    { title: '订单编号', dataIndex: 'orderId', width: 200, ellipsis: true,
      render: (v) => <Text copyable={{ text: v }} style={{ fontSize: 12 }}>{v || '-'}</Text> },
    { title: '商品详情', dataIndex: 'productName', ellipsis: true,
      render: (v) => <Text style={{ fontSize: 12 }}>{v || '-'}</Text> },
    { title: '商品价格', dataIndex: 'productAmount', width: 120, align: 'right',
      sorter: (a, b) => (a.productAmount || 0) - (b.productAmount || 0),
      render: (v) => formatDual(v) },
    { title: '促销返点', dataIndex: 'promoAmount', width: 120, align: 'right',
      render: (v) => formatDual(v) },
    { title: '亚马逊费用', dataIndex: 'amazonFee', width: 120, align: 'right',
      render: (v) => <span style={{ color: v < 0 ? '#cf1322' : '#3f8600' }}>{formatDual(v)}</span> },
    { title: '其他', dataIndex: 'other', width: 100, align: 'right',
      render: (v) => formatDual(v) },
    {
      title: '总计', dataIndex: 'total', width: 130, align: 'right', fixed: 'right',
      sorter: (a, b) => (a.total || 0) - (b.total || 0),
      render: (v, record) => (
        <strong style={{ color: v < 0 ? '#cf1322' : '#3f8600' }}>
          {formatDual(v)}
        </strong>
      )
    },
    {
      title: '操作', dataIndex: 'action', width: 80, fixed: 'right',
      render: (_, record) => (
        <Space size={4}>
          <Popconfirm
            title="确认删除这条交易？"
            description={`订单: ${record.orderId || '-'}`}
            onConfirm={() => handleDeleteSingle(record)}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            disabled={!can(PERM.DELETE_SINGLE_TX)}
          >
            <Tooltip title={can(PERM.DELETE_SINGLE_TX) ? '删除' : `需要${permLevelName(PERM.DELETE_SINGLE_TX)}权限`}>
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                disabled={!can(PERM.DELETE_SINGLE_TX)}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      )
    }
  ];

  const expandable = {
    expandedRowRender: (record) => (
      <Card size="small" style={{ background: '#fafafa' }}>
        <Row gutter={[16, 8]}>
          <Col span={6}><Text type="secondary">日期：</Text><Text strong>{record.date}</Text></Col>
          <Col span={6}><Text type="secondary">月份：</Text><Text strong>{record.month}</Text></Col>
          <Col span={6}><Text type="secondary">交易类型：</Text><Text strong>{record.type}</Text></Col>
          <Col span={6}><Text type="secondary">交易状态：</Text><Text strong>{record.status}</Text></Col>
          <Col span={12}><Text type="secondary">订单编号：</Text><Text strong copyable>{record.orderId}</Text></Col>
          <Col span={12}><Text type="secondary">商品详情：</Text><Text strong>{record.productName}</Text></Col>
          <Col span={6}><Text type="secondary">商品价格总额：</Text><Text strong>{formatMoney(record.productAmount)}</Text></Col>
          <Col span={6}><Text type="secondary">促销返点总额：</Text><Text strong>{formatMoney(record.promoAmount)}</Text></Col>
          <Col span={6}><Text type="secondary">亚马逊所收费用：</Text><Text strong>{formatMoney(record.amazonFee)}</Text></Col>
          <Col span={6}><Text type="secondary">其他：</Text><Text strong>{formatMoney(record.other)}</Text></Col>
          <Col span={6}><Text type="secondary">总计：</Text><Text strong style={{ color: record.total < 0 ? '#cf1322' : '#3f8600' }}>{formatMoney(record.total)}</Text></Col>
          <Col span={6}><Text type="secondary">店铺：</Text><Text strong>{record.storeId || '默认'}</Text></Col>
          <Col span={12}><Text type="secondary">去重键：</Text><Text code>{record.dedupKey}</Text></Col>
          {anomalies.has(record.id) && (
            <Col span={24}>
              <Alert
                type="warning"
                showIcon
                size="small"
                message="异常交易"
                description={record.anomalyReason || '金额明显偏离均值'}
              />
            </Col>
          )}
        </Row>
      </Card>
    ),
    rowExpandable: () => true
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

  if (!allTransactions) return <Card><Empty description="加载中..." /></Card>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>交易明细</Title>
        <Space>
          {summary.anomalyCount > 0 && (
            <Badge count={summary.anomalyCount} offset={[-4, -2]}>
              <Tag color="orange" icon={<ExclamationCircleOutlined />}>
                {summary.anomalyCount} 笔异常
              </Tag>
            </Badge>
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
        </Space>
      </div>

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="记录数" value={summary.count} suffix="条" />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="收入合计"
              value={summary.income}
              formatter={() => formatDual(summary.income)}
              valueStyle={{ display: 'none' }}
              prefix={<span style={{ color: '#3f8600', fontSize: 20, fontWeight: 600 }}></span>}
            />
            <div style={{ color: '#3f8600', fontSize: 20, fontWeight: 600, marginTop: -8 }}>
              {formatDual(summary.income)}
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="支出合计"
              value={summary.expense}
              formatter={() => formatDual(summary.expense)}
              valueStyle={{ display: 'none' }}
            />
            <div style={{ color: '#cf1322', fontSize: 20, fontWeight: 600, marginTop: -8 }}>
              {formatDual(summary.expense)}
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="净额合计"
              value={summary.total}
              formatter={() => formatDual(summary.total)}
              valueStyle={{ display: 'none' }}
            />
            <div style={{ color: summary.total < 0 ? '#cf1322' : '#3f8600', fontSize: 20, fontWeight: 600, marginTop: -8 }}>
              {formatDual(summary.total)}
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
              value={filterType}
              onChange={setFilterType}
              style={{ width: 140 }}
              options={[{ value: 'all', label: '全部类型' }, ...typeOptions.map((t) => ({ value: t, label: t }))]}
            />
            <Select
              value={filterStatus}
              onChange={setFilterStatus}
              style={{ width: 140 }}
              options={[
                { value: 'all', label: '全部状态' },
                { value: '已发放', label: '已发放' },
                { value: '已推迟', label: '已推迟' }
              ]}
            />
            <Select
              value={filterMonth}
              onChange={setFilterMonth}
              style={{ width: 140 }}
              options={[{ value: 'all', label: '全部月份' }, ...monthOptions.map((m) => ({ value: m, label: m }))]}
            />
            <Input
              placeholder="搜索订单号/商品详情"
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

      <Card size="small">
        <Table
          rowKey="id"
          columns={columns}
          dataSource={filteredData}
          size="small"
          scroll={{ x: 1400, y: 600 }}
          pagination={{
            pageSize: 50,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100', '200'],
            showTotal: (total, range) => `${range[0]}-${range[1]} / 共 ${total} 条`
          }}
          expandable={expandable}
          virtual={filteredData.length > 200}
          rowClassName={(record) => anomalies.has(record.id) ? 'row-anomaly' : ''}
        />
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
              placeholder="例如：本月已发放订单"
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
            message="将保存以下筛选条件"
            description={
              <ul style={{ margin: '8px 0 0 16px', padding: 0 }}>
                <li>日期范围：{QUICK_DATE_OPTIONS.find((o) => o.key === quickDate)?.label}</li>
                <li>交易类型：{filterType === 'all' ? '全部' : filterType}</li>
                <li>交易状态：{filterStatus === 'all' ? '全部' : filterStatus}</li>
                <li>月份：{filterMonth === 'all' ? '全部' : filterMonth}</li>
                <li>关键词：{keyword || '(无)'}</li>
              </ul>
            }
            style={{ marginBottom: 16 }}
          />
          <Button type="primary" block icon={<SaveOutlined />} onClick={handleSaveView}>
            保存视图
          </Button>
        </Form>
      </Drawer>

      <style>{`
        .row-anomaly > td {
          background-color: #fff7e6 !important;
        }
        .row-anomaly:hover > td {
          background-color: #ffe7ba !important;
        }
      `}</style>
    </div>
  );
}
