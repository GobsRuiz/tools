import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  ssr: false,

  devServer: {
    port: 3010,
  },

  modules: [
    'shadcn-nuxt',
    '@pinia/nuxt',
    '@nuxt/fonts',
    '@vee-validate/nuxt',
    'vue-sonner/nuxt',
  ],

  css: ['~/assets/css/tailwind.css'],

  vite: {
    plugins: [tailwindcss()],
  },

  shadcn: {
    prefix: '',
    componentDir: '~/components/ui',
  },

  components: [
    {
      path: '~/components',
      pathPrefix: false,
      ignore: ['~/components/ui/**'],
    },
  ],

  fonts: {
    providers: {
      fontshare: false,
    },
    families: [
      { name: 'Inter', provider: 'google' },
    ],
  },

  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:3011',
    },
  },
})
