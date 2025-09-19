<template>
  <!-- Simple img replacement with fallback handling -->
  <img
    v-if="!allSourcesFailed && imgSrc"
    :src="imgSrc"
    :alt="alt"
    :class="imageClasses"
    :style="imageStyle"
    :loading="eager ? 'eager' : 'lazy'"
    :decoding="eager ? 'sync' : 'async'"
    @load="handleLoad"
    @error="handleError"
  />
  
  <!-- Loading placeholder when no source available -->
  <slot 
    v-else-if="!allSourcesFailed" 
    name="placeholder"
    :style="imageStyle"
  >
    <div :style="imageStyle" class="bg-neutral-200 animate-pulse"></div>
  </slot>
  
  <!-- Error state when all sources failed -->
  <slot 
    v-else 
    name="error"
    :style="imageStyle"
  >
    <div :style="imageStyle" class="asd bg-neutral-700"></div>
  </slot>
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
  } else {
    // No valid sources available - show error state immediately
    sourceIndex.value = 0
    loaded.value = false
    allSourcesFailed.value = true
    imgSrc.value = ''
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

const imageStyle = computed(() => {
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
  
  if (props.cover) {
    styles.objectFit = 'cover'
  }
  
  return styles
})

const imageClasses = computed(() => {
  if (!props.class) return undefined
  
  if (Array.isArray(props.class)) {
    return props.class
  } else if (typeof props.class === 'string') {
    return props.class
  } else if (typeof props.class === 'object') {
    const classes: string[] = []
    Object.entries(props.class).forEach(([key, value]) => {
      if (value) classes.push(key)
    })
    return classes
  }
  
  return undefined
})

// Expose for parent access
defineExpose({
  reload: initializeImage,
  currentSource: computed(() => imgSrc.value),
  sourceIndex: readonly(sourceIndex)
})
</script>
