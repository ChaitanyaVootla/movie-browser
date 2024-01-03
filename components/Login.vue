<template>
    <v-dialog width="500" v-model="isActive">
        <v-card title="Login">
            <v-card-text>
                Please login to complete this action
            </v-card-text>
            <v-card-actions class="h-20">
                <div @click="signIn('google')" class="cursor-pointer ml-2" >
                    <NuxtImg src="/images/googleLogin/login.svg" class="h-10" />
                </div>
                <v-spacer></v-spacer>
                <v-btn
                    variant="text"
                    text="Not yet"
                    @click="isActive = false"
                ></v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script setup lang="ts">
const isActive = ref(false);
const { signIn } = useAuth();

const openDialog = () => {
    isActive.value = true;
};

defineExpose({
    openDialog,
});
</script>