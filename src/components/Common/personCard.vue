<template>
    <div>
        <div class="person-item">
            <img v-lazy="imageObj" class="person-card-image" @click="selectPerson(person)">
            <div class="img-overlay">
                <a :href="`https://google.com/search?q=${person.name}`"
                    target="_blank" class="mr-3 pl-2 pr-2">
                    <font-awesome-icon :icon="['fab', 'google']" class="ext-link-icon"/>
                </a>
            </div>
            <div class="info-container mt-1">
                <div class="ml-1 person-name">{{person.name}}</div>
                <div class="ml-1 person-job text-muted">{{person.character || person.job}}</div>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
    export default {
        name: 'personCard',
        props: [
            'person',
            'configuration',
            'imageRes',
            'selectPerson',
        ],
        data() {
            return {
                imageObj: {
                    src: this.configuration.images.secure_base_url + this.imageRes + this.person.profile_path,
                }
            };
        },
        methods: {
            getYear: function(movieDate: any) {
                return new Date(movieDate).getFullYear();
            },
        }
    }
</script>

<style scoped>
    .person-card-image[lazy=error] {
        background-image: url('../../Assets/Images/error.svg');
        background-size: 2em;
        padding: 2.5em;
        width: 8em;
    }
    .person-card-image[lazy=loading] {
        background-image: url('../../Assets/Images/loader-bars.svg');
        background-size: contain;
        background-size: 4em;
        width: 8em;
    }
    .person-item {
        display: flex;
        flex-direction: column;
        padding: 0 0.3em;
        cursor: pointer;
        position: relative;
        transition: transform .2s;
    }
    .person-card-title {
        font-size: 1em;
        font-weight: 900;
        text-align: center;
    }
    .person-card-image {
        border-radius: 3px;
        height: 15em;
        background-size: cover;
        background-repeat: no-repeat;
        background-position: 50% 50%;
        transition: transform .2s;
        box-shadow: rgba(0, 0, 0, 0.5) 0px 3px 10px 0.2em;
    }
    .person-card-image:hover {
        transform: scale(1.05);
    }
    .img-overlay {
        position: absolute;
        width: 90%;
        opacity: 0;
        left: 0.5em;
        right: 1em;
        top: 9.3em;
        background: rgba(100, 100, 100, 0.6);
        padding: 0.2em;
        transition: 300ms;
    }
    .person-item:hover .img-overlay {
        opacity: 1;
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
</style>
