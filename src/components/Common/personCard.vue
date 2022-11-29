<template>
    <div>
        <router-link
            :to="{
                name: 'person',
                params: {
                    name: person.name,
                    id: person.id,
                },
            }"
        >
            <div class="person-item">
                <img v-lazy="imageObj" class="person-card-image shimmer-img" />
                <div class="info-container mt-1">
                    <div class="ml-1 person-name">{{ person.name }}</div>
                    <div class="ml-1 person-job text-muted">{{ person.character || person.job }}</div>
                </div>
            </div>
        </router-link>
    </div>
</template>

<script lang="ts">
export default {
    name: 'personCard',
    props: ['person', 'configuration', 'imageRes', 'selectPerson'],
    data() {
        return {
            imageObj: {
                src: this.configuration.images.secure_base_url + this.imageRes + this.person.profile_path,
            },
        };
    },
    methods: {
        getYear: function (movieDate: any) {
            return new Date(movieDate).getFullYear();
        },
    },
};
</script>

<style scoped lang="less">
@import '../../Assets/Styles/main.less';

.person-card-image[lazy='error'] {
    background-size: 2em;
    padding: 2.5em;
    width: 8em;
}
.person-card-image[lazy='loading'] {
    width: 8em;
}
.person-item {
    display: flex;
    flex-direction: column;
    padding: 0 0.3em;
    cursor: pointer;
    position: relative;
    transition: transform 0.2s;
}
.person-card-image {
    border-radius: 3px;
    height: 15em;
    background-size: cover;
    background-repeat: no-repeat;
    background-position: 50% 50%;
    transition: transform 0.2s;
    box-shadow: rgba(0, 0, 0, 0.5) 0px 3px 10px 0.2em;
}
.person-card-image:hover {
    transform: scale(1.05);
}
.ext-link-icon {
    color: #000;
}
.person-name {
    color: #ccc;
}
.person-job {
    font-size: 0.9em;
}
.info-container {
    max-width: 8em;
}
@media (max-width: 767px) {
    .info-container {
        font-size: 0.8em;
    }
}
</style>
