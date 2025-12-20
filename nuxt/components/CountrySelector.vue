<template>
  <v-menu v-model="isOpen" :close-on-content-click="false" :aria-expanded="isOpen" aria-haspopup="menu">
    <template v-slot:activator="{ props }">
      <div v-bind="props" class="bg-neutral-800 px-3 py-2 flex items-center rounded-full cursor-pointer gap-2"
        role="button" aria-label="Select a country">
        <SeoImg
          :sources="flagSources"
          :alt="`Flag of ${selectedCountry.name}`"
          class="w-6 h-4 rounded-md"
        ></SeoImg>
        <div class="text-xs text-neutral-300">{{ selectedCountry.code }}</div>
      </div>
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
          aria-label="Search for countries by name"
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
  modelValue: 'IN'
})

const emit = defineEmits<(e: 'update:modelValue', value: string) => void>()

const isOpen = ref(false)
const search = ref('')
const selectedCountry = ref<Country>({ code: props.modelValue, name: getName(props.modelValue) || 'Unknown' })
const countries = getNames()

const flagSources = computed(() => {
  const code = selectedCountry.value.code.toLowerCase()
  return [
    `https://flagcdn.com/${code}.svg`,
    `https://flagcdn.com/w40/${code}.png`, // Fallback to PNG
  ].filter(Boolean)
})

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