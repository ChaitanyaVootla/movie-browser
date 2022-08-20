<template>
    <div class="main-container">
        <el-table
            :data="users"
            style="width: 100%"
            :default-sort = "{prop: 'lastLoggedIn', order: 'ascending'}"
            :border="true">
            <el-table-column
                prop="displayName"
                label="User"
                sortable
                :fit="true">
                <template slot-scope="scope">
                    <img class="user-image" :src="scope.row.photoURL" alt=""/>
                    <span class="ml-3">{{scope.row.displayName}}</span>
                </template>
            </el-table-column>
            <el-table-column
                prop="lastLoggedIn"
                label="Last seen"
                sortable
                :sort-method="lastLoggedInSort"
                :fit="true">
                <template slot-scope="scope">
                    {{getTime(scope.row.lastLoggedIn)}}
                </template>
            </el-table-column>
            <el-table-column
                prop="email"
                label="Email"
                sortable
                width="200">
            </el-table-column>
            <el-table-column
                label="Last login"
                sortable
                :fit="true">
                <template slot-scope="scope">
                    {{getLastLogin(scope.row)}}
                </template>
            </el-table-column>
            <el-table-column
                label="Created at"
                sortable
                :fit="true">
                <template slot-scope="scope">
                    {{getCreatedAt(scope.row)}}
                </template>
            </el-table-column>
        </el-table>
    </div>
</template>

<script lang="ts">
import moment from 'moment';
import {db,} from '@/Common/firebase';
import { collection, getDocs} from "firebase/firestore";

export default {
    name: 'home',
    data() {
        return {
            users: [],
        }
    },
    created() {
        const usersRef = collection(db, "users");
        getDocs(usersRef).then((snapshot) => {
            const users = [];
            snapshot.forEach((doc) => users.push(doc.data()));
            this.users = users;
        });
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
    }
}
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
</style>
