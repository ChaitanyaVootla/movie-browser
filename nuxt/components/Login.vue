<template>
    <v-dialog 
        width="500" 
        v-model="isActive"
        :persistent="false"
        @click:outside="closeDialog"
        @keydown.esc="closeDialog"
        class="login-modal"
    >
        <v-card 
            title="Login"
            class="login-modal-card"
            rounded="lg"
            elevation="8"
        >
            <v-card-text class="text-center py-6">
                Please login to complete this action
            </v-card-text>
            <v-card-actions class="px-6 pb-6 justify-center">
                <div @click="signIn('google')" class="cursor-pointer transition-transform hover:scale-105" >
                    <NuxtImg src="/images/googleLogin/login.svg" class="h-12" />
                </div>
            </v-card-actions>
            <v-card-actions class="pt-0 pb-4 justify-center">
                <v-btn
                    variant="text"
                    color="grey"
                    @click="closeDialog"
                    class="text-sm"
                >
                    Not now
                </v-btn>
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

const closeDialog = () => {
    isActive.value = false;
};

defineExpose({
    openDialog,
});
</script>