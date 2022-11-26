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
                        <font-awesome-icon :icon="['fas', 'up-right-from-square']" />
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
                    <img class="user-image" :src="scope.row.photoURL" alt="" />
                    <span class="ml-3">{{ scope.row.displayName }}</span>
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
import moment from 'moment';
import Vue from 'vue';

export default Vue.extend({
    name: 'home',
    data() {
        return {
            users: [],
            search: '',
            scope: {} as any,
        };
    },
    created() {
        // const usersRef = collection(db, "users");
        // getDocs(usersRef).then((snapshot) => {
        //     const users = [];
        //     snapshot.forEach((doc) => users.push(doc.data()));
        //     this.users = users;
        // });
    },
    computed: {
        filteredData() {
            return this.users.filter((user) => {
                return (
                    user.displayName.toLowerCase().includes(this.search.toLowerCase()) ||
                    user.email?.toLowerCase().includes(this.search.toLowerCase())
                );
            });
        },
    },
    methods: {
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
            if (row.metadata?.lastLoginAt) {
                return moment(parseInt(row.metadata?.lastLoginAt)).fromNow();
            } else {
                return '-';
            }
        },
        getCreatedAt(row) {
            if (row.metadata?.createdAt) {
                return moment(parseInt(row.metadata?.createdAt)).fromNow();
            } else {
                return '-';
            }
        },
    },
});
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
