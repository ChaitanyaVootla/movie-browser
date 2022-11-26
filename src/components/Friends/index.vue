<template>
    <div>
        <div @click="showAddFriendDialog = true" class="add-friend">
            <font-awesome-icon :icon="['fas', 'user-plus']" class="mr-2 cursor-pointer" />
        </div>
        <div class="main-container" v-loading="isLoading"> {{ friends.length }} friends </div>
        <div v-for="user in friends" :key="user.photoURL" class="pt-3 pl-5 ml-4 pr-5">
            <img :src="user.photoURL" class="user-photo" /> {{ user.displayName }}
        </div>

        <el-dialog title="Add Friend" :visible.sync="showAddFriendDialog">
            <el-input placeholder="Name" v-model="friendSearch">
                <el-button slot="append" icon="el-icon-search"></el-button>
            </el-input>
            <div v-for="user in filteredUsers" :key="user.photoURL" class="pt-3 pl-5 pr-5">
                <img :src="user.photoURL" class="user-photo" /> {{ user.displayName }}
                <el-button @click="addFriend(user)" class="add-friend-btn">
                    <font-awesome-icon :icon="['fas', 'user-plus']" class="mr-2 cursor-pointer" />Add Friend
                </el-button>
            </div>
            <span slot="footer" class="dialog-footer"> </span>
        </el-dialog>
    </div>
</template>

<script lang="ts">
import Vue from 'vue';

export default Vue.extend({
    name: 'friends',
    data: function () {
        return {
            users: [] as any[],
            isLoading: true,
            showAddFriendDialog: false,
            friendSearch: '',
        };
    },
    created() {
        this.getUsers();
    },
    computed: {
        filteredUsers() {
            if (!this.friendSearch.length) {
                return [];
            }
            return this.users
                .filter(({ displayName }) => displayName.toLowerCase().includes(this.friendSearch))
                .filter(({ id }) => !this.friendsIds.includes(id))
                .filter(({ id }) => id !== this.user.uid);
        },
        user() {
            return this.$store.getters.user;
        },
        friends() {
            return this.$store.getters.friends;
        },
        friendsIds() {
            return this.$store.getters.friends.map(({ id }) => id);
        },
    },
    methods: {
        async getUsers() {
            // const usersDocs = await db.collection('users').get();
            // this.users = usersDocs.docs
            //     .map((doc) => {
            //         const data = doc.data();
            //         return {
            //             ...data,
            //             id: doc.id,
            //         };
            //     })
            //     .filter(Boolean);
            // this.isLoading = false;
        },
        async addFriend(user) {
            // await db.collection('users').doc(this.user.uid).collection('friends').doc(user.id).set(user);
        },
    },
});
</script>

<style lang="less" scoped>
@import '../../Assets/Styles/main.less';

.user-photo {
    height: 3em;
    border-radius: @default-radius;
}
.main-container {
    min-height: 100%;
    padding-left: 4rem;
    padding-top: 4rem;
}
.add-friend {
    position: absolute;
    right: 3.5rem;
    top: 2rem;
}
.add-friend-btn {
    float: right;
}
</style>
