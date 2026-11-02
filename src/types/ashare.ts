export interface AShareInstrument {
  symbol: string;
  name: string;
  exchange: 'SH' | 'SZ';
  kind: 'stock' | 'index' | 'etf';
}

export type AShareTimeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '1d' | '1w' | '1M';
export type AShareSource = 'auto' | 'tencent' | 'sina' | 'eastmoney';

export interface AShareCapabilities {
  timeframes: AShareTimeframe[];
  providers: {
    source: Exclude<AShareSource, 'auto'>;
    enabled: boolean;
    operations: string[];
    timeframes: AShareTimeframe[];
    reason: string | null;
  }[];
}

export interface AShareMeta {
  source: string;
  requested_source: AShareSource;
  fallback_used: boolean;
  volume_unit: string;
  volume_note: string | null;
  adjustment: 'raw';
  data_time: string | null;
  fetched_at: string;
  cached: boolean;
  stale: boolean;
  warning: string | null;
  session: string;
  timestamp_convention: string;
}

export interface AShareQuoteResponse {
  instrument: AShareInstrument;
  quote: {
    price: number | null;
    previous_close: number | null;
    open: number | null;
    high: number | null;
    low: number | null;
    change: number | null;
    change_percent: number | null;
    volume: number | null;
    amount: number | null;
  };
  meta: AShareMeta;
}

export interface AShareCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  complete: boolean;
}

export interface AShareCandlesResponse {
  instrument: AShareInstrument;
  timeframe: AShareTimeframe;
  candles: AShareCandle[];
  meta: AShareMeta;
  coverage_start: number;
  coverage_end: number;
  requested_count: number;
  complete: boolean;
}

export interface AShareSearchResponse {
  items: AShareInstrument[];
  source: string;
  cached: boolean;
  stale: boolean;
  warning: string | null;
}
