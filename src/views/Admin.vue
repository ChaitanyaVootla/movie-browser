<template>
    <div class="main-container">
        <el-row class="mt-2 mb-4">
            <el-col :span="6">
                <el-input v-model="search" placeholder="Search" class="search-input" icon="el-icon-search"></el-input>
            </el-col>
            <el-col :span="6" class="ml-3">
                <div class="info-text"
                    ><b class="mr-2">{{ users.length }}</b> users in the system</div
                >
            </el-col>
            <el-col :span="10" class="ml-3" style="text-decoration: underline; text-align: right">
                <div class="info-text">
                    <a
                        href="https://search.google.com/search-console?resource_id=sc-domain%3Athemoviebrowser.com"
                        target="_blank"
                    >
                        Google search console
                    </a>
                </div>
            </el-col>
        </el-row>
        <el-table
            :data="filteredData"
            style="width: 100%"
            :default-sort="{ prop: 'lastLoggedIn', order: 'ascending' }"
            :border="true"
        >
            <el-table-column prop="displayName" label="User" sortable :fit="true">
                <template slot-scope="scope">
                    <img class="user-image" :src="scope.row.picture" alt="" />
                    <span class="ml-3">{{ scope.row.name }}</span>
                </template>
            </el-table-column>
            <el-table-column prop="lastLoggedIn" label="Last seen" sortable :sort-method="lastLoggedInSort" :fit="true">
                <template slot-scope="scope">
                    {{ getTime(scope.row.lastLoggedIn) }}
                </template>
            </el-table-column>
            <el-table-column prop="email" label="Email" sortable width="200"> </el-table-column>
            <el-table-column label="Last login" sortable :fit="true">
                <template slot-scope="scope">
                    {{ getLastLogin(scope.row) }}
                </template>
            </el-table-column>
            <el-table-column label="Created at" sortable :fit="true">
                <template slot-scope="scope">
                    {{ getCreatedAt(scope.row) }}
                </template>
            </el-table-column>
        </el-table>
    </div>
</template>

<script lang="ts">
import { api } from '@/API/api';
import moment from 'moment';

export default {
    name: 'home',
    data() {
        return {
            users: [],
            search: '',
            scope: {} as any,
        };
    },
    created() {
        this.getUsers();
    },
    computed: {
        filteredData() {
            return this.users.filter((user) => {
                return (
                    user.name.toLowerCase().includes(this.search.toLowerCase()) ||
                    user.email?.toLowerCase().includes(this.search.toLowerCase())
                );
            });
        },
    },
    methods: {
        async getUsers() {
            this.users = await api.getUsers();
        },
        getTime(time) {
            if (time) {
                return moment(time).fromNow();
            } else {
                return '-';
            }
        },
        lastLoggedInSort(a, b) {
            return moment(a.lastLoggedIn).isAfter(b.lastLoggedIn) ? 1 : -1;
        },
        getLastLogin(row) {
            if (row.updatedAt) {
                return moment(row.updatedAt).fromNow();
            } else {
                return '-';
            }
        },
        getCreatedAt(row) {
            if (row.createdAt) {
                return moment(row.createdAt).fromNow();
            } else {
                return '-';
            }
        },
    },
};
</script>

<style lang="less" scoped>
.main-container {
    padding: 2rem;
}
.user-image {
    width: 50px;
    height: 50px;
    border-radius: 50%;
}
.info-text {
    display: flex;
    align-items: center;
    line-height: 2.2rem;
}
</style>
