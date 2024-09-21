<template>
  <v-menu v-model="isOpen" :close-on-content-click="false">
    <template v-slot:activator="{ props }">
      <v-btn v-bind="props" class="text-none" color="#222">
        {{ selectedCountry.code }}
        <v-img 
          :src="`https://flagcdn.com/${selectedCountry.code.toLowerCase()}.svg`"
          :alt="`Flag of ${selectedCountry.name}`"
          class="w-6 rounded-sm ml-2"
        ></v-img>
      </v-btn>
    </template>
    <v-card min-width="300">
      <v-card-text>
        <v-text-field
          v-model="search"
          label="Search countries"
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          focused
          hide-details
        ></v-text-field>
      </v-card-text>
      <v-list height="300" class="overflow-y-auto">
        <v-list-item
          v-for="country in filteredCountries"
          :key="country"
          @click="selectCountry(country)"
        >
          <v-list-item-title>
            {{ country }}
            <v-img 
              :src="`https://flagcdn.com/${getCode(country)?.toLowerCase()}.svg`"
              :alt="`Flag of ${country}`"
              width="24"
              class="ml-2 d-inline-block"
            ></v-img>
          </v-list-item-title>
        </v-list-item>
      </v-list>
    </v-card>
  </v-menu>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { getCode, getName, getNames } from 'country-list'

interface Country {
  code: string;
  name: string;
}

const props = withDefaults(defineProps<{
  modelValue?: string;
}>(), {
  modelValue: 'US'
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const isOpen = ref(false)
const search = ref('')
const selectedCountry = ref<Country>({ code: props.modelValue, name: getName(props.modelValue) || 'Unknown' })
const countries = getNames()

const filteredCountries = computed(() => {
  if (!search.value) return countries;
  const searchLower = search.value.toLowerCase()
  return countries.filter(country => country.toLowerCase().includes(searchLower))
})

const selectCountry = (country: string) => {
    selectedCountry.value = {
        code: getCode(country) || 'Unknown',
        name: country
    }
    emit('update:modelValue', selectedCountry.value.code)
    isOpen.value = false
}
</script>