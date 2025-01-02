<template>
  <VitePwaManifest />
  <NuxtLayout>
    <v-app>
      <NavBar/>
      <NuxtPage :page-key="route => route.path" class="mb-10" :class="$vuetify.display.mobile?'pb-10':''" />
      <div class="h-4 absolute bottom-0 w-full">
        <div class="flex flex-wrap max-md:gap-2 md:gap-10 text-sm justify-center md:py-3 w-full bg-neutral-900
          text-neutral-400 max-md:pt-2 max-md:pb-14">
          <div class="flex items-baseline">
            Created by
            <NuxtLink href="https://vootlachaitanya.com" noreferrer noopener target="_blank"
              class="ml-2 underline underline-offset-4">
              Chaitanya Vootla
            </NuxtLink>
          </div>
          <div class="flex items-baseline">
            Github Repo
            <v-btn prepend-icon="mdi-github" href="https://github.com/ChaitanyaVootla/movie-browser"
              noreferrer noopener target="_blank" size="x-small" class="ml-2" color="#222" :elevation="10">
              ChaitanyaVootla/movie-browser
            </v-btn>
          </div>
          <div class="flex items-baseline">
            Powered by
            <NuxtLink href="https://developer.themoviedb.org/reference/intro/getting-started" noreferrer noopener target="_blank">
              <NuxtImg src="images/tmdb.svg" class="ml-2" height="100" width="80" alt="Powered by TMDB"></NuxtImg>
            </NuxtLink>
          </div>
          <div class="flex items-baseline">
            Built with <NuxtImg src="images/nuxt.svg" class="ml-2" height="100" width="60" alt="Build with Nuxt"></NuxtImg>
          </div>
          <div class="flex items-baseline cursor-pointer" @click="installPwa">
            Install App
          </div>
        </div>
      </div>
    </v-app>
  </NuxtLayout>
</template>

<script setup lang="ts">
import Clarity from '@microsoft/clarity';
useHead({
  link: [
    {
      rel: 'preconnect',
      href: 'https://fonts.googleapis.com'
    },
    {
      rel: 'preconnect',
      href: 'https://fonts.gstatic.com',
      crossorigin: 'anonymous'
    },
    {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100,0..1'
    }
  ]
})
Clarity.init('oxwvg2abnk');
const { $pwa } = useNuxtApp();

const installPwa = () => {
  $pwa.install();
};
</script>

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
.v-overlay {
  position: fixed;
}
</style>
