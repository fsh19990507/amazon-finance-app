// ECharts React hook —— 强制 canvas 渲染，支持工具栏、自适应轴、全屏
// 使用全量 echarts 引入（此前 echarts/core 按需引入对日历热力图渲染存在兼容性问题，
// 全量引入最稳妥；包体略大但功能完整）
import { useEffect, useRef, useState, useCallback } from 'react';
import * as echarts from 'echarts';

/**
 * @param {object|null} option ECharts 配置
 * @param {Array} deps 依赖项
 * @param {object} opts
 * @param {boolean} opts.toolbar 是否显示右上角工具栏
 * @param {boolean} opts.autoScale y轴是否自适应（不从0开始）
 * @returns {{ref: import('react').RefObject, chart: import('echarts').ECharts|null, toggleFullscreen: function}}
 */
export function useECharts(option, deps = [], opts = {}) {
  const ref = useRef(null);
  const chartRef = useRef(null);
  const [fullscreen, setFullscreen] = useState(false);
  const { toolbar = true, autoScale = true } = opts;

  const applyOption = useCallback((opt) => {
    if (!chartRef.current || !opt) return;
    let merged = { ...opt };

    // 自适应 y 轴（针对 line/bar 等有 yAxis 的图）
    if (autoScale && merged.yAxis && !merged.yAxis.scale) {
      const yArr = Array.isArray(merged.yAxis) ? merged.yAxis : [merged.yAxis];
      merged.yAxis = yArr.map((y) => ({
        ...y,
        scale: y.scale !== false,
        axisLabel: { ...(y.axisLabel || {}) }
      }));
      if (!Array.isArray(opt.yAxis)) merged.yAxis = merged.yAxis[0];
    }

    // 工具栏
    if (toolbar && !merged.toolbox) {
      merged.toolbox = {
        right: 10,
        top: 0,
        feature: {
          dataZoom: { yAxisIndex: 'none' },
          dataView: { readOnly: true, title: '数据视图' },
          magicType: { type: ['line', 'bar', 'stack'], title: { line: '折线', bar: '柱状', stack: '堆叠' } },
          restore: { title: '还原' },
          saveAsImage: { title: '保存图片', name: 'chart' }
        },
        iconStyle: { borderColor: '#8c8c8c' }
      };
    }

    // tooltip 增强
    if (!merged.tooltip) {
      merged.tooltip = {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        backgroundColor: 'rgba(255,255,255,0.95)',
        borderColor: '#e8e8e8',
        textStyle: { color: '#333' }
      };
    }

    chartRef.current.setOption(merged, true);
  }, [toolbar, autoScale]);

  // 初始化 + setOption
  useEffect(() => {
    if (!ref.current) return;
    if (!chartRef.current) {
      chartRef.current = echarts.init(ref.current, null, { renderer: 'canvas' });
    }
    if (option) {
      applyOption(option);
    }
    const handleResize = () => chartRef.current && chartRef.current.resize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyOption, ...deps]);

  // 卸载时销毁
  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.dispose();
        chartRef.current = null;
      }
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!ref.current) return;
    const el = ref.current;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().then(() => {
        setFullscreen(true);
        setTimeout(() => chartRef.current?.resize(), 200);
      });
    } else {
      document.exitFullscreen?.().then(() => {
        setFullscreen(false);
        setTimeout(() => chartRef.current?.resize(), 200);
      });
    }
  }, []);

  return { ref, chart: chartRef.current, toggleFullscreen, fullscreen };
}

// ===== 常用图表配置生成器 =====

/**
 * 生成瀑布图配置
 * @param {Array} items [{name, value, isTotal?}]
 * @param {object} style
 */
export function buildWaterfallOption(items, { title = '', unit = '$' } = {}) {
  if (!items || !items.length) {
    return { title: { text: '暂无数据', left: 'center' } };
  }

  const labels = [];
  const baseData = [];
  const valueData = [];
  let currentTotal = 0;

  items.forEach((it) => {
    labels.push(it.name);
    if (it.isTotal) {
      // 总计柱：从0开始，单独显示（不参与堆叠递进）；正绿负红，与 KPI 卡片一致
      baseData.push(0);
      valueData.push({
        value: it.value,
        itemStyle: {
          color: it.value >= 0 ? '#3f8600' : '#cf1322',
          borderColor: it.value >= 0 ? '#237804' : '#a8071a',
          borderWidth: 1
        }
      });
    } else {
      baseData.push(currentTotal);
      if (it.value >= 0) {
        // 收入：从 currentTotal 向上
        valueData.push({
          value: it.value,
          itemStyle: { color: '#389e0d', borderRadius: [2, 2, 0, 0] }
        });
      } else {
        // 支出：从 currentTotal 向下（负值）
        valueData.push({
          value: it.value,
          itemStyle: { color: '#cf1322', borderRadius: [0, 0, 2, 2] }
        });
      }
      currentTotal += it.value;
    }
  });

  // 计算 y 轴范围
  const allValues = items.map((it) => it.value);
  const dataMin = Math.min(0, ...allValues);
  const dataMax = Math.max(0, ...allValues);
  const padding = Math.max(Math.abs(dataMax - dataMin) * 0.12, 10);

  return {
    title: title ? { text: title, left: 'center', textStyle: { fontSize: 14, fontWeight: 600 } } : undefined,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const pValue = params.find(p => p.seriesName === 'value');
        if (!pValue) return '';
        const it = items[pValue.dataIndex];
        const val = it.value;
        const sign = val >= 0 ? '+' : '';
        const color = val >= 0 ? '#389e0d' : '#cf1322';
        return `<strong>${pValue.name}</strong><br/><span style="color:${color};font-size:16px;font-weight:bold">${sign}${unit}${val.toFixed(2)}</span>`;
      }
    },
    grid: { left: 70, right: 40, top: 50, bottom: 40 },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: {
        interval: 0,
        rotate: labels.length > 6 ? 25 : 0,
        fontSize: 11,
        color: '#595959'
      },
      axisLine: { lineStyle: { color: '#d9d9d9' } }
    },
    yAxis: {
      type: 'value',
      min: dataMin - padding,
      max: dataMax + padding,
      axisLabel: {
        formatter: (v) => unit + (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(0)),
        fontSize: 11
      },
      splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } }
    },
    series: [
      {
        name: 'base',
        type: 'bar',
        stack: 'waterfall',
        data: baseData,
        itemStyle: { color: 'transparent' },
        label: { show: false },
        emphasis: { itemStyle: { color: 'transparent' } },
        tooltip: { show: false }
      },
      {
        name: 'value',
        type: 'bar',
        stack: 'waterfall',
        data: valueData,
        barWidth: '55%',
        label: {
          show: true,
          position: 'top',
          fontSize: 11,
          color: '#262626',
          formatter: (p) => {
            const it = items[p.dataIndex];
            const val = it.value;
            const sign = val >= 0 ? '+' : '';
            return `${sign}${unit}${Math.abs(val).toFixed(0)}`;
          }
        },
        emphasis: {
          itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.2)' }
        }
      }
    ]
  };
}

/**
 * 生成雷达图配置（多店铺对比）
 */
export function buildRadarOption(indicators, seriesData, { title = '' } = {}) {
  return {
    title: title ? { text: title, left: 'center', textStyle: { fontSize: 14 } } : undefined,
    tooltip: {},
    legend: { bottom: 0 },
    radar: {
      indicator: indicators,
      shape: 'polygon',
      splitNumber: 4,
      axisName: { color: '#666' }
    },
    series: [{
      type: 'radar',
      data: seriesData,
      areaStyle: { opacity: 0.2 }
    }]
  };
}

/**
 * 生成日历热力图配置（5 段高区分度品牌蓝色阶：浅灰无数据 → 浅蓝 → 蓝 → 深蓝 → 墨蓝）
 * 颜色深度与销售额正相关，月份边界清晰
 *
 * 关键设计：**始终使用分位数分段（pieces）** 而不是线性色阶。
 * 原因：销售额数据往往集中在很小的区间（如 500~600 美元），
 * 线性色阶会把所有日子映射成几乎相同的浅色，看不出深浅差异。
 * 分位数分段保证每一段颜色都有数据落入，深浅层次永远分明。
 */
export function buildCalendarHeatmapOption(data, { title = '', unit = '$' } = {}) {
  if (!data || data.length === 0) {
    return { title: { text: '暂无数据', left: 'center' } };
  }
  const dates = data.map((d) => d.date);
  const minDate = dates.reduce((a, b) => (a < b ? a : b));
  const maxDate = dates.reduce((a, b) => (a > b ? a : b));
  const vals = data.map((d) => Math.abs(d.value)).sort((a, b) => a - b);
  const len = vals.length;
  const maxVal = vals[len - 1] || 0;

  // 无数据 / 非正数日颜色（纯灰，不带任何蓝色，与"低值"彻底区分）
  const NO_DATA_COLOR = '#f0f0f0';
  // 5 段色阶：低 → 中低 → 中高 → 高（明度递增，相邻两段差异明显）
  const LEVELS = [
    { color: '#cfe2f7', label: '低' },
    { color: '#9dbee8', label: '中低' },
    { color: '#5b8acb', label: '中高' },
    { color: '#1e3a5f', label: '高' }
  ];

  // 计算 4 个分位阈值（25%/50%/75%/最大值），去重且严格递增
  const pct = (p) => vals[Math.min(len - 1, Math.floor(len * p))] || 0;
  const rawBounds = [pct(0.25), pct(0.5), pct(0.75), maxVal];
  const bounds = [];
  let last = -Infinity;
  for (const v of rawBounds) {
    if (v > last) { bounds.push(v); last = v; }
  }
  // 兜底：全部相同或异常时至少保留一个分段
  if (bounds.length === 0) bounds.push(maxVal > 0 ? maxVal : 1);

  // 组装 pieces：≤0 灰色无数据段 + 递增色段
  const pieces = [{ max: 0, color: NO_DATA_COLOR, label: '无' }];
  let prevHi = 0;
  bounds.forEach((hi, i) => {
    const lo = prevHi === 0 ? 0.01 : prevHi + 0.01;
    const lvl = LEVELS[Math.min(i, LEVELS.length - 1)];
    pieces.push({ min: lo, max: hi, color: lvl.color, label: lvl.label });
    prevHi = hi;
  });

  const visualMapConfig = {
    min: 0,
    max: maxVal,
    calculable: false, // pieces 分段模式下 calculable 不适用
    orient: 'horizontal',
    left: 'center',
    // 底部独立空间：卡片底部留白，图例条不贴格子（此前紧贴最后一行格子，视觉上"压在颜色上"）
    bottom: 6,
    itemWidth: 18,
    itemHeight: 11,
    text: ['高', '低'],
    textStyle: { color: '#8c8c8c', fontSize: 11 },
    pieces
  };

  // 日历范围：ECharts 5.5 的 calendar.range 传"月份字符串数组"（如 ['2026-06','2026-06']）
  // 会触发布局 bug——只渲染第一天，其余格子全部丢失（用户反馈"热力图颜色不对"的根因）。
  // 已验证：单月字符串 '2026-06' 或日级数组 ['2026-06-01','2026-06-28'] 均正常。
  // 这里：单月数据用单月字符串（整月展示最直观）；跨月兜底用日级数组。
  const singleMonth = minDate.slice(0, 7) === maxDate.slice(0, 7);
  const calendarRange = singleMonth ? minDate.slice(0, 7) : [minDate, maxDate];

  // 每格显示日期数字：浅色格子用深字、深色格子用白字，保证可读
  const dateTextColorFor = (v) => {
    const a = Math.abs(v);
    for (let i = 0; i < bounds.length; i++) {
      if (a <= bounds[i]) {
        const c = LEVELS[Math.min(i, LEVELS.length - 1)].color;
        return (c === '#cfe2f7' || c === '#9dbee8') ? 'rgba(30,58,95,0.85)' : '#ffffff';
      }
    }
    return '#ffffff';
  };

  return {
    title: title ? { text: title, left: 'center', textStyle: { fontSize: 14, fontWeight: 600 } } : undefined,
    tooltip: {
      formatter: (p) => {
        const v = Number(p.data[1]);
        const sign = v < 0 ? '-' : '';
        return `${p.data[0]}<br/>${sign}${unit}${Math.abs(v).toFixed(2)}`;
      }
    },
    visualMap: visualMapConfig,
    calendar: {
      // 竖向月历布局（orient: 'vertical'）：7 列 × 周数行，与传统日历一致。
      // 注意：ECharts 默认 orient 为 'horizontal'（横向：每周一列、7 行星期），
      // 会渲染成"横排 7 行、颜色成对"的怪异布局，用户无法接受。
      orient: 'vertical',
      // top 收紧顶部空白；bottom 为图例留出独立空间（防止图例紧贴/压住格子）
      top: 32,
      left: 40,
      right: 14,
      bottom: 42,
      cellSize: ['auto', 17],
      range: calendarRange,
      itemStyle: { borderWidth: 2, borderColor: '#fff' },
      // 星期标签字号调小
      dayLabel: { nameMap: ['日', '一', '二', '三', '四', '五', '六'], color: '#8c8c8c', fontSize: 10 },
      monthLabel: { nameMap: 'cn', color: '#595959', fontSize: 12, fontWeight: 600 },
      yearLabel: { show: true, color: '#8c8c8c', fontWeight: 600 },
      splitLine: { lineStyle: { color: '#d9d9d9', width: 1 } }
    },
    series: {
      type: 'heatmap',
      coordinateSystem: 'calendar',
      // 注意：这里不配置 label（show 默认 false）。
      // ECharts 5.4/5.6 对"日历热力图 + label 函数（formatter/color 回调）"组合存在渲染 bug
      // （每天两格、格子错位），任何 label 函数都会触发。日期数字改由 Dashboard 用 graphic
      // 组件按 calendar 坐标手动绘制（见 _meta 字段）。
      data: data.map((d) => [d.date, d.value])
    },
    // 内部元数据：供外部（Dashboard）用 graphic 绘制格子内日期文字
    // data: 原始 [{date, value}]；bounds/levels: 分段阈值与色阶
    _meta: { data, bounds, levels: LEVELS }
  };
}

// 全局图表配色方案
// 主题化：CHART_COLORS 保留为默认主题（经典商务蓝）的配色，兼容旧引用；
// 页面如需随主题变化，请使用 chartColorsFor(themeId)
import { chartColorsFor } from '../theme/themes.js';

export const CHART_COLORS = chartColorsFor('corporate');

// 重新导出：按主题 ID 获取图表配色（各页面 useTheme() 后调用）
export { chartColorsFor };
