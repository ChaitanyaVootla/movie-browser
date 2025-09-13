<template>
  <div 
    ref="containerRef"
    class="seo-img-container"
    :class="containerClass"
    :style="containerStyle"
  >
    <!-- Main image with native lazy loading (2024 standard) -->
            <img
              v-if="shouldShowImage"
              v-show="loaded && !errored"
              :src="currentSrc"
              :alt="alt"
              :class="imgClass"
              :style="imgStyle"
              :loading="props.eager ? 'eager' : 'lazy'"
              :decoding="props.eager ? 'sync' : 'async'"
              @load="handleLoad"
              @error="handleError"
              ref="imgRef"
            />
    
    <!-- Loading state -->
    <div 
      v-if="shouldShowImage && !loaded && !errored"
      class="seo-img-placeholder"
      :class="containerClass"
      :style="containerStyle"
    >
      <slot name="placeholder">
        <v-skeleton-loader type="image" class="w-full h-full" />
      </slot>
    </div>
    
    <!-- Lazy loading placeholder -->
    <div 
      v-if="!shouldShowImage && !errored"
      class="seo-img-lazy-placeholder"
      :class="containerClass"
      :style="containerStyle"
    >
      <slot name="placeholder">
        <v-skeleton-loader type="image" class="w-full h-full" />
      </slot>
    </div>
    
    <!-- Error state -->
    <div 
      v-if="errored"
      class="seo-img-error"
      :class="containerClass"  
      :style="containerStyle"
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
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'

interface Props {
  // Simple array of URLs to try progressively
  sources?: string[]
  // Legacy support - single URL
  src?: string
  alt: string
  
  // Display options
  aspectRatio?: string | number
  cover?: boolean
  eager?: boolean
  width?: string | number
  height?: string | number
  maxWidth?: string | number
  maxHeight?: string | number
  class?: string | string[] | object
  
  // Loading behavior  
  lazy?: boolean
  timeout?: number
}

const props = withDefaults(defineProps<Props>(), {
  sources: () => [],
  cover: false,
  eager: false,
  lazy: false,
  timeout: 8000
})

const emit = defineEmits<{
  load: [event: Event, src: string]
  error: [event: Event, src: string]
  allFailed: []
}>()

// Component state
const loaded = ref(false)
const errored = ref(false)
const currentSrc = ref('')
const currentIndex = ref(0)
const imgRef = ref<HTMLImageElement>()
const containerRef = ref<HTMLElement>()
const loadingTimeoutId = ref<number | null>(null)

// Filter valid URLs - support both sources array and legacy src
const validSources = computed(() => {
  let urls: string[] = []
  
  // New sources array approach
  if (props.sources && props.sources.length > 0) {
    urls = props.sources
  }
  // Legacy single src approach
  else if (props.src) {
    urls = [props.src]
  }
  
  return urls.filter(url => url && url.trim())
})

// Modern 2024 approach: Always show images, use native lazy loading
const shouldShowImage = computed(() => {
  return validSources.value.length > 0
})

// Improved timeout management - fixes memory leak
const clearLoadingTimeout = () => {
  if (loadingTimeoutId.value !== null) {
    clearTimeout(loadingTimeoutId.value)
    loadingTimeoutId.value = null
  }
}

const setLoadingTimeout = () => {
  // Always clear existing timeout first
  clearLoadingTimeout()
  
  if (props.timeout > 0) {
    // Use much longer timeout - network might be slower than expected
    const timeoutDuration = props.eager ? Math.min(props.timeout, 15000) : props.timeout
    
    loadingTimeoutId.value = setTimeout(() => {
      // Double-check state before timing out to prevent race conditions
      if (!loaded.value && !errored.value && currentSrc.value) {
        handleError(new Event('timeout') as any)
      }
    }, timeoutDuration) as unknown as number
  }
}

// Enhanced error handling with progressive fallback
const handleError = (event: Event) => {
  clearLoadingTimeout()
  
  // Try next source
  if (currentIndex.value < validSources.value.length - 1) {
    currentIndex.value++
    const nextSrc = validSources.value[currentIndex.value]
    
    // Reset state for next attempt  
    loaded.value = false
    errored.value = false // Keep trying, don't mark as errored yet
    
    if (nextSrc) {
      currentSrc.value = nextSrc
      // Start timeout for next attempt
      setLoadingTimeout()
    }
    return
  }
  
  // All sources failed
  loaded.value = false
  errored.value = true
  emit('error', event, currentSrc.value)
  emit('allFailed')
}


// Load handling
const handleLoad = (event: Event) => {
  // CRITICAL: Clear timeout immediately to prevent race condition
  clearLoadingTimeout()
  
  // Mark as successfully loaded
  loaded.value = true
  errored.value = false
  
  emit('load', event, currentSrc.value)
}

// Start loading process
const startLoading = () => {
  if (validSources.value.length === 0) {
    errored.value = true
    emit('allFailed')
    return
  }
  
  // Reset state
  loaded.value = false
  errored.value = false
  currentIndex.value = 0
  currentSrc.value = validSources.value[0] || ''
  
  // Start timeout
  setLoadingTimeout()
}

// CDN precheck disabled for performance
const checkCdnAvailability = async (url: string): Promise<boolean> => {
  return true
}

// SINGLE WATCHER - Initialize image source with CDN precheck
watch([() => props.sources, () => props.src], async () => {
  // Reset state
  loaded.value = false
  errored.value = false
  currentIndex.value = 0
  clearLoadingTimeout()
  
  // Set initial source
  if (validSources.value.length > 0) {
    let initialSource = validSources.value[0] || ''
    
    // CDN precheck disabled for performance
    
    currentSrc.value = initialSource
    setLoadingTimeout()
  }
}, { immediate: true })

// Lifecycle management
onMounted(async () => {
  // For eager images, ensure immediate loading with CDN check
  if (props.eager && validSources.value.length > 0) {
    if (!currentSrc.value) {
      let initialSource = validSources.value[0]
      
      // CDN precheck disabled for performance
      
      if (initialSource) {
        currentSrc.value = initialSource
        setLoadingTimeout()
      }
    }
  }
  // For lazy images, native loading handles everything
  else if (validSources.value.length > 0 && !currentSrc.value) {
    const firstSource = validSources.value[0]
    if (firstSource) {
      currentSrc.value = firstSource
      setLoadingTimeout()
    }
  }
})

onUnmounted(() => {
  clearLoadingTimeout()
})

// Styling
const computedAspectRatio = computed(() => {
  if (!props.aspectRatio) return undefined
  
  if (typeof props.aspectRatio === 'string') {
    if (props.aspectRatio.includes('/')) {
      const parts = props.aspectRatio.split('/').map(Number)
      const w = parts[0]
      const h = parts[1]
      if (w && h) {
        return w / h
      }
    }
    return parseFloat(props.aspectRatio)
  }
  
  return props.aspectRatio
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
  const classes = ['relative']
  
  if (props.class) {
    if (Array.isArray(props.class)) {
      classes.push(...props.class)
    } else if (typeof props.class === 'string') {
      classes.push(props.class)
    } else if (typeof props.class === 'object') {
      Object.keys(props.class).forEach(key => {
        if ((props.class as Record<string, boolean>)[key]) {
          classes.push(key)
        }
      })
    }
  }
  
  return classes
})

const imgClass = computed(() => {
  const classes = [...containerClass.value]
  const removeClasses = ['relative', 'absolute', 'fixed', 'sticky']
  return classes.filter(cls => !removeClasses.includes(cls))
})

// Expose for parent access
defineExpose({
  reload: startLoading,
  currentSource: computed(() => currentSrc.value),
  sourceIndex: computed(() => currentIndex.value)
})
</script>

<style scoped>
.seo-img-container {
  overflow: hidden;
}

.seo-img-placeholder,
.seo-img-lazy-placeholder,
.seo-img-error {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}
</style>