import type { $Fetch } from 'ofetch';
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue';
import type { Ref } from 'vue';
import { isApiError, useApi } from './api';
import { useLoginInfo } from './loginInfo';
import { aSharePollingDelay } from '@/utils/ashare';
import type {
  AShareCandlesResponse,
  AShareInstrument,
  AShareQuoteResponse,
  AShareSearchResponse,
  AShareTimeframe,
} from '@/types/ashare';

export function useAShareChart(botId: Ref<string>) {
  const selected = ref<AShareInstrument>({
    symbol: '600519.SH',
    name: '贵州茅台',
    exchange: 'SH',
    kind: 'stock',
  });
  const timeframe = ref<AShareTimeframe>('1m');
  const autoRefresh = ref(true);
  const quote = shallowRef<AShareQuoteResponse>();
  const candles = shallowRef<AShareCandlesResponse>();
  const quoteError = ref('');
  const candlesError = ref('');
  const searchError = ref('');
  const searchResults = shallowRef<AShareInstrument[]>([]);
  const searching = ref(false);
  const loadingQuote = ref(false);
  const loadingCandles = ref(false);
  const busy = computed(() => loadingQuote.value || loadingCandles.value);
  const clients = new Map<string, $Fetch>();
  const controllers = new Set<AbortController>();
  let searchController: AbortController | undefined;
  let generation = 0;
  let searchGeneration = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let lastCandleRequest = 0;

  function client(): $Fetch {
    const id = botId.value;
    let api = clients.get(id);
    if (!api) {
      api = useApi(useLoginInfo(id), id, { isolateMarketErrors: true }).api;
      clients.set(id, api);
    }
    return api;
  }

  function errorMessage(error: unknown): string {
    return isApiError(error) && typeof error.data?.detail === 'string'
      ? error.data.detail
      : '行情更新失败，请检查连接后重试';
  }

  function clearTimer() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }

  function invalidate() {
    generation += 1;
    searchGeneration += 1;
    clearTimer();
    for (const controller of controllers) controller.abort();
    controllers.clear();
    loadingQuote.value = false;
    loadingCandles.value = false;
    searching.value = false;
  }

  async function search(query: string) {
    if (stopped || !botId.value) return;
    const version = ++searchGeneration;
    const context = generation;
    const controller = new AbortController();
    searchController?.abort();
    searchController = controller;
    controllers.add(controller);
    searching.value = true;
    try {
      const response = await client()<AShareSearchResponse>('/ashare/search', {
        query: { q: query.trim() },
        signal: controller.signal,
      });
      if (context !== generation || version !== searchGeneration || stopped) return;
      searchResults.value = response.items;
      searchError.value = response.warning ?? '';
    } catch (error) {
      if (context === generation && version === searchGeneration && !stopped) {
        searchError.value = errorMessage(error);
      }
    } finally {
      controllers.delete(controller);
      if (context === generation && version === searchGeneration) searching.value = false;
    }
  }

  function cancelSearch() {
    searchGeneration += 1;
    searchController?.abort();
    searchResults.value = [];
    searchError.value = '';
    searching.value = false;
  }

  function schedule() {
    clearTimer();
    if (autoRefresh.value && !stopped) {
      timer = setTimeout(() => void refresh(false), aSharePollingDelay());
    }
  }

  async function refresh(forceCandles = true) {
    if (stopped || !botId.value || busy.value) return;
    clearTimer();
    if (document.hidden && !forceCandles) {
      schedule();
      return;
    }
    const context = generation;
    const symbol = selected.value.symbol;
    const tf = timeframe.value;
    const controller = new AbortController();
    controllers.add(controller);
    const api = client();
    loadingQuote.value = true;
    const quoteTask = api<AShareQuoteResponse>('/ashare/quote', {
      query: { symbol },
      signal: controller.signal,
    })
      .then((response) => {
        if (context !== generation || stopped) return;
        quote.value = response;
        selected.value = response.instrument;
        quoteError.value = response.meta.warning ?? '';
      })
      .catch((error: unknown) => {
        if (context === generation && !stopped) quoteError.value = errorMessage(error);
      })
      .finally(() => {
        if (context === generation) loadingQuote.value = false;
      });

    let candleTask: Promise<void> | undefined;
    if (forceCandles || Date.now() - lastCandleRequest >= 12000) {
      lastCandleRequest = Date.now();
      loadingCandles.value = true;
      candleTask = api<AShareCandlesResponse>('/ashare/candles', {
        query: { symbol, timeframe: tf, limit: 320 },
        signal: controller.signal,
      })
        .then((response) => {
          if (context !== generation || stopped) return;
          candles.value = response;
          candlesError.value = response.meta.warning ?? '';
        })
        .catch((error: unknown) => {
          if (context === generation && !stopped) candlesError.value = errorMessage(error);
        })
        .finally(() => {
          if (context === generation) loadingCandles.value = false;
        });
    }
    await Promise.allSettled([quoteTask, candleTask]);
    controllers.delete(controller);
    if (context === generation) schedule();
  }

  watch(
    [botId, () => selected.value.symbol, timeframe],
    ([id], previous) => {
      const backendChanged = previous?.[0] !== id;
      invalidate();
      quote.value = undefined;
      candles.value = undefined;
      quoteError.value = '';
      candlesError.value = '';
      lastCandleRequest = 0;
      if (backendChanged) {
        searchResults.value = [];
        searchError.value = '';
        if (id) void search('');
      }
      if (id) void refresh();
    },
    { immediate: true, flush: 'sync' },
  );
  watch(autoRefresh, (enabled) => {
    if (enabled) void refresh();
    else clearTimer();
  });
  onScopeDispose(() => {
    stopped = true;
    invalidate();
  });

  return {
    selected,
    timeframe,
    autoRefresh,
    quote,
    candles,
    quoteError,
    candlesError,
    searchError,
    searchResults,
    searching,
    loadingQuote,
    loadingCandles,
    busy,
    search,
    cancelSearch,
    refresh,
  };
}
