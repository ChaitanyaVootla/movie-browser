import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'
import { createVuetify, type ThemeDefinition } from 'vuetify'
import { md3 } from 'vuetify/blueprints'

const movieBrowserTheme: ThemeDefinition = {
  dark: true,
  colors: {
    background: '#000',
    surface: '#333',
    primary: '#dcdcdc',
    secondary: '#03DAC6',
    error: '#B00020',
    info: '#2196F3',
    success: '#4CAF50',
    warning: '#FB8C00',
  },
}

export default defineNuxtPlugin((app) => {
  const vuetify = createVuetify({
    blueprint: md3,
    theme: {
      defaultTheme: 'movieBrowserTheme',
      themes: {
        movieBrowserTheme,
      }
    },
  })
  app.vueApp.use(vuetify)
})
