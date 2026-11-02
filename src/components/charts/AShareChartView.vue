<script setup lang="ts">
import { useAShareChart } from '@/composables/useAShareChart';
import {
  aShareIntraday,
  aShareSourceLabel,
  aShareVolumeLabel,
  formatAShareTime,
} from '@/utils/ashare';

const botStore = useBotStore();
const settings = useSettingsStore();
const chart = useAShareChart(toRef(() => botStore.selectedBot));
const {
  selected,
  timeframe,
  candleSource,
  quoteSource,
  candleSourceOptions,
  quoteSourceOptions,
  availableTimeframes,
  capabilityError,
  sourceNotice,
  autoRefresh,
  quote,
  candles,
  quoteError,
  candlesError,
  searchError,
  searchResults,
  searching,
  loadingCandles,
  busy,
} = chart;
const query = ref('');
const searchOpen = ref(false);
const wrapper = useTemplateRef<HTMLElement>('wrapper');
onClickOutside(wrapper, () => {
  searchOpen.value = false;
});
const debouncedSearch = useDebounceFn((value: string) => chart.search(value), 350);
watch(query, (value) => {
  chart.cancelSearch();
  searchOpen.value = true;
  void debouncedSearch(value);
});
const kindLabel = { stock: '股票', index: '指数', etf: 'ETF' };
const number = (value: number | null | undefined, digits = 3) =>
  value?.toLocaleString('zh-CN', { maximumFractionDigits: digits }) ?? '—';
const priceColor = computed(() =>
  (quote.value?.quote.change ?? 0) >= 0 ? 'text-red-500' : 'text-green-500',
);
const warnings = computed(() => [
  ...new Set([quoteError.value, candlesError.value].filter(Boolean)),
]);
const quoteStatus = computed(() => {
  if (quote.value?.meta.stale || quoteError.value) return ' · 更新失败';
  if (!quote.value) return '';
  const stamp = quote.value.meta.data_time;
  if (stamp && formatAShareTime(stamp, true) !== formatAShareTime(Date.now(), true)) {
    return ' · 最近交易日行情';
  }
  return ' · 获取成功';
});

function select(symbol: string) {
  const item = searchResults.value.find((entry) => entry.symbol === symbol);
  if (item) selected.value = item;
  searchOpen.value = false;
}
</script>

<template>
  <div
    class="flex h-full min-h-0 flex-col gap-3 p-2 md:p-3 overflow-y-auto"
    data-testid="ashare-view"
  >
    <div class="flex flex-wrap items-end gap-3">
      <div ref="wrapper" class="relative w-full sm:w-80">
        <label for="ashare-search" class="mb-1 block text-sm text-muted">股票、指数或 ETF</label>
        <UInput
          id="ashare-search"
          v-model="query"
          placeholder="名称 / 代码，例如 茅台、000001"
          class="w-full"
          autocomplete="off"
          :loading="searching"
          @focus="searchOpen = true"
          @keydown.esc="searchOpen = false"
          @keydown.enter="chart.search(query)"
        />
        <div
          v-if="searchOpen"
          class="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-md border border-default bg-default p-1 shadow-lg"
          aria-label="标的搜索结果"
        >
          <p v-if="searchError" class="p-2 text-sm text-warning" role="status">{{ searchError }}</p>
          <button
            v-for="item in searchResults"
            :key="item.symbol"
            type="button"
            class="flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-left hover:bg-elevated focus:bg-elevated"
            @click="select(item.symbol)"
          >
            <span
              ><span class="block font-medium">{{ item.name }}</span
              ><span class="text-xs text-muted"
                >{{ item.symbol }} · {{ item.exchange === 'SH' ? '上海' : '深圳' }}</span
              ></span
            >
            <span class="text-xs text-muted">{{ kindLabel[item.kind] }}</span>
          </button>
          <p v-if="!searchResults.length" class="p-3 text-sm text-muted">
            {{ searching ? '正在搜索…' : '暂无匹配标的，可输入完整代码如 600519.SH' }}
          </p>
        </div>
      </div>
      <UFormField label="周期">
        <USelect
          :model-value="timeframe"
          :items="availableTimeframes"
          class="w-28"
          aria-label="A 股周期"
          @update:model-value="chart.setTimeframe"
        />
      </UFormField>
      <UFormField label="K 线数据源">
        <USelect
          :model-value="candleSource"
          :items="candleSourceOptions"
          class="w-40"
          aria-label="K 线数据源"
          @update:model-value="chart.setCandleSource"
        />
      </UFormField>
      <UFormField label="报价数据源">
        <USelect
          v-model="quoteSource"
          :items="quoteSourceOptions"
          class="w-36"
          aria-label="报价数据源"
        />
      </UFormField>
      <UButton icon="mdi:refresh" color="neutral" :loading="busy" @click="chart.refresh()"
        >刷新</UButton
      >
      <label class="flex h-8 items-center gap-2 text-sm"
        ><USwitch v-model="autoRefresh" aria-label="自动刷新 A 股行情" />自动刷新</label
      >
      <span class="pb-1 text-xs text-muted">北京时间 · 不复权 · 红涨绿跌</span>
    </div>

    <div
      class="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-md bg-elevated/60 px-3 py-2 text-sm"
      data-testid="ashare-sources"
      aria-live="polite"
    >
      <span
        >K 线当前来源：<strong>{{ aShareSourceLabel(candles?.meta.source) }}</strong
        >{{ candles?.meta.fallback_used ? '（自动备用）' : ''
        }}{{ candles?.meta.stale || candlesError ? ' · 更新失败' : '' }}</span
      >
      <span
        >报价当前来源：<strong>{{ aShareSourceLabel(quote?.meta.source) }}</strong
        >{{ quote?.meta.fallback_used ? '（自动备用）' : ''
        }}{{ quote?.meta.stale || quoteError ? ' · 更新失败' : '' }}</span
      >
      <span v-if="candleSource !== 'auto' || quoteSource !== 'auto'" class="text-xs text-muted"
        >手动指定来源时，失败会提示，不自动换源。</span
      >
    </div>
    <p v-if="sourceNotice || capabilityError" role="status" class="text-sm text-warning">
      {{ sourceNotice || capabilityError }}
    </p>

    <div
      class="flex flex-wrap items-center justify-between gap-3 rounded-md bg-elevated/60 px-3 py-3"
    >
      <div>
        <div class="flex items-baseline gap-2">
          <h2 class="text-lg font-semibold">{{ selected.name }}</h2>
          <span class="text-sm text-muted"
            >{{ selected.symbol }} · {{ kindLabel[selected.kind] }}</span
          >
        </div>
        <p class="mt-1 text-xs text-muted">{{ quote?.meta.session ?? '行情加载中' }}</p>
      </div>
      <div class="flex items-baseline gap-3" :class="priceColor">
        <span class="text-3xl font-semibold tabular-nums" data-testid="ashare-price">{{
          number(quote?.quote.price)
        }}</span>
        <span class="text-sm tabular-nums"
          >{{ (quote?.quote.change ?? 0) > 0 ? '+' : '' }}{{ number(quote?.quote.change) }} /
          {{ (quote?.quote.change_percent ?? 0) > 0 ? '+' : ''
          }}{{ number(quote?.quote.change_percent, 2) }}%</span
        >
      </div>
      <dl class="flex flex-wrap gap-x-5 gap-y-1 text-sm tabular-nums">
        <div>
          <dt class="text-xs text-muted">昨收</dt>
          <dd>{{ number(quote?.quote.previous_close) }}</dd>
        </div>
        <div>
          <dt class="text-xs text-muted">今开</dt>
          <dd>{{ number(quote?.quote.open) }}</dd>
        </div>
        <div>
          <dt class="text-xs text-muted">最高 / 最低</dt>
          <dd>{{ number(quote?.quote.high) }} / {{ number(quote?.quote.low) }}</dd>
        </div>
        <div>
          <dt class="text-xs text-muted">当日累计成交量</dt>
          <dd>
            {{ number(quote?.quote.volume, 0) }} {{ aShareVolumeLabel(quote?.meta.volume_unit) }}
          </dd>
        </div>
      </dl>
    </div>

    <p
      v-for="warning in warnings"
      :key="warning"
      role="status"
      class="rounded bg-warning/10 px-3 py-2 text-sm text-warning"
    >
      {{ warning }}{{ quote || candles ? '；当前保留最近成功数据。' : '' }}
    </p>
    <div class="flex min-h-80 flex-1 flex-col">
      <AShareCandleChart
        v-if="candles?.candles.length"
        :key="`${botStore.selectedBot}:${selected.symbol}:${timeframe}:${candleSource}`"
        :dataset="candles"
        :theme="settings.chartTheme"
        class="min-h-80 flex-1"
      />
      <div
        v-else
        class="flex min-h-80 flex-1 items-center justify-center rounded-md bg-elevated/30 text-muted"
        role="status"
      >
        {{ loadingCandles ? '正在加载真实 K 线…' : candlesError || '暂无 K 线数据，请刷新' }}
      </div>
    </div>
    <div class="flex flex-wrap justify-between gap-2 text-xs text-muted">
      <span
        >快照：{{ aShareSourceLabel(quote?.meta.source)
        }}{{ quote?.meta.fallback_used ? '（备用）' : '' }} · 行情时间
        {{ formatAShareTime(quote?.meta.data_time) }}{{ quoteStatus }}</span
      >
      <span
        >K 线：{{ aShareSourceLabel(candles?.meta.source) }} ·
        {{ candles?.candles.length ?? 0 }} 根{{
          candles && !candles.complete ? '（上游可用数量不足）' : ''
        }}
        · {{ formatAShareTime(candles?.coverage_start, !aShareIntraday(timeframe)) }} —
        {{ formatAShareTime(candles?.coverage_end, !aShareIntraday(timeframe))
        }}{{ candles?.meta.stale || candlesError ? ' · 更新失败' : '' }}</span
      >
    </div>
    <p class="text-xs text-muted">
      分钟 K
      线按区间结束时间显示，最后一根可继续更新。节假日、停牌期间保留最近行情，请以行情时间为准。
      <span v-if="selected.kind === 'index'"
        >指数成交量按供应商统计范围汇总，不同来源数值可能不同。</span
      >
    </p>
  </div>
</template>
