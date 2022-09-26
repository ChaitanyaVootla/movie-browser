<template>
    <landing :details="details"></landing>
</template>

<script lang="ts">
    import api from '@/api';
    import landing from '@/components/info/landing.vue'
    export default {
        components: {
            landing,
        },
        data() {
            return {
                details: {},
            }
        },
        created() {
            this.init();
        },
        methods: {
            async init() {
                this.details = await api.getSeriesDetails(this.$route.params.id);
            }
        }
    }
</script>

<style scoped lang="scss">
    
</style>
