import React, { useState, useMemo, useEffect } from 'react';
import {
  Card, Row, Col, Empty, Spin, Typography, Space, Select, Table, Tag,
  Button, Statistic, Alert, Drawer, Form, Input, Dropdown, Badge, Tooltip, message
} from 'antd';
import {
  ArrowRightOutlined, BarChartOutlined, SaveOutlined, StarOutlined,
  DownOutlined, DeleteOutlined, DownloadOutlined, ExclamationCircleOutlined
} from '@ant-design/icons';
import { useLiveQuery } from '../hooks/useLiveQuery.js';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import db from '../db/database.js';
import { formatMoney } from '../utils/parsers.js';
import { buildExpenseBreakdown, EXPENSE_ITEMS, detectAnomalies, matchesStoreId } from '../utils/dataAggregator.js';
import { useECharts, chartColorsFor } from '../utils/useECharts.js';
import { useStore } from '../context/StoreContext.jsx';
import { useRate } from '../context/RateContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { PERM, permLevelName } from '../utils/permissions.js';

const { Title, Text } = Typography;

export default function ExpenseAnalysis() {
  const navigate = useNavigate();
  const { currentStoreId } = useStore();
  const { formatDual, rate } = useRate();
  const { currentAccount, can } = useAuth();
  // 主题图表配色：随主题联动
  const { themeId } = useTheme();
  const colors = chartColorsFor(themeId);

  const [activeMonth, setActiveMonth] = useState(null);
  const [selectedKey, setSelectedKey] = useState(null);

  const [showSaveViewDrawer, setShowSaveViewDrawer] = useState(false);
  const [viewName, setViewName] = useState('');
  const [savedViews, setSavedViews] = useState([]);
  const [showViewDropdown, setShowViewDropdown] = useState(false);

  const profitReports = useLiveQuery(() => db.profitReports.toArray(), [], []);

  const mySavedViews = useLiveQuery(
    () => db.savedViews
      .where('[page+accountId]')
      .equals(['expense', currentAccount?.id || 0])
      .reverse()
      .sortBy('createdAt')
      .toArray(),
    [currentAccount?.id],
    []
  );

  useEffect(() => {
    if (Array.isArray(mySavedViews)) setSavedViews(mySavedViews);
  }, [mySavedViews]);

  const storeReports = useMemo(() => {
    if (!profitReports) return [];
    if (currentStoreId === 'all' || !currentStoreId) return profitReports;
    return profitReports.filter((r) => matchesStoreId(r, currentStoreId));
  }, [profitReports, currentStoreId]);

  const sortedReports = useMemo(() => {
    return [...storeReports].sort((a, b) => String(a.month).localeCompare(String(b.month)));
  }, [storeReports]);

  useEffect(() => {
    if (!activeMonth && sortedReports.length) {
      setActiveMonth(sortedReports[sortedReports.length - 1].month);
    }
  }, [sortedReports, activeMonth]);

  const currentProfit = useMemo(
    () => sortedReports.find((r) => r.month === activeMonth) || null,
    [sortedReports, activeMonth]
  );

  const expenseItems = useMemo(
    () => buildExpenseBreakdown(currentProfit),
    [currentProfit]
  );

  const totalExpense = useMemo(
    () => expenseItems.reduce((s, it) => s + it.value, 0),
    [expenseItems]
  );
  const totalAbs = useMemo(
    () => expenseItems.reduce((s, it) => s + Math.abs(it.value), 0),
    [expenseItems]
  );

  const topExpense = useMemo(() => {
    if (!expenseItems.length) return null;
    return expenseItems.reduce((max, it) => Math.abs(it.value) > Math.abs(max.value) ? it : max, expenseItems[0]);
  }, [expenseItems]);

  const ringOption = useMemo(() => {
    if (!expenseItems.length) return null;
    return {
      tooltip: {
        trigger: 'item',
        formatter: (p) => {
          const item = expenseItems[p.dataIndex];
          const cny = item.value * (rate || 7.2);
          return `${item.name}<br/>金额：${formatMoney(item.value)}<br/>≈ ¥${Math.abs(cny).toFixed(2)}<br/>占比：${p.percent}%`;
        }
      },
      legend: { type: 'scroll', orient: 'vertical', right: 10, top: 20, bottom: 20 },
      series: [
        {
          name: '费用结构',
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['35%', '50%'],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
          label: { show: false },
          emphasis: {
            label: { show: true, fontSize: 14, fontWeight: 'bold' },
            itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.5)' }
          },
          data: expenseItems.map((it) => ({
            name: it.name,
            value: Math.abs(it.value),
            itemStyle: {
              // 费用分组配色：映射到主题图表色数组
              color: it.group === '广告花费' ? colors[2] :
                it.group === '订单支出' ? colors[1] :
                it.group === '推广费' ? colors[4] :
                it.group === '其余服务费' ? colors[3] :
                it.group === '采购成本' ? colors[5] : colors[0],
              opacity: selectedKey && it.key !== selectedKey ? 0.35 : 1
            }
          }))
        }
      ]
    };
  }, [expenseItems, selectedKey, rate, colors]);
  const ringChart = useECharts(ringOption, [ringOption], { toolbar: true, autoScale: true });

  const trendOption = useMemo(() => {
    if (!sortedReports.length) return null;
    const key = selectedKey || 'commission';
    const labels = sortedReports.map((r) => r.month);
    const data = sortedReports.map((r) => Number(Math.abs(r[key] || 0).toFixed(2)));
    const meta = EXPENSE_ITEMS.find((it) => it.key === key) || { name: key };
    return {
      tooltip: {
        trigger: 'axis',
        formatter: (p) => {
          const val = p[0].data;
          const cny = val * (rate || 7.2);
          return `${p[0].axisValue}<br/>${meta.name}：$${val.toFixed(2)}<br/>≈ ¥${cny.toFixed(2)}`;
        }
      },
      grid: { left: 60, right: 30, top: 30, bottom: 40 },
      xAxis: { type: 'category', data: labels, axisLabel: { rotate: labels.length > 6 ? 30 : 0 } },
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
          name: meta.name, type: 'line', data, smooth: true, areaStyle: { opacity: 0.15 },
          itemStyle: { color: colors[0] }, lineStyle: { width: 2 },
          markLine: {
            silent: true,
            data: [{ type: 'average', name: '平均值' }],
            label: { formatter: '均值 ${c}' }
          },
          markPoint: {
            data: [{ type: 'max', name: '最高' }, { type: 'min', name: '最低' }]
          }
        }
      ]
    };
  }, [sortedReports, selectedKey, rate, colors]);
  const trendChart = useECharts(trendOption, [trendOption], { toolbar: true, autoScale: true });

  const barOption = useMemo(() => {
    if (!expenseItems.length) return null;
    const top10 = expenseItems.slice(0, 10).reverse();
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (p) => {
          const item = top10[p[0].dataIndex];
          const cny = item.value * (rate || 7.2);
          return `${item.name}<br/>金额：${formatMoney(item.value)}<br/>≈ ¥${Math.abs(cny).toFixed(2)}`;
        }
      },
      grid: { left: 120, right: 30, top: 20, bottom: 30 },
      xAxis: {
        type: 'value',
        scale: true,
        axisLabel: { formatter: (v) => '$' + (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v) }
      },
      yAxis: {
        type: 'category',
        data: top10.map((it) => it.name),
        axisLabel: { fontSize: 11 }
      },
      series: [
        {
          type: 'bar',
          data: top10.map((it) => ({
            value: Math.abs(it.value),
            itemStyle: {
              // 费用分组配色：映射到主题图表色数组
              color: it.group === '广告花费' ? colors[2] :
                it.group === '订单支出' ? colors[1] :
                it.group === '推广费' ? colors[4] :
                it.group === '其余服务费' ? colors[3] :
                it.group === '采购成本' ? colors[5] : colors[0]
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
  }, [expenseItems, rate, colors]);
  const barChart = useECharts(barOption, [barOption], { toolbar: false, autoScale: true });

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
        page: 'expense',
        name: viewName.trim(),
        accountId: currentAccount?.id,
        config: { activeMonth, selectedKey },
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
    if (cfg.activeMonth) setActiveMonth(cfg.activeMonth);
    if (cfg.selectedKey !== undefined) setSelectedKey(cfg.selectedKey);
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

  const handleExport = () => {
    // 权限校验：导出需普通用户及以上（Lv.2+）
    if (!can(PERM.EXPORT_EXCEL)) {
      message.error('只读用户无导出权限');
      return;
    }
    if (!expenseItems.length) {
      message.warning('无数据可导出');
      return;
    }
    const exportData = expenseItems.map((r, idx) => ({
      '排名': idx + 1,
      '费用科目': r.name,
      '大类': r.group,
      '金额(USD)': Number(r.value.toFixed(2)),
      '金额(CNY)': Number((r.value * (rate || 7.2)).toFixed(2)),
      '占比(%)': Number((Math.abs(r.value) / totalAbs * 100).toFixed(2))
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '费用分析');
    const fileName = `费用分析_${activeMonth || '全部'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
    message.success(`已导出 ${exportData.length} 条费用数据`);
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

  if (!profitReports) return <Spin tip="加载中..." style={{ marginTop: 80 }} />;
  if (profitReports.length === 0) {
    return (
      <div>
        <Title level={4} style={{ marginTop: 0 }}>费用分析</Title>
        <Empty description="暂无利润报表数据，请先到「数据导入」上传" style={{ marginTop: 80 }} />
      </div>
    );
  }

  const columns = [
    { title: '排名', width: 60, align: 'center',
      render: (_, __, idx) => <Text strong>{idx + 1}</Text> },
    { title: '费用科目', dataIndex: 'name', width: 160,
      render: (v, r) => (
        <Space>
          <Button type="link" size="small" style={{ padding: 0 }}
            onClick={() => setSelectedKey(r.key)}>
            {v}
          </Button>
          {selectedKey === r.key && <Tag color="blue">选中</Tag>}
          {topExpense && topExpense.key === r.key && (
            <Tag color="red" icon={<ExclamationCircleOutlined />}>最高</Tag>
          )}
        </Space>
      ) },
    { title: '大类', dataIndex: 'group', width: 110,
      render: (v) => <Tag>{v}</Tag> },
    { title: '金额', dataIndex: 'value', width: 150, align: 'right',
      sorter: (a, b) => Math.abs(a.value) - Math.abs(b.value),
      defaultSortOrder: 'descend',
      render: (v) => (
        <strong style={{ color: v < 0 ? '#cf1322' : '#3f8600' }}>
          {formatDual(v)}
        </strong>
      ) },
    { title: '占比', width: 110, align: 'right',
      render: (_, r) => {
        const pct = totalAbs ? (Math.abs(r.value) / totalAbs * 100).toFixed(2) : '0.00';
        return (
          <Space direction="vertical" size={2} style={{ width: '100%' }}>
            <Text>{pct}%</Text>
            <div style={{ width: '100%', height: 4, background: '#f0f0f0', borderRadius: 2 }}>
              <div
                style={{
                  width: `${Math.min(100, parseFloat(pct))}%`,
                  height: '100%',
                  // 进度条颜色与金额正负色一致：负值(支出)红、正值(收入冲减)绿
                  background: r.value < 0 ? '#cf1322' : '#3f8600',
                  borderRadius: 2
                }}
              />
            </div>
          </Space>
        );
      } },
    { title: '操作', width: 110,
      render: (_, r) => (
        <Button type="link" size="small" icon={<ArrowRightOutlined />}
          onClick={() => {
            const params = new URLSearchParams({ keyword: r.name });
            navigate(`/transactions?${params.toString()}`);
          }}>
          查看明细
        </Button>
      ) }
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>费用分析</Title>
        <Space>
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

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Text strong>选择月份：</Text>
          <Select
            value={activeMonth || undefined}
            onChange={setActiveMonth}
            style={{ width: 160 }}
            options={sortedReports.map((r) => ({ value: r.month, label: r.month }))}
          />
          {selectedKey && (
            <Button size="small" onClick={() => setSelectedKey(null)}>取消选中</Button>
          )}
          {topExpense && (
            <Tooltip title={`最大费用项：${topExpense.name}，金额 ${formatMoney(topExpense.value)}`}>
              <Tag color="orange" icon={<ExclamationCircleOutlined />}>
                最大支出：{topExpense.name}
              </Tag>
            </Tooltip>
          )}
        </Space>
      </Card>

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="费用科目数" value={expenseItems.length} suffix="项" />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="费用合计"
              value={totalExpense}
              formatter={() => formatDual(totalExpense)}
              valueStyle={{ display: 'none' }}
            />
            <div style={{ color: totalExpense < 0 ? '#cf1322' : '#3f8600', fontSize: 20, fontWeight: 600, marginTop: -8 }}>
              {formatDual(totalExpense)}
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="费用绝对值合计" value={totalAbs} prefix="$" precision={2} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="最大单项支出"
              value={topExpense?.value || 0}
              formatter={() => topExpense ? formatDual(topExpense.value) : '-'}
              valueStyle={{ display: 'none' }}
            />
            <div style={{ color: '#cf1322', fontSize: 14, fontWeight: 600, marginTop: -8 }}>
              {topExpense ? topExpense.name : '-'}
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="费用结构环形图" size="small">
            {ringOption ? (
              <div ref={ringChart.ref} style={{ width: '100%', height: 360 }} />
            ) : (
              <Empty description="无数据" style={{ padding: 40 }} />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <BarChartOutlined />
                {selectedKey
                  ? `${EXPENSE_ITEMS.find((it) => it.key === selectedKey)?.name || ''} 月度趋势`
                  : '销售佣金 月度趋势（默认）'}
              </Space>
            }
            size="small"
          >
            {trendOption ? (
              <div ref={trendChart.ref} style={{ width: '100%', height: 360 }} />
            ) : (
              <Empty description="无数据" style={{ padding: 40 }} />
            )}
          </Card>
        </Col>
      </Row>

      <Card title="费用 TOP10 排行" size="small" style={{ marginBottom: 16 }}>
        {barOption ? (
          <div ref={barChart.ref} style={{ width: '100%', height: 320 }} />
        ) : (
          <Empty description="无数据" style={{ padding: 40 }} />
        )}
      </Card>

      <Card title="费用排行表（按金额降序）" size="small">
        <Table
          rowKey="key"
          size="small"
          columns={columns}
          dataSource={expenseItems}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          scroll={{ x: 900, y: 500 }}
        />
      </Card>

      <Alert
        type="info"
        showIcon
        style={{ marginTop: 16 }}
        message="使用说明"
        description={
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>点击环形图扇区或表格中费用科目名，可切换趋势图显示该科目的月度趋势</li>
            <li>点击「查看明细」可跳转到交易明细页面，并按该费用名称作为关键词筛选</li>
            <li>费用金额为负数表示支出，正数表示收入冲减</li>
            <li>图表支持工具栏：可保存为图片、查看数据视图、切换图表类型</li>
            <li>支持保存常用视图，方便快速切换</li>
          </ul>
        }
      />

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
              placeholder="例如：广告费用追踪"
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
                <li>当前月份：{activeMonth || '(全部)'}</li>
                <li>选中科目：{selectedKey ? EXPENSE_ITEMS.find((it) => it.key === selectedKey)?.name : '(默认)'}</li>
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
