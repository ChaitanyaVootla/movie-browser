<template>
    <div class="px-3 md:px-0">
        <div class="top-action flex justify-center mt-5">
            <v-btn-toggle v-model="selectedType" mandatory density="compact">
                <v-btn>
                    Movies
                </v-btn>
                <v-btn>
                    Series
                </v-btn>
            </v-btn-toggle>
        </div>
    </div>
</template>

<script setup lang="ts">
const selectedType = ref(0);
</script>

<style scoped lang="less">
</style>
