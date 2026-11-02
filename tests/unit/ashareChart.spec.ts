import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import type { EffectScope } from 'vue';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/composables/api', () => ({
  useApi: () => ({ api: request }),
  isApiError: () => false,
}));
vi.mock('@/composables/loginInfo', () => ({ useLoginInfo: () => ({}) }));
import { useAShareChart } from '@/composables/useAShareChart';

const stock = { symbol: '600519.SH', name: '贵州茅台', exchange: 'SH', kind: 'stock' } as const;
const index = { symbol: '000001.SH', name: '上证指数', exchange: 'SH', kind: 'index' } as const;
const meta = { source: 'tencent', warning: null, stale: false };
const quote = (instrument = stock, price = 10) => ({ instrument, quote: { price }, meta });
const candles = () => ({ instrument: stock, timeframe: '1m', candles: [], meta });
const flush = async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
  await nextTick();
};

describe('A-share request lifecycle', () => {
  let scope: EffectScope;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-02T05:41:00Z'));
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    scope = effectScope();
    request.mockReset();
    request.mockImplementation((path: string) =>
      Promise.resolve(
        path.endsWith('/search')
          ? { items: [], warning: null }
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

  it('keeps last data on refresh failure and stops all polling after disposal', async () => {
    const model = scope.run(() => useAShareChart(ref('bot1')))!;
    await flush();
    expect(model.quote.value?.quote.price).toBe(10);
    request.mockRejectedValue(new Error('offline'));
    await model.refresh();
    expect(model.quote.value?.quote.price).toBe(10);
    expect(model.quoteError.value).toContain('失败');
    scope.stop();
    request.mockClear();
    await vi.advanceTimersByTimeAsync(70000);
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects old responses when switching symbol rapidly', async () => {
    let resolveOld: (data: unknown) => void = () => {};
    request.mockImplementation((path: string, options: { query: { symbol: string } }) => {
      if (path.endsWith('/search')) return Promise.resolve({ items: [] });
      if (path.endsWith('/candles')) return Promise.resolve(candles());
      if (options.query.symbol === stock.symbol)
        return new Promise((resolve) => {
          resolveOld = resolve;
        });
      return Promise.resolve({ ...quote(), instrument: index, quote: { price: 3500 } });
    });
    const model = scope.run(() => useAShareChart(ref('bot1')))!;
    model.selected.value = index;
    await flush();
    expect(model.quote.value?.quote.price).toBe(3500);
    resolveOld(quote(stock, 99));
    await flush();
    expect(model.selected.value.symbol).toBe(index.symbol);
    expect(model.quote.value?.quote.price).toBe(3500);
  });

  it('aborts obsolete requests and clears previous backend data', async () => {
    const id = ref('bot1');
    const model = scope.run(() => useAShareChart(id))!;
    await flush();
    let signal: AbortSignal | undefined;
    request.mockImplementation((_path: string, options: { signal: AbortSignal }) => {
      signal = options.signal;
      return new Promise(() => {});
    });
    void model.refresh();
    const oldSignal = signal;
    id.value = 'bot2';
    expect(oldSignal?.aborted).toBe(true);
    expect(model.quote.value).toBeUndefined();
    expect(model.candles.value).toBeUndefined();
    scope.stop();
    expect(signal?.aborted).toBe(true);
  });

  it('does not overlap refresh cycles and respects automatic refresh toggle', async () => {
    const model = scope.run(() => useAShareChart(ref('bot1')))!;
    await flush();
    request.mockClear();
    await vi.advanceTimersByTimeAsync(5001);
    expect(request.mock.calls.filter(([path]) => path.endsWith('/quote'))).toHaveLength(1);
    model.autoRefresh.value = false;
    await nextTick();
    request.mockClear();
    await vi.advanceTimersByTimeAsync(20000);
    expect(request).not.toHaveBeenCalled();
    request.mockImplementation(() => new Promise(() => {}));
    void model.refresh();
    void model.refresh();
    expect(request).toHaveBeenCalledTimes(2); // one quote and one K-line request
  });

  it('ignores a search response after the query has changed', async () => {
    const model = scope.run(() => useAShareChart(ref('bot1')))!;
    await flush();
    let resolveOld: (data: unknown) => void = () => {};
    request.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    const pending = model.search('茅台');
    model.cancelSearch();
    resolveOld({ items: [stock], warning: null });
    await pending;
    expect(model.searchResults.value).toEqual([]);
  });
});
