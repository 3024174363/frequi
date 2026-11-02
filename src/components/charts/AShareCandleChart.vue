<script setup lang="ts">
import ECharts from 'vue-echarts';
import { use } from 'echarts/core';
import { BarChart, CandlestickChart } from 'echarts/charts';
import {
  AxisPointerComponent,
  DataZoomComponent,
  GridComponent,
  TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsOption, TooltipComponentFormatterCallbackParams } from 'echarts';
import type { StockMarketCandlesResponse } from '@/types/stockMarket';
import { aShareIntraday, aShareVolumeLabel, formatAShareTime } from '@/utils/ashare';
import { formatHKShareTime } from '@/utils/hkshare';

use([
  BarChart,
  CandlestickChart,
  AxisPointerComponent,
  DataZoomComponent,
  GridComponent,
  TooltipComponent,
  CanvasRenderer,
]);

const props = defineProps<{ dataset: StockMarketCandlesResponse; theme: 'dark' | 'light' }>();
const formatTime = (value: number, daily: boolean) =>
  props.dataset.instrument.exchange === 'HK'
    ? formatHKShareTime(value, daily)
    : formatAShareTime(value, daily);
const chart = useTemplateRef<InstanceType<typeof ECharts>>('chart');
const up = '#ef4444';
const down = '#22c55e';

function tooltip(params: TooltipComponentFormatterCallbackParams): string {
  const item = Array.isArray(params) ? params[0] : params;
  const bar = item ? props.dataset.candles[item.dataIndex] : undefined;
  if (!bar) return '';
  const number = (value: number | null) =>
    value?.toLocaleString('zh-CN', { maximumFractionDigits: 3 }) ?? '—';
  return [
    formatTime(bar.timestamp, !aShareIntraday(props.dataset.timeframe)),
    `开 ${number(bar.open)} / 高 ${number(bar.high)}`,
    `低 ${number(bar.low)} / 收 ${number(bar.close)}`,
    `成交量 ${number(bar.volume)} ${aShareVolumeLabel(props.dataset.meta.volume_unit)}`,
    bar.complete ? '' : '当前 K 线尚未结束',
  ]
    .filter(Boolean)
    .join('<br>');
}

function update(initial = false) {
  const bars = props.dataset.candles;
  const labels = bars.map((bar) =>
    formatTime(bar.timestamp, !aShareIntraday(props.dataset.timeframe)),
  );
  const option: EChartsOption = {
    backgroundColor: 'transparent',
    animation: false,
    grid: [
      { left: 12, right: 78, top: 22, bottom: '27%' },
      { left: 12, right: 78, top: '77%', bottom: 66 },
    ],
    tooltip: { trigger: 'axis', confine: true, formatter: tooltip, axisPointer: { type: 'cross' } },
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    xAxis: [
      {
        type: 'category',
        data: labels,
        boundaryGap: true,
        axisLabel: { show: false },
        axisPointer: { label: { show: false } },
      },
      {
        type: 'category',
        gridIndex: 1,
        data: labels,
        axisLabel: {
          hideOverlap: true,
          formatter: (label: string) =>
            aShareIntraday(props.dataset.timeframe) ? label.slice(5, 16) : label,
        },
      },
    ],
    yAxis: [
      {
        scale: true,
        position: 'right',
        splitNumber: 5,
        splitLine: { lineStyle: { opacity: 0.15 } },
      },
      {
        show: props.dataset.meta.volume_unit !== 'unavailable',
        scale: true,
        gridIndex: 1,
        position: 'right',
        splitNumber: 2,
        name: '成交量',
        axisLabel: {
          formatter: (value: number) =>
            value >= 1e8
              ? `${(value / 1e8).toFixed(1)}亿`
              : value >= 1e4
                ? `${(value / 1e4).toFixed(1)}万`
                : String(value),
        },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        id: 'candles',
        name: 'K 线',
        type: 'candlestick',
        data: bars.map((bar) => [bar.open, bar.close, bar.low, bar.high]),
        itemStyle: { color: up, color0: down, borderColor: up, borderColor0: down },
      },
      {
        id: 'volume',
        name: '成交量',
        type: 'bar',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: bars.map((bar) => ({
          value: bar.volume,
          itemStyle: { color: bar.close >= bar.open ? up : down, opacity: 0.65 },
        })),
      },
    ],
  };
  if (initial) {
    option.dataZoom = [
      {
        id: 'inside',
        type: 'inside',
        xAxisIndex: [0, 1],
        start: Math.max(0, (1 - 120 / bars.length) * 100),
        end: 100,
      },
      {
        id: 'slider',
        type: 'slider',
        xAxisIndex: [0, 1],
        bottom: 10,
        height: 24,
        start: Math.max(0, (1 - 120 / bars.length) * 100),
        end: 100,
      },
    ];
  }
  chart.value?.setOption(option, { notMerge: initial });
}

onMounted(() => update(true));
watch(
  () => props.dataset,
  () => update(),
);
watch(
  () => props.theme,
  async () => {
    await nextTick();
    update(true);
  },
);
</script>

<template>
  <ECharts ref="chart" :theme="theme" manual-update autoresize class="h-full w-full min-h-80" />
</template>
