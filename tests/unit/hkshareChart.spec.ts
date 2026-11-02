import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import type { EffectScope } from 'vue';
import type { StockMarketInstrument } from '@/types/stockMarket';

const { request, createApi } = vi.hoisted(() => ({ request: vi.fn(), createApi: vi.fn() }));
vi.mock('@/composables/api', () => ({
  useApi: createApi,
  isApiError: () => false,
}));
vi.mock('@/composables/loginInfo', () => ({ useLoginInfo: () => ({}) }));
import { useAShareChart } from '@/composables/useAShareChart';

const stock: StockMarketInstrument = {
  symbol: '00700' + '.HK',
  name: '腾讯控股',
  exchange: 'HK',
  kind: 'stock',
  currency: 'HKD',
};
const index: StockMarketInstrument = {
  symbol: 'HSI.HK',
  name: '恒生指数',
  exchange: 'HK',
  kind: 'index',
  currency: 'HKD',
};
const meta = { source: 'tencent', warning: null, stale: false };
const quote = (instrument = stock, price = 392.2) => ({ instrument, quote: { price }, meta });
const candles = (instrument = stock, timeframe = '1d') => ({
  instrument,
  timeframe,
  candles: [],
  meta,
});
const capabilities = {
  timeframes: ['1d', '1w', '1M'],
  providers: [
    {
      source: 'tencent',
      enabled: true,
      operations: ['quote', 'candles'],
      timeframes: ['1d', '1w', '1M'],
    },
  ],
};
const flush = async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
  await nextTick();
};

describe('Hong Kong Chart lifecycle', () => {
  let scope: EffectScope;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-02T03:45:00Z'));
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    scope = effectScope();
    request.mockReset();
    createApi.mockReset();
    createApi.mockReturnValue({ api: request });
    request.mockImplementation((path: string) =>
      Promise.resolve(
        path.endsWith('/search')
          ? { items: [], warning: null }
          : path.endsWith('/capabilities')
            ? capabilities
            : path.endsWith('/quote')
              ? quote()
              : candles(),
      ),
    );
  });

  afterEach(() => {
    scope.stop();
    vi.useRealTimers();
  });

  it('uses HK endpoints, Tencent only and the three verified periods', async () => {
    const model = scope.run(() => useAShareChart(ref('bot1'), 'hkshare'))!;
    await flush();
    expect(request.mock.calls.every(([path]) => path.startsWith('/hkshare/'))).toBe(true);
    expect(model.timeframe.value).toBe('1d');
    expect(model.selected.value.exchange).toBe('HK');
    expect(model.availableTimeframes.value.map((item) => item.value)).toEqual(['1d', '1w', '1M']);
    expect(model.candleSourceOptions.value.map((item) => item.value)).toEqual(['tencent']);
    expect(model.quoteSourceOptions.value.map((item) => item.value)).toEqual(['tencent']);
    expect(createApi.mock.calls[0]?.[2]).toEqual({ isolateMarketErrors: true });
    model.setTimeframe('1m');
    expect(model.timeframe.value).toBe('1d');
  });

  it('polls quotes at 11:45 HK time and refreshes long candles once per minute', async () => {
    const model = scope.run(() => useAShareChart(ref('bot1'), 'hkshare'))!;
    await flush();
    request.mockClear();
    await vi.advanceTimersByTimeAsync(5001);
    expect(request.mock.calls.filter(([path]) => path.endsWith('/quote'))).toHaveLength(1);
    expect(request.mock.calls.filter(([path]) => path.endsWith('/candles'))).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(55000);
    expect(request.mock.calls.filter(([path]) => path.endsWith('/candles'))).toHaveLength(1);
    model.autoRefresh.value = false;
    await flush();
    request.mockClear();
    await vi.advanceTimersByTimeAsync(65000);
    expect(request).not.toHaveBeenCalled();
  });

  it('retains successful data and shows an error when an update fails', async () => {
    const model = scope.run(() => useAShareChart(ref('bot1'), 'hkshare'))!;
    await flush();
    request.mockRejectedValue(new Error('offline'));
    await model.refresh();
    expect(model.quote.value?.quote.price).toBe(392.2);
    expect(model.candles.value?.instrument.exchange).toBe('HK');
    expect(model.quoteError.value).toContain('失败');
    expect(model.candlesError.value).toContain('失败');
  });

  it('aborts pending HK requests on market exit and ignores their late answers', async () => {
    const model = scope.run(() => useAShareChart(ref('bot1'), 'hkshare'))!;
    await flush();
    const signals: AbortSignal[] = [];
    const resolvers: ((data: unknown) => void)[] = [];
    request.mockImplementation((_path: string, options: { signal: AbortSignal }) => {
      signals.push(options.signal);
      return new Promise((resolve) => resolvers.push(resolve));
    });
    const pending = model.refresh();
    scope.stop();
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    resolvers.forEach((resolve) => resolve(quote(stock, 999)));
    await pending;
    expect(model.quote.value?.quote.price).toBe(392.2);
    request.mockClear();
    await vi.advanceTimersByTimeAsync(70000);
    expect(request).not.toHaveBeenCalled();
  });

  it('keeps a new market instance independent from the disposed one', async () => {
    const ashare = scope.run(() => useAShareChart(ref('bot1')))!;
    await flush();
    scope.stop();
    scope = effectScope();
    const hongKong = scope.run(() => useAShareChart(ref('bot1'), 'hkshare'))!;
    await flush();
    expect(ashare.timeframe.value).toBe('1m');
    expect(hongKong.timeframe.value).toBe('1d');
    expect(hongKong.candleSource.value).toBe('tencent');
    request.mockClear();
    await vi.advanceTimersByTimeAsync(5001);
    expect(request.mock.calls.every(([path]) => path.startsWith('/hkshare/'))).toBe(true);
  });

  it('rejects old symbol and period responses after rapid selection', async () => {
    const model = scope.run(() => useAShareChart(ref('bot1'), 'hkshare'))!;
    await flush();
    const oldResolvers: ((data: unknown) => void)[] = [];
    request.mockImplementation(
      (path: string, options: { query: { symbol: string; timeframe: string } }) => {
        if (options.query.symbol === stock.symbol)
          return new Promise((resolve) => oldResolvers.push(resolve));
        return Promise.resolve(
          path.endsWith('/quote')
            ? quote(index, 23393.32)
            : candles(index, options.query.timeframe),
        );
      },
    );
    const pending = model.refresh();
    model.selected.value = index;
    model.setTimeframe('1w');
    await flush();
    oldResolvers.forEach((resolve) => resolve(quote(stock, 999)));
    await pending;
    expect(model.selected.value.symbol).toBe('HSI.HK');
    expect(model.quote.value?.quote.price).toBe(23393.32);
    expect(model.candles.value?.timeframe).toBe('1w');
  });

  it('clears all old data and aborts requests when the backend connection changes', async () => {
    const id = ref('bot1');
    const model = scope.run(() => useAShareChart(id, 'hkshare'))!;
    await flush();
    let oldSignal: AbortSignal | undefined;
    request.mockImplementation((_path: string, options: { signal: AbortSignal }) => {
      oldSignal ??= options.signal;
      return new Promise(() => {});
    });
    void model.refresh();
    id.value = 'bot2';
    await flush();
    expect(oldSignal?.aborted).toBe(true);
    expect(model.quote.value).toBeUndefined();
    expect(model.candles.value).toBeUndefined();
  });

  it('does not revive outdated search results after the query is changed', async () => {
    const model = scope.run(() => useAShareChart(ref('bot1'), 'hkshare'))!;
    await flush();
    let resolveOld: (data: unknown) => void = () => {};
    request.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    const pending = model.search('腾讯');
    model.cancelSearch();
    resolveOld({ items: [stock] });
    await pending;
    expect(model.searchResults.value).toEqual([]);
  });
});
