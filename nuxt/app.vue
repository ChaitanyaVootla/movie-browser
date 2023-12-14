<template>
  <NuxtLayout>
    <v-app>
      <NavBar/>
      <NuxtPage :page-key="route => route.fullPath" />
    </v-app>
  </NuxtLayout>
</template>

<style lang="less">
::-webkit-scrollbar {
  background: #222;
  box-shadow: inset 0 0 5px #363636;
  border-radius: 2px;
}
::-webkit-scrollbar-track {
  background: #0000008f;
}
::-webkit-scrollbar-thumb {
  background: #202020;
  border-radius: 10px;
}
body {
  color: #f5f5f5 !important;
  :deep(.v-overlay__content) {
    height: 100%;
    width: 100%;
  }
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans',
        'Helvetica Neue', sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
    word-spacing: 1px;
}
</style>
