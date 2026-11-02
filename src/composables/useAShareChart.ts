import type { $Fetch } from 'ofetch';
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue';
import type { Ref } from 'vue';
import { isApiError, useApi } from './api';
import { useLoginInfo } from './loginInfo';
import { aSharePollingDelay, aShareSourceLabel, aShareTimeframeLabel } from '@/utils/ashare';
import { hkSharePollingDelay } from '@/utils/hkshare';
import type { AShareTimeframe, AShareSource, AShareCapabilities } from '@/types/ashare';
import type {
  StockMarket,
  StockMarketCandlesResponse,
  StockMarketInstrument,
  StockMarketQuoteResponse,
  StockMarketSearchResponse,
} from '@/types/stockMarket';

export function useAShareChart(botId: Ref<string>, market: StockMarket = 'ashare') {
  const isHK = market === 'hkshare';
  const prefix = `/${market}`;
  const selected = ref<StockMarketInstrument>(
    isHK
      ? {
          symbol: '00700' + '.HK',
          name: '腾讯控股',
          exchange: 'HK',
          kind: 'stock',
          currency: 'HKD',
        }
      : { symbol: '600519.SH', name: '贵州茅台', exchange: 'SH', kind: 'stock' },
  );
  const timeframe = ref<AShareTimeframe>(isHK ? '1d' : '1m');
  const candleSource = ref<AShareSource>(isHK ? 'tencent' : 'auto');
  const quoteSource = ref<AShareSource>(isHK ? 'tencent' : 'auto');
  const capabilities = shallowRef<AShareCapabilities>();
  const capabilityError = ref('');
  const sourceNotice = ref('');
  const availableTimeframes = computed(() => {
    const supported =
      capabilities.value?.timeframes ??
      (isHK ? (['1d', '1w', '1M'] as const) : (['1m', '1d'] as const));
    const provider = capabilities.value?.providers.find((p) => p.source === candleSource.value);
    return supported
      .filter(
        (tf) => candleSource.value === 'auto' || !provider || provider.timeframes.includes(tf),
      )
      .map((tf) => ({ value: tf, label: aShareTimeframeLabel(tf) }));
  });
  function sourceOptions(operation: string) {
    return [
      ...(isHK ? [] : [{ value: 'auto' as AShareSource, label: '自动选择', disabled: false }]),
      ...(capabilities.value?.providers ?? [])
        .filter((p) => p.operations.includes(operation))
        .map((p) => ({
          value: p.source as AShareSource,
          label: aShareSourceLabel(p.source) + (p.enabled ? '' : '（暂不可用）'),
          disabled: !p.enabled,
        })),
    ];
  }
  const candleSourceOptions = computed(() => sourceOptions('candles'));
  const quoteSourceOptions = computed(() => sourceOptions('quote'));
  const autoRefresh = ref(true);
  const quote = shallowRef<StockMarketQuoteResponse>();
  const candles = shallowRef<StockMarketCandlesResponse>();
  const quoteError = ref('');
  const candlesError = ref('');
  const searchError = ref('');
  const searchResults = shallowRef<StockMarketInstrument[]>([]);
  const searching = ref(false);
  const loadingQuote = ref(false);
  const loadingCandles = ref(false);
  const busy = computed(() => loadingQuote.value || loadingCandles.value);
  const clients = new Map<string, $Fetch>();
  const controllers = new Set<AbortController>();
  let searchController: AbortController | undefined;
  let capabilityController: AbortController | undefined;
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
      const response = await client()<StockMarketSearchResponse>(`${prefix}/search`, {
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

  async function loadCapabilities() {
    const id = botId.value;
    const controller = new AbortController();
    capabilityController?.abort();
    capabilityController = controller;
    try {
      const response = await client()<AShareCapabilities>(`${prefix}/capabilities`, {
        signal: controller.signal,
      });
      if (stopped || botId.value !== id || controller.signal.aborted) return;
      capabilities.value = response;
      capabilityError.value = '';
    } catch {
      if (!stopped && botId.value === id && !controller.signal.aborted) {
        capabilityError.value = `数据源列表获取失败，请重新进入${isHK ? '港股' : ' A 股'}页面重试`;
      }
    } finally {
      if (capabilityController === controller) capabilityController = undefined;
    }
  }

  function setCandleSource(value: AShareSource) {
    const provider = capabilities.value?.providers.find((p) => p.source === value);
    if (value !== 'auto' && (!provider?.enabled || !provider.timeframes.length)) return;
    sourceNotice.value = '';
    if (provider && !provider.timeframes.includes(timeframe.value)) {
      const next = provider.timeframes[0];
      if (next) {
        sourceNotice.value = `${aShareSourceLabel(value)}不支持${aShareTimeframeLabel(timeframe.value)}，已切换为${aShareTimeframeLabel(next)}`;
        timeframe.value = next;
      }
    }
    candleSource.value = value;
  }

  function setTimeframe(value: AShareTimeframe) {
    if (!availableTimeframes.value.some((item) => item.value === value)) return;
    sourceNotice.value = '';
    timeframe.value = value;
  }

  function schedule() {
    clearTimer();
    if (autoRefresh.value && !stopped) {
      timer = setTimeout(
        () => void refresh(false),
        isHK ? hkSharePollingDelay() : aSharePollingDelay(),
      );
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
    const requestedQuoteSource = quoteSource.value;
    const requestedCandleSource = candleSource.value;
    const controller = new AbortController();
    controllers.add(controller);
    const api = client();
    loadingQuote.value = true;
    const quoteTask = api<StockMarketQuoteResponse>(`${prefix}/quote`, {
      query: { symbol, ...(isHK ? {} : { source: requestedQuoteSource }) },
      signal: controller.signal,
    })
      .then((response) => {
        if (
          context !== generation ||
          stopped ||
          selected.value.symbol !== symbol ||
          quoteSource.value !== requestedQuoteSource
        )
          return;
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
    if (forceCandles || Date.now() - lastCandleRequest >= (isHK ? 60000 : 12000)) {
      lastCandleRequest = Date.now();
      loadingCandles.value = true;
      candleTask = api<StockMarketCandlesResponse>(`${prefix}/candles`, {
        query: {
          symbol,
          timeframe: tf,
          limit: 320,
          ...(isHK ? {} : { source: requestedCandleSource }),
        },
        signal: controller.signal,
      })
        .then((response) => {
          if (
            context !== generation ||
            stopped ||
            selected.value.symbol !== symbol ||
            timeframe.value !== tf ||
            candleSource.value !== requestedCandleSource
          )
            return;
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
    [botId, () => selected.value.symbol, timeframe, candleSource, quoteSource],
    ([id], previous) => {
      const backendChanged = previous?.[0] !== id;
      invalidate();
      quote.value = undefined;
      candles.value = undefined;
      quoteError.value = '';
      candlesError.value = '';
      lastCandleRequest = 0;
      if (backendChanged) {
        capabilityController?.abort();
        capabilities.value = undefined;
        capabilityError.value = '';
        sourceNotice.value = '';
        searchResults.value = [];
        searchError.value = '';
        if (id) {
          void search('');
          void loadCapabilities();
        }
      }
      if (id) void refresh();
    },
    { immediate: true },
  );
  watch(autoRefresh, (enabled) => {
    if (enabled) void refresh();
    else clearTimer();
  });
  onScopeDispose(() => {
    stopped = true;
    capabilityController?.abort();
    invalidate();
  });

  return {
    selected,
    timeframe,
    candleSource,
    quoteSource,
    candleSourceOptions,
    quoteSourceOptions,
    availableTimeframes,
    capabilityError,
    sourceNotice,
    setCandleSource,
    setTimeframe,
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
