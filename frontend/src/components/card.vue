<template>
    <router-link :to="{name: item.title?'movie':'series', params: {name: item.title || item.name, id: item.id}}">
        <div class="card-container">
            <img class="card-image" :src="`${configuration.images.secure_base_url}${configuration.images.imageSizes.w300}${item.poster_path}`" />
            <div class="bottom-info">
                <div class="rating">
                    {{item.vote_average}}
                </div>
            </div>
        </div>
    </router-link>
</template>

<script lang="ts">
import { configuration } from '@/constants/tmdb'
export default {
    props: {
        item: Object,
    },
    data() {
        return {
            configuration,
        }
    },
    created() {
    }
}
</script>

<style scoped lang="scss">
.card-container {
    position: relative;
    .card-image {
        width: 100%;
        height: 100%;
        object-fit: cover;
        &:hover {
            scale: 1.02;
        }
    }
    .bottom-info {
        display: none;
        position: absolute;
        height: 2rem;
        bottom: 0;
        width: 100%;
        border-bottom-left-radius: 5px;
        border-bottom-right-radius: 5px;
        .rating {
            font-size: 1srem;
            color: white;
        }
    }
    &:hover {
        .bottom-info {
            display: block;
        }
    }
}
</style>