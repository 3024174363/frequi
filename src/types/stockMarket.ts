import type {
  AShareInstrument,
  AShareMeta,
  AShareQuoteResponse,
  AShareCandlesResponse,
  AShareSearchResponse,
} from './ashare';

export type StockMarket = 'ashare' | 'hkshare';
export interface HKShareInstrument {
  symbol: string;
  name: string;
  exchange: 'HK';
  kind: 'stock' | 'index' | 'etf';
  currency: 'HKD';
}
export type StockMarketInstrument = AShareInstrument | HKShareInstrument;
export type StockMarketMeta = AShareMeta & { currency?: 'HKD'; timezone?: 'Asia/Hong_Kong' };
export type StockMarketQuoteResponse = Omit<AShareQuoteResponse, 'instrument' | 'meta'> & {
  instrument: StockMarketInstrument;
  meta: StockMarketMeta;
};
export type StockMarketCandlesResponse = Omit<AShareCandlesResponse, 'instrument' | 'meta'> & {
  instrument: StockMarketInstrument;
  meta: StockMarketMeta;
};
export type StockMarketSearchResponse = Omit<AShareSearchResponse, 'items'> & {
  items: StockMarketInstrument[];
};
