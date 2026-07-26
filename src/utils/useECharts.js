// ECharts React hook —— 强制 canvas 渲染，支持工具栏、自适应轴、全屏
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
      // 总计柱：从0开始，单独显示（不参与堆叠递进）
      baseData.push(0);
      valueData.push({
        value: it.value,
        itemStyle: {
          color: it.value >= 0 ? '#1e3a5f' : '#cf1322',
          borderColor: it.value >= 0 ? '#0a1e3a' : '#a8071a',
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
 * 生成日历热力图配置（暖色渐变：浅黄→橙→深红）
 */
export function buildCalendarHeatmapOption(data, { title = '', unit = '$' } = {}) {
  if (!data || data.length === 0) {
    return { title: { text: '暂无数据', left: 'center' } };
  }
  const dates = data.map((d) => d.date);
  const minDate = dates.reduce((a, b) => a < b ? a : b);
  const maxDate = dates.reduce((a, b) => a > b ? a : b);
  const vals = data.map((d) => Math.abs(d.value)).sort((a, b) => a - b);
  const len = vals.length;
  const minVal = vals[0] || 0;
  const maxVal = vals[len - 1] || 100;

  // 计算分段值，确保区间不重叠
  const p20 = vals[Math.floor(len * 0.2)] || 0;
  const p40 = vals[Math.floor(len * 0.4)] || 0;
  const p60 = vals[Math.floor(len * 0.6)] || 0;
  const p80 = vals[Math.floor(len * 0.8)] || 0;

  // 如果数值分布太集中（前后区间相同），使用线性渐变
  const usePieces = (p20 !== p80 || p20 === 0) && maxVal > 0;

  const visualMapConfig = {
    min: 0,
    max: maxVal,
    calculable: true,
    orient: 'horizontal',
    left: 'center',
    bottom: 0,
    text: ['高', '低'],
    inRange: {
      color: ['#fff7e6', '#ffe7ba', '#ffd591', '#ffa940', '#fa541c', '#cf1322']
    }
  };

  if (usePieces && len > 5) {
    visualMapConfig.pieces = [
      { min: -Infinity, max: 0, color: '#f5f5f5', label: '无' },
      { min: 0.01, max: Math.max(p20, 0.01), color: '#fff7e6', label: '极低' },
      { min: Math.max(p20, 0.01) + 0.01, max: p40, color: '#ffd591', label: '低' },
      { min: p40 + 0.01, max: p60, color: '#ffa940', label: '中' },
      { min: p60 + 0.01, max: p80, color: '#fa541c', label: '高' },
      { min: p80 + 0.01, max: maxVal + 1, color: '#cf1322', label: '极高' }
    ];
    delete visualMapConfig.inRange;
  }

  return {
    title: title ? { text: title, left: 'center', textStyle: { fontSize: 14 } } : undefined,
    tooltip: {
      formatter: (p) => `${p.data[0]}<br/>${unit}${Number(p.data[1]).toFixed(2)}`
    },
    visualMap: visualMapConfig,
    calendar: {
      top: 60,
      left: 40,
      right: 40,
      cellSize: ['auto', 16],
      range: [minDate.slice(0, 7), maxDate.slice(0, 7)],
      itemStyle: { borderWidth: 2, borderColor: '#fff' },
      dayLabel: { nameMap: ['日', '一', '二', '三', '四', '五', '六'] },
      monthLabel: { nameMap: 'cn' },
      yearLabel: { show: true }
    },
    series: {
      type: 'heatmap',
      coordinateSystem: 'calendar',
      data: data.map((d) => [d.date, d.value])
    }
  };
}

// 全局图表配色方案（参考 Stripe + Amazon Seller Central 风格）
export const CHART_COLORS = [
  '#635BFF', // 紫蓝（Stripe 主色）
  '#00D4AA', // 青绿
  '#FF6B6B', // 珊瑚红
  '#FFA940', // 暖橙
  '#36CFC9', // 湖蓝
  '#B37FEB', // 紫罗兰
  '#FFC53D', // 金黄
  '#5CDBD3', // 浅青
  '#F759AB', // 品红
  '#85A5FF', // 淡蓝
  '#95DE64', // 亮绿
  '#FF9C6E', // 桃橙
  '#69C0FF', // 天蓝
  '#FF85C0', // 粉红
  '#B2F5EA', // 薄荷
];
