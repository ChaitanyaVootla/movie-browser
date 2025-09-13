<template>
  <div 
    class="seo-img-container relative"
    :class="containerClass"
    :style="containerStyle"
  >
    <!-- Simple, modern image with native lazy loading -->
    <img
      v-if="imgSrc"
      :src="imgSrc"
      :alt="alt"
      :class="imgClass"
      :style="imgStyle"
      :loading="eager ? 'eager' : 'lazy'"
      :decoding="eager ? 'sync' : 'async'"
      @load="handleLoad"
      @error="handleError"
    />
    
    <!-- Loading placeholder - only show if no image source -->
    <div 
      v-if="!imgSrc && !allSourcesFailed"
      class="absolute inset-0"
    >
      <slot name="placeholder">
        <v-skeleton-loader type="image" class="w-full h-full" />
      </slot>
    </div>
    
    <!-- Error state -->
    <div 
      v-if="allSourcesFailed"
      class="absolute inset-0"
    >
      <slot name="error">
        <v-skeleton-loader type="image" class="w-full h-full">
          <div class="flex items-center justify-center h-full text-neutral-500">
            <i class="mdi-image-broken mdi v-icon text-4xl"></i>
          </div>
        </v-skeleton-loader>
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, readonly } from 'vue'

interface Props {
  sources?: string[]
  src?: string
  alt: string
  aspectRatio?: string | number
  cover?: boolean
  eager?: boolean
  width?: string | number
  height?: string | number
  maxWidth?: string | number
  maxHeight?: string | number
  class?: string | string[] | object
}

const props = withDefaults(defineProps<Props>(), {
  sources: () => [],
  cover: false,
  eager: false
})

const emit = defineEmits<{
  load: [event: Event, src: string]
  error: [event: Event, src: string]
  allFailed: []
}>()

// Simple state management
const loaded = ref(false)
const sourceIndex = ref(0)
const allSourcesFailed = ref(false)
const imgSrc = ref('')

// Get all valid sources
const getValidSources = () => {
  const urls = props.sources?.length ? props.sources : (props.src ? [props.src] : [])
  return urls.filter(Boolean)
}

// Initialize image source
const initializeImage = () => {
  const sources = getValidSources()
  
  if (sources.length > 0) {
    sourceIndex.value = 0
    loaded.value = false
    allSourcesFailed.value = false
    imgSrc.value = sources[0] || ''
  }
}

// Simple error handling - try next source
const handleError = (event: Event) => {
  const sources = getValidSources()
  
  // Try next source
  if (sourceIndex.value < sources.length - 1) {
    sourceIndex.value++
    loaded.value = false
    imgSrc.value = sources[sourceIndex.value] || ''
    return
  }
  
  // All sources failed
  allSourcesFailed.value = true
  emit('error', event, imgSrc.value)
  emit('allFailed')
}

// Simple load handling
const handleLoad = (event: Event) => {
  loaded.value = true
  emit('load', event, imgSrc.value)
}

// Initialize immediately for SSR, and when sources change
watch(() => props.sources, initializeImage, { immediate: true })
watch(() => props.src, initializeImage, { immediate: true })

// Re-initialize after hydration to ensure client-side works
onMounted(() => {
  initializeImage()
})

// Styling
const computedAspectRatio = computed(() => {
  if (!props.aspectRatio) return undefined
  
  if (typeof props.aspectRatio === 'string' && props.aspectRatio.includes('/')) {
    const [w, h] = props.aspectRatio.split('/').map(Number)
    return w && h ? w / h : undefined
  }
  
  return typeof props.aspectRatio === 'number' ? props.aspectRatio : parseFloat(props.aspectRatio)
})

const containerStyle = computed(() => {
  const styles: Record<string, string> = {}
  
  if (computedAspectRatio.value) {
    styles.aspectRatio = computedAspectRatio.value.toString()
  }
  
  if (props.width) {
    styles.width = typeof props.width === 'number' ? `${props.width}px` : props.width
  }
  if (props.height) {
    styles.height = typeof props.height === 'number' ? `${props.height}px` : props.height
  }
  if (props.maxWidth) {
    styles.maxWidth = typeof props.maxWidth === 'number' ? `${props.maxWidth}px` : props.maxWidth
  }
  if (props.maxHeight) {
    styles.maxHeight = typeof props.maxHeight === 'number' ? `${props.maxHeight}px` : props.maxHeight
  }
  
  return styles
})

const imgStyle = computed(() => {
  const styles: Record<string, string> = {
    width: '100%',
    height: '100%'
  }
  
  if (props.cover) {
    styles.objectFit = 'cover'
  }
  
  return styles
})

const containerClass = computed(() => {
  const classes = ['overflow-hidden']
  
  if (props.class) {
    if (Array.isArray(props.class)) {
      classes.push(...props.class)
    } else if (typeof props.class === 'string') {
      classes.push(props.class)
    } else if (typeof props.class === 'object') {
      Object.entries(props.class).forEach(([key, value]) => {
        if (value) classes.push(key)
      })
    }
  }
  
  return classes
})

const imgClass = computed(() => {
  return containerClass.value.filter(cls => !['relative', 'absolute', 'fixed', 'sticky'].includes(cls))
})

// Expose for parent access
defineExpose({
  reload: initializeImage,
  currentSource: computed(() => imgSrc.value),
  sourceIndex: readonly(sourceIndex)
})
</script>

<style scoped>
.seo-img-container {
  box-sizing: border-box;
}
</style>