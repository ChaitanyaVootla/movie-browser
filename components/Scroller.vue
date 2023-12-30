<template>
    <div>
        <div class="title text-base md:text-lg font-light -mb-1 md:mb-0 md:ml-14">
            {{ title }}
        </div>
        <div class="flex w-full h-full">
            <div class="h-auto w-14 flex items-center justify-center cursor-pointer max-md:hidden" v-on:click="slideLeft">
                <div>
                    <v-icon icon="mdi-chevron-left" color="#aaa"></v-icon>
                </div>
            </div>
            <div class="flex gap-2 md:gap-4 overflow-y-auto w-full" :id="`scroll-bar-${uuid}`">
                <div v-for="item in (items || Array(10))" :class="isSliding ? 'pointer-events-none' : ''">
                    <slot :item="item">
                        <PosterCard :item="item" :pending="pending" class="mr-2 md:pr-6"/>
                    </slot>
                </div>
            </div>
            <div class="h-auto w-14 flex items-center justify-center cursor-pointer max-md:hidden" v-on:click="slideRight">
                <v-icon icon="mdi-chevron-right" color="#aaa"></v-icon>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { uid } from '~/utils/uid';

defineProps({
    items: {
        type: Object,
        required: true
    },
    title: {
        type: String,
        required: true
    },
    pending: {
        type: Boolean,
        required: true
    }
});
const identifier = uid();
const uuid = ref(identifier);
let isSliding = ref(false);

onMounted(() => {
    setTimeout(() => {
        const slider: any = document.querySelector(`#scroll-bar-${uuid.value}`);

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
        }
    })
});

const slideLeft = () => {
    const slider = document.querySelector(`#scroll-bar-${uuid.value}`) as HTMLElement;
    slider.classList.add('scroll-smooth');
    slider.scrollLeft -= slider.clientWidth;
    slider.classList.remove('scroll-smooth');
};

const slideRight = () => {
    const slider: any = document.querySelector(`#scroll-bar-${uuid.value}`);
    slider.classList.add('scroll-smooth');
    slider.scrollLeft += slider.clientWidth;
    slider.classList.remove('scroll-smooth');
};
</script>

<style scoped lang="less">
::-webkit-scrollbar {
    display: none;
}
.scroller-container {
    display: flex;
}
</style>
