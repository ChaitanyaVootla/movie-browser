<template>
    <div>
        <div class="title -mb-1 md:mb-1 md:ml-14">
            <slot name="title">
                <div class="text-sm md:text-xl font-medium flex justify-start items-center gap-1">
                    <v-icon v-if="titleIcon" :icon="titleIcon"></v-icon> <div class="leading-4">{{ title }}</div>
                </div>
            </slot>
        </div>
        <div class="flex w-full h-full">
            <div class="h-auto w-14 flex items-center justify-center cursor-pointer max-md:hidden group" v-on:click="slideLeft">
                <div>
                    <v-icon icon="mdi-chevron-left" color="#aaa"
                        class="group-hover:scale-125 group-hover:!text-white transition-all duration-200"></v-icon>
                </div>
            </div>
            <ClientOnly>
                <div :id="`scroll-bar-${uuid}`"></div>
            </ClientOnly>
            <div class="flex gap-2 md:gap-4 overflow-y-auto w-full slider">
                <div v-for="item in (items || Array(10))" :class="isSliding ? 'pointer-events-none' : ''">
                    <slot :item="item">
                        <IntLoader>
                            <PosterCard :item="item" :pending="pending" class="mr-2 md:pr-6"/>
                        </IntLoader>
                    </slot>
                </div>
            </div>
            <div class="h-auto w-14 flex items-center justify-center cursor-pointer max-md:hidden group" v-on:click="slideRight">
                <v-icon icon="mdi-chevron-right" color="#aaa"
                    class="group-hover:scale-125 group-hover:!text-white transition-all duration-200"></v-icon>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { uid } from '~/utils/uid';

const props = defineProps({
    items: {
        type: Object,
        required: true
    },
    title: {
        type: String,
        required: true
    },
    titleIcon: {
        type: String,
        required: false
    },
    pending: {
        type: Boolean,
        required: true
    }
});
const uuid = ref<any>(null);
let isSliding = ref(false);
const slideLeft = ref<any>(null);
const slideRight = ref<any>(null);

onMounted(() => {
    uuid.value = uid();
    setTimeout(() => {
        const slider: any = document.querySelector(`#scroll-bar-${uuid.value}+.slider`);

        if (slider) {
            let isDown = false;
            let startX: any;
            let scrollLeft: any;

            const startDragging = (e: any) => {
                isDown = true;
                startX = e.pageX - slider.offsetLeft;
                scrollLeft = slider.scrollLeft;
                e.preventDefault();
            };

            const stopDragging = () => {
                if (!isDown) return;
                isDown = false;
                isSliding.value = false;
            };

            const whileDragging = (e: any) => {
                if (!isDown) return;
                isSliding.value = true;
                const x = e.pageX - slider.offsetLeft;
                const walk = x - startX;

                requestAnimationFrame(() => {
                    slider.scrollLeft = scrollLeft - walk;
                });
                e.preventDefault();
            };

            slider.addEventListener('mousedown', startDragging);
            slider.addEventListener('mouseleave', stopDragging);
            slider.addEventListener('mouseup', stopDragging);
            slider.addEventListener('mousemove', whileDragging);

             slideLeft.value = () => {
                slider.classList.add('scroll-smooth');
                slider.scrollLeft -= slider.clientWidth;
                slider.classList.remove('scroll-smooth');
            };

            slideRight.value = () => {
                slider.classList.add('scroll-smooth');
                slider.scrollLeft += slider.clientWidth;
                slider.classList.remove('scroll-smooth');
            };
        }
    })
});
</script>

<style scoped lang="less">
::-webkit-scrollbar {
    display: none;
}
.scroller-container {
    display: flex;
}
</style>
