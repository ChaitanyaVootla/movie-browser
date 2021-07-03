<template>
  <div>
    <div class="search-item" v-for="result in searchResults" :key="result.id" v-on:click="goToResultPage(result)">
      <img
        v-lazy="{
          src: imageBasePath + (result.poster_path || result.profile_path),
          error: require('../../Assets/Images/error.svg'),
          loading: require('../../Assets/Images/loader-bars.svg'),
        }"
        class="search-image">
      <div class="search-info-container ml-3">
        <span>
          {{result.title || result.name || result.original_name || result.original_title}}
          <span class="text-muted ml-1" style="font-size: 0.9em;" v-if="result.release_date || result.first_air_date">
            {{getYear(result.release_date || result.first_air_date)}} - {{result.media_type}}
          </span>
        </span>
        <div style="margin-top: -5px;">
          <span v-for="(genreId, index) in result.genre_ids" :key="genreId" class="text-muted ml-1" style="font-size: 0.9em;">
            {{getGenreNameFromId(genreId)}}{{index === result.genre_ids.length -1?'':','}}
          </span>
        </div>
        <div class="mt-3">
          <div class="rating-info" :style="`border-color: ${getRatingColor(result.vote_average)}; color: ${getRatingColor(result.vote_average)}`">
            {{result.vote_average?result.vote_average:'-'}}
          </div>
        </div>
        <div v-if="result.media_type==='person'" class="mt-4">
          {{result.known_for_department}}<br/>
          <div class="text-muted" style="font-size: 0.9em;">
            <span v-for="(content, index) in result.known_for" :key="index">
              {{content.original_title || content.original_name}},
            </span>
          </div>
        </div>
        <div class="word-wrap mt-2 mobile-hide">
          {{result.overview}}
        </div>
      </div>
      <hr/>
    </div>
  </div>
</template>

<script lang="ts">
  import { getRatingColor, getYear, sanitizeName } from '../../Common/utils';

  export default {
    name: 'searchResults',
    props: [
      'searchResults',
      'getGenreNameFromId',
      'imageBasePath',
      'searchItemClicked',
    ],
    data() {
      return {
        getRatingColor,
        getYear,
      };
    },
    created() {
    },
    methods: {
      goToResultPage(result: any) {
        if (result.media_type === 'movie') {
          this.$router.push({
            name: 'movieInfoFull',
            params: {
              name: sanitizeName(result.name || result.original_title),
              id: result.id,
            }
          }).catch(err => {});
        } else if (result.media_type === 'tv') {
          this.$router.push({
            name: 'seriesInfo',
            params: {
              name: sanitizeName(result.name),
              id: result.id,
            }
          }).catch(err => {});
        } else if (result.media_type === 'person') {
          this.$router.push({
            name: 'person',
            params: {
              name: sanitizeName(result.name),
              id: result.id,
            },
          }).catch(err => {
            console.log(err);
          });
        }
        this.searchItemClicked();
      }
    },
  }
</script>

<style scoped lang="less">
  .search-item {
    display: flex;
    margin-bottom: 0.5em;
    padding-bottom: 0.5em;
    cursor: pointer;
    border-bottom: solid 1px #252525;
    line-height: 24px !important;
  }
  .search-image[lazy=error] {
    background-size: 4em;
    padding: 2em;
    width: 7em;
  }
  .search-image[lazy=loading] {
    background-size: contain;
    padding: 2em;
    width: 7em;
  }
  .rating-info {
    font-size: 0.9em;
    width: 2.3em;
  }
  .search-image {
    height: 10em;
    border-radius: 3px;
  }
  .search-item:last-child {
    border-bottom: 0;
  }
  .search-item:hover {
    background: rgb(8, 8, 8);
  }
  .search-info-container {
    display: flex;
    flex-direction: column;
  }
  .word-wrap {
    white-space: initial;
    word-break: break-word;
    font-size: 0.8em;
    overflow: hidden;
    max-height: 4em;
  }
</style>
