<script setup lang="ts">
const chartStore = useChartConfigStore();
</script>

<template>
  <div class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
    <div class="mx-3 mt-2 flex gap-1" role="group" aria-label="图表市场">
      <UButton
        :color="chartStore.market === 'crypto' ? 'primary' : 'neutral'"
        :aria-pressed="chartStore.market === 'crypto'"
        @click="chartStore.market = 'crypto'"
        >加密货币</UButton
      >
      <UButton
        :color="chartStore.market === 'ashare' ? 'primary' : 'neutral'"
        :aria-pressed="chartStore.market === 'ashare'"
        @click="chartStore.market = 'ashare'"
        >A 股</UButton
      >
      <UButton
        :color="chartStore.market === 'hkshare' ? 'primary' : 'neutral'"
        :aria-pressed="chartStore.market === 'hkshare'"
        @click="chartStore.market = 'hkshare'"
        >港股</UButton
      >
    </div>
    <AShareChartView
      v-if="chartStore.market === 'ashare' || chartStore.market === 'hkshare'"
      :key="chartStore.market"
      :market="chartStore.market"
      class="flex-1"
    />
    <ChartView v-else class="flex-1" />
  </div>
</template>
