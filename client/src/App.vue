<script setup lang="ts">
import { onMounted, ref } from 'vue';
const isDark = ref(false);
onMounted(() => {
    const userSelectedTheme = localStorage.getItem('theme');
    if (userSelectedTheme) {
        if (userSelectedTheme == 'dark') {
            isDark.value = true;
            toggleDarkTheme(true, false);
        } else if (userSelectedTheme == 'light') {
            isDark.value = false;
            toggleDarkTheme(false, false);
        }
        return;
    }
    const isSystemThemeDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (isSystemThemeDark) {
        isDark.value = true;
        toggleDarkTheme(true, false);
    } else {
        isDark.value = false;
        toggleDarkTheme(false, false);
    }
});
const toggleTheme = () => {
    if (isDark.value) {
        isDark.value = false;
        toggleDarkTheme(false, true);
    } else {
        isDark.value = true;
        toggleDarkTheme(true, true);
    }
};
const toggleDarkTheme = (toggleToDark: boolean, isUserSelected: boolean) => {
    if (toggleToDark === true) {
        isDark.value = true;
        document.getElementById('app')?.classList.add('dark')
        if (isUserSelected) {
            localStorage.setItem('theme', 'dark');
        }
    } else {
        isDark.value = false;
        document.getElementById('app')?.classList.remove('dark');
        if (isUserSelected) {
            localStorage.setItem('theme', 'light');
        }
    }
}
</script>

<template>
    <RouterView :toggleTheme="toggleTheme"/>
</template>

<style></style>
