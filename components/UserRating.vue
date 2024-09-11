<template>
    <div>
        <div class="flex items-center bg-neutral-800 rounded-full px-4 py-[6px] cursor-pointer">
            <div @click="likeClicked" class="flex items-center gap-2">
                <span class="material-symbols-outlined !text-[22px] md:!text-3xl"
                    :style="`font-variation-settings: 'FILL' ${liked?1:0};`">thumb_up</span>
                <!-- {{  itemLikes }} -->
            </div>
            <div class="border-r-2 border-neutral-600 h-5 mx-5"></div>
            <div @click="dislikeClicked" class="flex items-center gap-2">
                <span class="material-symbols-outlined !text-[22px] md:!text-3xl"
                    :style="`font-variation-settings: 'FILL' ${disliked?1:0};`">thumb_down</span>
                <!-- {{  itemDislikes }} -->
            </div>
        </div>
        <!-- <div class="mt-2 mx-3">
            <v-progress-linear :model-value="likeRatio" bg-opacity="0.25" rounded rounded-bar></v-progress-linear>
        </div> -->
    </div>
</template>

<script setup lang="ts">
const props = defineProps<{
    itemId: number,
    itemType: string
}>()
const itemLikes = ref(0)
const itemDislikes = ref(0)
const liked = ref(false)
const disliked = ref(false)

const headers = useRequestHeaders(['cookie']) as HeadersInit
const likeRatio = computed(() => {
    return itemLikes.value / (itemLikes.value + itemDislikes.value) * 100
})

onMounted(() => {
    getUserRating();
});

const addUserRating = (rating: number) => {
    $fetch(`/api/user/ratings`,
        {
            headers,
            method: 'POST',
            body: JSON.stringify({
                itemId: props.itemId,
                itemType: props.itemType,
                rating,
            })
        }
    );
    if (rating === 1) {
        liked.value = true;
        disliked.value = false;
    } else {
        liked.value = false;
        disliked.value = true;
    }
}
const removeUserRating = () => {
    $fetch(`/api/user/ratings`,
        {
            headers,
            method: 'DELETE',
            body: JSON.stringify({
                itemId: props.itemId,
                itemType: props.itemType,
            })
        }
    );
    liked.value = false;
    disliked.value = false;
}
const getUserRating = async () => {
    const userRating: any = await $fetch(`/api/user/ratings/userItemRating?itemType=${props.itemType}&itemId=${props.itemId}`, { headers });
    liked.value = userRating?.rating === 1;
    disliked.value = userRating?.rating === -1;
}
const dislikeClicked = () => {
    if (disliked.value) {
        removeUserRating();
        return;
    }
    addUserRating(-1);
}
const likeClicked = () => {
    if (liked.value) {
        removeUserRating();
        return;
    }
    addUserRating(1);
}
</script>
