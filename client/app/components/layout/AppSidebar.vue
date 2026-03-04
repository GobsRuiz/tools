<script setup lang="ts">
import {
  LayoutDashboard,
  ArrowLeftRight,
  Clock,
  Landmark,
  Settings,
  Wallet,
  CandlestickChart,
} from 'lucide-vue-next'

const route = useRoute()

const menuItems = [
  { label: 'Dashboard', icon: LayoutDashboard, to: '/' },
  { label: 'Movimentações', icon: ArrowLeftRight, to: '/movimentacoes' },
  { label: 'Investimentos', icon: CandlestickChart, to: '/investimentos' },
  { label: 'Pagamentos', icon: Clock, to: '/pagamentos' },
  { label: 'Contas', icon: Landmark, to: '/contas' },
  { label: 'Configurações', icon: Settings, to: '/settings' },
]

function isActive(to: string) {
  return route.path === to
}
</script>

<template>
  <div class="appSidebar">
    <Sidebar collapsible="icon">
      <SidebarHeader class="p-4">
        <div class="flex items-center gap-2">
          <SidebarMenuButton size="lg" as-child class="min-w-0 flex-1">
            <NuxtLink to="/">
              <div class="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Wallet class="size-4" />
              </div>
              <div class="grid flex-1 text-left text-sm leading-tight">
                <span class="truncate font-semibold">Financeiro</span>
                <span class="truncate text-xs text-muted-foreground">Controle pessoal</span>
              </div>
            </NuxtLink>
          </SidebarMenuButton>

          <SidebarTrigger class="h-8 w-8 shrink-0" />
        </div>
      </SidebarHeader>
  
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem v-for="item in menuItems" :key="item.to">
                <SidebarMenuButton
                  as-child
                  :data-active="isActive(item.to)"
                  :tooltip="item.label"
                >
                  <NuxtLink :to="item.to">
                    <component :is="item.icon" />
                    <span>{{ item.label }}</span>
                  </NuxtLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
  
      <SidebarFooter class="p-4">
        <p class="text-xs text-muted-foreground truncate">
          v1.0 — Local
        </p>
      </SidebarFooter>
  
      <SidebarRail />
    </Sidebar>
  </div>
</template>

<style>
.appSidebar div[data-slot="sidebar-header"]{
  height: 80px;
  padding: 16px 8px !important;
}

.appSidebar > div[data-state="collapsed"] div[data-slot="sidebar-header"] a div:first-child{
  width: 24px !important;
  height: 24px !important;
  margin-left: 4px;
}
</style>
