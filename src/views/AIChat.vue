<template>
    <div class="container mobile-hide">
        <div class="heading" @click="expandChat">
            Ask me for some movie recommendations
        </div>
        <div class="chat" ref="chat">
            <div class="textbox">
                <div class="message bot">
                    <div class="message-text">
                        <p>Hi, I'm the all powerful movie bot, let me help you find a movie, or else....</p>
                    </div>
                </div>
                <div v-for="message in messages" class="message" :class="message.sender">
                    <div class="message-text">
                        <div v-if="message.text.preText">
                            {{ message.text.preText }}
                            <br/>
                        </div>
                        <div class="movie-suggestions mt-4">
                            <MovieCard
                                v-for="movie in message.text.movieSuggestions"
                                :movie="movie"
                                :configuration="configuration"
                                :imageRes="'w500'"
                                :key="movie.id"
                            />
                        </div>
                        <div v-if="message.text.postText" class="mt-4">
                            {{ message.text.postText }}
                            <br/>
                        </div>
                    </div>
                </div>
                <div class="info" v-if="isAiProcessing">
                    <p>{{ responsePlaceholders[messageIndex] }}</p>
                </div>
            </div>
            <div class="input">
                <input type="text" placeholder="Type your message here..." @keyup.enter="askAI" v-model="userInput"
                    :disabled="isAiProcessing"/>
                <el-spinner v-if="isAiProcessing" size="small"></el-spinner>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import { api } from '@/API/api';
import MovieCard from '@/components/Common/movieCard.vue';
import { configuration } from '@/common/staticConfig';

export default {
    name: 'AIChat',
    data() {
        return {
            userInput: '',
            messages: [],
            isAiProcessing: false,
            currentThreadId: null,
            configuration,
            messageIndex: 0,
            responsePlaceholders: [
                "Sifting through the reels...",
                "Consulting the movie gurus...",
                "Cueing up the popcorn...",
                "Reeling in some suggestions...",
                "Scanning the film archives...",
                "Rolling out the red carpet...",
                "Fetching cinematic gems...",
                "Plotting the next scene...",
                "Diving into the film vault...",
                "Unspooling some choices...",
            ]
        }
    },
    components: {
        MovieCard,
    },
    methods: {
        expandChat() {
            const chat: any = this.$refs.chat;
            if (chat.style.height === '0px') {
                chat.style['min-height'] = '70vh';
                chat.style['height'] = '70vh';
            } else {
                chat.style.height = '0px';
                chat.style['min-height'] = '0px';
            }
        },
        async askAI() {
            if (this.isAiProcessing || !this.userInput?.length) {
                return;
            }
            this.messageIndex = Math.floor(Math.random() * this.responsePlaceholders.length);
            const userInput = this.userInput;
            this.messages.push({
                sender: 'user',
                text: {
                    preText: userInput
                }
            });
            this.isAiProcessing = true;
            this.userInput = '';
            const assistantResponse = await api.askAI(userInput, this.currentThreadId);
            if (!this.currentThreadId) {
                this.currentThreadId = assistantResponse.threadId;
            }
            // i want to watch some exciting less known movies in english
            this.messages.push({
                sender: 'bot', 
                text: assistantResponse.text
            });
            this.isAiProcessing = false;
            // scroll to bottom of chat
            const chat: any = this.$refs.chat;
            chat.scrollTop = chat.scrollHeight;
        }
    }
}
</script>

<style lang="less" scoped>
@import '../Assets/Styles/main.less';

.container {
    position: fixed;
    bottom: 0;
    right: 2rem;
    width: max(40rem, 40vw);
    z-index: 100000;
    .heading {
        font-size: 1.2rem;
        font-weight: 400;
        color: #fff;
        background: #181818;
        padding: 0.5rem 1rem;
        border-radius: 0.5rem 0.5rem 0 0;
        cursor: pointer;
        &:hover {
            background: #272727;
        }
    }

    .chat {
        background: #000;
        height: 0;
        border-radius: 0 0 0.5rem 0.5rem;
        display: flex;
        justify-content: space-between;
        flex-direction: column;
        .textbox {
            padding: 1rem;
            overflow-y: scroll;
            .info {
                font-style: italic;
                color: grey
            }
            .message {
                display: flex;
                flex-direction: row;
                justify-content: flex-start;
                align-items: flex-start;
                margin-bottom: 1rem;
                .message-text {
                    background: #161616;
                    padding: 0.5rem 1rem;
                    border-radius: 0.5rem;
                    color: #fff;
                    font-size: 0.9rem;
                    max-width: 80%;
                    .movie-suggestions {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 2rem;
                    }
                }
                &.bot {
                    .message-text {
                        background-color: #180c0c;
                    }
                }
                &.user {
                    justify-content: end;
                }
            }
        }
        .input {
            padding: 1rem;
            background: #161616;
            input {
                width: 100%;
                padding: 0.5rem 1rem;
                border-radius: 0.5rem;
                border: none;
                background: #000;
                color: #fff;
                font-size: 0.9rem;
                &:focus {
                    outline: none;
                }
            }
        }
    }
}
</style>
