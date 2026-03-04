<script setup lang="ts">
const props = withDefaults(defineProps<{
  open: boolean
  title?: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  loading?: boolean
}>(), {
  loading: false,
})

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

function onOpenChange(value: boolean) {
  if (props.loading) return
  if (!value) emit('cancel')
}
</script>

<template>
  <Dialog :open="open" @update:open="onOpenChange">
    <DialogContent :show-close-button="!loading">
      <DialogHeader>
        <DialogTitle>{{ title ?? 'Confirmar' }}</DialogTitle>
        <DialogDescription>
          {{ description ?? 'Tem certeza que deseja continuar?' }}
        </DialogDescription>
      </DialogHeader>
      <div class="flex justify-end gap-2 pt-4">
        <Button variant="outline" :disabled="loading" @click="emit('cancel')">
          {{ cancelLabel ?? 'Cancelar' }}
        </Button>
        <Button
          :variant="destructive ? 'destructive' : 'default'"
          :class="destructive ? 'bg-destructive!' : ''"
          :disabled="loading"
          @click="emit('confirm')"
        >
          <Spinner v-if="loading" class="h-4 w-4 mr-2" />
          {{ confirmLabel ?? 'Confirmar' }}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
