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
      titleTemplate: '%s - Movie Browser',
      meta: [
        { name: 'yandex-verification', content: '0fae8749627beb1f' },
        { name: 'robots', content: 'index, follow' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { property: 'og:site_name', content: 'The Movie Browser' },
        { property: 'og:type', content: 'website' },
        { name: 'twitter:site', content: '@movie-browser' },
        { name: 'twitter:creator', content: '@ChaitanyaVootla' },
        { name: 'theme-color', content: '#000000' },
      ],
      link: [
        { rel: 'preconnect', href: 'https://image.tmdb.org' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'dns-prefetch', href: 'https://api.themoviedb.org' },
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

  // Enhanced SSR configuration
  ssr: true,
  
  // Disable prerendering for Windows compatibility
  nitro: {
    compressPublicAssets: true,
    minify: true,
    prerender: {
      routes: [],
    },
  },
  
  // Image optimization for better LCP
  image: {
    format: ['webp', 'avif'],
    quality: 80,
    densities: [1, 2],
  },
  
  routeRules: {
    // API routes with caching
    '/api/youtube/(.*)': { cors: true, cache: { maxAge: 60 * 60 * 24 * 4 } },
    '/api/search/(.*)': { cors: true, swr: 60 * 60 * 12 },
    '/api/watchProviders/(.*)': { cors: true, cache: { maxAge: 60 * 60 * 24 * 4 } },
    '/api/person/(.*)': { cors: true, cache: { maxAge: 60 * 60 * 12 } },
    '/api/trending/(.*)': { cors: true, cache: { maxAge: 60 * 60 * 6 } },
    
    // Static asset caching
    '/images/(.*)': {
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    },
    
    // SEO-optimized pages with caching (ISR removed for Windows compatibility)
    '/': { headers: { 'cache-control': 's-maxage=3600' } }, // Homepage caching
    '/movie/**': { headers: { 'cache-control': 's-maxage=86400' } }, // Movie pages cache 24h
    '/series/**': { headers: { 'cache-control': 's-maxage=86400' } }, // Series pages cache 24h
    '/person/**': { headers: { 'cache-control': 's-maxage=604800' } }, // Person pages cache 7 days
    
    // Static pages that rarely change
    '/topics/**': { headers: { 'cache-control': 's-maxage=43200' } }, // Topic pages cache 12h
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

  compatibilityDate: "2025-01-03",
})