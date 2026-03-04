<template>
  <SidebarProvider>
    <AppSidebar />
    <SidebarInset>
      <header class="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4">
        <div class="flex items-center gap-2">
          <SidebarTrigger class="-ml-1 md:hidden" />
          <Separator orientation="vertical" class="mr-2 h-4" />
          <span class="text-sm font-medium text-muted-foreground">Financeiro</span>
        </div>
        <div class="flex items-center gap-3">
          <div class="w-[clamp(180px,45vw,520px)]">
            <GlobalSearch />
          </div>
          <AlertsBell />
        </div>
      </header>
      <main class="flex-1 overflow-auto p-6">
        <slot />
      </main>
    </SidebarInset>
  </SidebarProvider>
</template>
