export const useChartConfigStore = defineStore(
  'chartConfig',
  () => {
    const market = ref<'crypto' | 'ashare' | 'hkshare'>('crypto');
    const strategy = ref<string>('');
    const useLiveData = ref<boolean>(false);
    const selectedTimeframe = ref<string>('1h');
    const timerange = ref<string>('');

    return {
      market,
      strategy,
      useLiveData,
      selectedTimeframe,
      timerange,
    };
  },
  {
    persist: {
      key: 'ftUIChartSettings',
      pick: ['useLiveData', 'market'],
    },
  },
);

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useChartConfigStore, import.meta.hot));
}
