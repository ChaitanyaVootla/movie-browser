import vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'

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
      script: [
        {
          src: 'https://accounts.google.com/gsi/client',
        }
      ],
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
  auth: {
    provider: {
      type: 'authjs'
    }
  },
  routeRules: {
    // '/api/**': { swr: 60 * 60 * 24, cors: true },
    '/api/**': { cors: true, swr: true },
    '/images/**': {
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    },
  },
  vite: {
    vue: {
      template: {
        transformAssetUrls,
      },
    },
  },
})
