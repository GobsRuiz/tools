<script setup lang="ts">
import { CircleCheckIcon, OctagonXIcon, InfoIcon, TriangleAlertIcon } from 'lucide-vue-next'
import type { Component } from 'vue'

const props = defineProps<{
  title: string
  description?: string
  variant?: 'default' | 'destructive'
  icon?: Component
}>()

const iconMap: Record<string, Component> = {
  default: CircleCheckIcon,
  destructive: OctagonXIcon,
}

const resolvedIcon = computed(() => props.icon ?? iconMap[props.variant ?? 'default'])
</script>

<template>
  <Alert :variant="variant ?? 'default'" class="w-[360px]">
    <component :is="resolvedIcon" class="size-4" />
    <AlertTitle>{{ title }}</AlertTitle>
    <AlertDescription v-if="description">
      {{ description }}
    </AlertDescription>
  </Alert>
</template>
