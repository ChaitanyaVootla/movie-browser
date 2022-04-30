<template>
    <div>
        <el-drawer title="Filters" :visible.sync="showDrawer">
            <div style="padding-left: 2em">
                <el-row>
                    <el-col :span="12">
                        <h5>Movie genres</h5>
                        <el-select
                            v-model="selectedMovieGenres"
                            multiple
                            filterable
                            :collapse-tags="true"
                            placeholder="Genres"
                            :no-match-text="'No Results'"
                            value-key="id"
                            class="full-width"
                            clearable
                            @change="updateStore()"
                        >
                            <el-option v-for="item in movieGenres" :key="item.id" :label="item.name" :value="item">
                            </el-option>
                        </el-select>
                    </el-col>
                    <el-col :span="12">
                        <h5>Series genres</h5>
                        <el-select
                            v-model="selectedSeriesGenres"
                            multiple
                            filterable
                            :collapse-tags="true"
                            placeholder="Genres"
                            :no-match-text="'No Results'"
                            value-key="id"
                            class="full-width"
                            clearable
                            @change="updateStore()"
                        >
                            <el-option v-for="item in seriesGenres" :key="item.id" :label="item.name" :value="item">
                            </el-option>
                        </el-select>
                    </el-col>
                </el-row>
                <div style="margin-top: 2em"></div>
            </div>
        </el-drawer>
    </div>
</template>

<script lang="ts">
export default {
    name: 'SideDrawer',
    props: ['movieGenres', 'seriesGenres', 'showDrawer'],
    data() {
        return {
            selectedMovieGenres: [] as any[],
            selectedSeriesGenres: [] as any[],
            showDrawer: false,
        };
    },
    created() {},
    computed: {},
    methods: {
        openDrawer() {
            this.showDrawer = true;
        },
        updateStore() {
            this.$store.dispatch('updateSideBarFilters', {
                movieGenres: this.selectedMovieGenres,
                seriesGenres: this.selectedSeriesGenres,
            });
        },
    },
};
</script>
