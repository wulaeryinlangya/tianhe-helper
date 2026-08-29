<script setup>
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { RadarChart } from 'echarts/charts'
import { TitleComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { calculateRadarData, RADAR_DIMENSIONS } from '../lib/profileSchema'

use([CanvasRenderer, RadarChart, TitleComponent, TooltipComponent, LegendComponent])

const props = defineProps({
  profile: Object
})

const option = computed(() => {
  const data = calculateRadarData(props.profile)

  return {
    title: {
      text: '企业画像多维分析',
      left: 'center',
      textStyle: { fontSize: 16, fontWeight: 'bold', color: '#1f2937' }
    },
    tooltip: {
      trigger: 'item'
    },
    radar: {
      indicator: RADAR_DIMENSIONS.map(d => ({ name: d.label, max: d.max })),
      shape: 'polygon',
      splitNumber: 4,
      axisName: {
        color: '#666',
        fontSize: 13
      },
      splitLine: {
        lineStyle: { color: '#e5e7eb' }
      },
      splitArea: {
        areaStyle: {
          color: ['rgba(102, 126, 234, 0.05)', 'rgba(102, 126, 234, 0.1)']
        }
      }
    },
    series: [{
      type: 'radar',
      data: [{
        value: data,
        name: '企业画像',
        areaStyle: {
          color: 'rgba(102, 126, 234, 0.3)'
        },
        lineStyle: {
          color: '#667eea',
          width: 2
        },
        itemStyle: {
          color: '#667eea'
        }
      }]
    }]
  }
})
</script>

<template>
  <div class="radar-chart-container">
    <VChart :option="option" :autoresize="true" style="height: 400px;" />
  </div>
</template>

<style scoped>
.radar-chart-container {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

@media (max-width: 640px) {
  .radar-chart-container {
    padding: 16px;
  }
}
</style>
