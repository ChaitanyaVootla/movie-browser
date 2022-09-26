const { defineConfig } = require('@vue/cli-service')
module.exports = defineConfig({
  pluginOptions: {
    quasar: {
      importStrategy: 'kebab',
      rtlSupport: false
    }
  },
  transpileDependencies: [
    'quasar'
  ],
  css: {
    loaderOptions: {
      sass: {
        data: `@import "@/css/quasar.variables.sass";`
      }
    }
  }
})
