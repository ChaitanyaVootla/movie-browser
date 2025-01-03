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
      meta: [
        { name: 'yandex-verification', content: '0fae8749627beb1f' },
      ],
    },
  },

  css: ['~/assets/css/main.css'],

  googleFonts: {
    families: {
      Montserrat: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    },
    preload: true,
  },

  modules: [
    '@pinia/nuxt',
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

  pwa: {
    strategies: 'injectManifest',
    srcDir: 'service-worker',
    filename: 'sw.ts',
    registerType: 'autoUpdate',
    manifest: {
      name: 'Movie Browser',
      short_name: 'Movie Browser',
      description: 'Browse movies and series, watch trailers, get recommendations, and more!',
      display: 'standalone',
      theme_color: '#000',
      background_color: '#000',
      categories: ['entertainment'],
      icons: [
        {
          "src": "/images/android-chrome-192x192.png",
          "sizes":"192x192",
          "type":"image/png",
        },
        {
          "src": "/images/android-chrome-512x512.png",
          "sizes": "512x512",
          "type": "image/png"
        }
      ],
      screenshots: [
        {
          "src": "/images/site-wide.png",
          "sizes": "2477x1078",
          "type": "image/png",
          "form_factor": "wide",
          "label": "Movie content featuring Furiosa from Mad Max Franchise"
        },
        {
          "src": "/images/site-narrow.png",
          "sizes": "479x885",
          "type": "image/png",
          "form_factor": "narrow",
          "label": "Movie content featuring Furiosa from Mad Max Franchise"
        },
      ],
      shortcuts: [
        {
          "name": "Topics",
          "short_name": "Topics",
          "description": "Browse movies and series by topics",
          "url": "/topics",
          "icons": [
            {
              "src": "/images/android-chrome-192x192.png",
              "sizes": "192x192"
            }
          ]
        }
      ]
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
    },
    injectManifest: {
      globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
    },
    client: {
      installPrompt: true,
      periodicSyncForUpdates: 3600,
    },
    devOptions: {
      enabled: true,
      suppressWarnings: true,
      navigateFallback: '/',
      navigateFallbackAllowlist: [/^\/$/],
      type: 'module',
    },
  },

  auth: {
    provider: {
      type: 'authjs'
    }
  },

  routeRules: {
    '/api/youtube/(.*)': { cors: true, cache: { maxAge: 60 * 60 * 24 * 4 } },
    '/api/search/(.*)': { cors: true, swr: 60 * 60 * 12 },
    '/api/watchProviders/(.*)': { cors: true, cache: { maxAge: 60 * 60 * 24 * 4 } },
    '/api/person/(.*)': { cors: true, cache: { maxAge: 60 * 60 * 12 } },
    '/api/trending/trendingTmdb': { cors: true, cache: { maxAge: 60 * 60 * 6 } },
    '/images/(.*)': {
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    },
  },

  gtag: {
    id: 'G-KDSZYVPEVZ',
    config: {
      anonymize_ip: true,
      allow_google_signals: false,
      send_page_view: true,
    },
  },

  vite: {
    vue: {
      template: {
        transformAssetUrls,
      },
    },
  },

  compatibilityDate: "2025-01-03",
})