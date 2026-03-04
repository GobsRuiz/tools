<script setup lang="ts">
useHead({
  htmlAttrs: { class: 'dark' },
})
</script>

<template>
  <div>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <Toaster position="bottom-center" />
  </div>
</template>
