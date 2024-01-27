<template>
  <VitePwaManifest />
  <NuxtLayout>
    <v-app>
      <NavBar/>
      <NuxtPage :page-key="route => route.path" class="mb-10" :class="$vuetify.display.mobile?'pb-10':''" />
      <div class="h-4 absolute bottom-0 w-full">
        <div class="flex gap-10 text-sm justify-center py-3 w-full bg-neutral-900 text-neutral-400">
          <div class="flex items-baseline">
            Created by
            <NuxtLink href="https://vootlachaitanya.com" noreferrer noopener target="_blank"
              class="ml-2 underline underline-offset-4">
              Chaitanya Vootla
            </NuxtLink>
          </div>
          <div class="flex items-baseline">
            Github Repo
            <v-btn prepend-icon="mdi-github" href="https://github.com/ChaitanyaVootla/movie-browser/tree/nuxt"
              noreferrer noopener target="_blank" size="x-small" class="ml-2" color="#333">
              ChaitanyaVootla/movie-browser
            </v-btn>
          </div>
          <div class="flex items-baseline">
            Powered by
            <NuxtLink href="https://developer.themoviedb.org/reference/intro/getting-started" noreferrer noopener target="_blank">
              <NuxtImg src="images/tmdb.svg" class="h-3 ml-2"></NuxtImg>
            </NuxtLink>
          </div>
          <div class="flex items-baseline">
            Built with <NuxtImg src="images/nuxt.svg" class="h-4 ml-2"></NuxtImg>
          </div>
        </div>
      </div>
    </v-app>
  </NuxtLayout>
</template>

<style lang="less">
::-webkit-scrollbar {
  background: #222;
  box-shadow: inset 0 0 5px #363636;
  border-radius: 2px;
  width: 12px;
}
::-webkit-scrollbar-track {
  background: #0000008f;
}
::-webkit-scrollbar-thumb {
  background: #333;
  border-radius: 10px;
}
body {
  color: #f5f5f5 !important;
  :deep(.v-overlay__content) {
    height: 100%;
    width: 100%;
  }
  font-family: 'Montserrat', sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  word-spacing: 1px;
}
.v-snackbar__wrapper {
    bottom: 52px !important;
}
</style>
