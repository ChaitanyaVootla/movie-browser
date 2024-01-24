import vuetify, { transformAssetUrls } from 'vite-plugin-vuetify';

export default defineNuxtConfig({
  build: {
    transpile: ['vuetify'],
  },
  devtools: {
    enabled: true,

    timeline: {
      enabled: true
    }
  },
  experimental: {
    writeEarlyHints: false,
  },
  postcss: {
    plugins: {
      tailwindcss: {},
      autoprefixer: {},
    },
  },
  app: {
    head: {
      htmlAttrs: {
        lang: 'en',
      },
      titleTemplate: (titleChunk) => {
        return titleChunk ? `${titleChunk} - Movie Browser` : 'Movie Browser'
      },
    },
  },
  css: ['~/assets/css/main.css'],
  googleFonts: {
    families: {
      Montserrat: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    }
  },
  modules: [
    "@nuxtjs/google-fonts",
    "@vite-pwa/nuxt",
    "nuxt-gtag",
    "@nuxt/image",
    "nuxt-lodash",
    "@sidebase/nuxt-auth",
    (_options, nuxt) => {
      nuxt.hooks.hook('vite:extendConfig', (config) => {
        // @ts-expect-error
        config.plugins.push(vuetify({ autoImport: true }))
      })
    },
    'nuxt-time',
  ],
  // TODO add proper invalidation and offline support
  // pwa: {
  //   registerType: 'prompt',
  //   injectRegister: 'auto',
  //   workbox: {
  //     globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
  //   },
  //   client: {
  //     installPrompt: true,
  //   },
  //   strategies: 'generateSW',
  //   devOptions: {
  //     enabled: true,
  //     suppressWarnings: true,
  //     navigateFallbackAllowlist: [/^\/$/],
  //     type: 'module',
  //   },
  //   includeManifestIcons: true,
  // },
  auth: {
    provider: {
      type: 'authjs'
    }
  },
  routeRules: {
    // '/api/movie/**': { cors: true, swr:  60 * 60 * 12 },
    // '/api/series/**': { cors: true, swr:  60 * 60 * 12 },
    '/api/series/*/season/**': { cors: true, swr:  60 * 60 * 12 },
    '/api/search/**': { cors: true, swr:  60 * 60 * 12 },
    '/api/person/**': { cors: true, swr:  60 * 60 * 12 },
    '/api/trending/trendingTmdb': { cors: true, swr:  60 * 60 * 12 },
    '/images/**': {
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    },
  },
  gtag: {
    id: 'G-KDSZYVPEVZ'
  },
  vite: {
    vue: {
      template: {
        transformAssetUrls,
      },
    },
  },
})
