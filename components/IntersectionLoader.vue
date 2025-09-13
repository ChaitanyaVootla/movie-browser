<template>
  <div 
    ref="containerRef" 
    data-intersection-loader
    :style="containerStyle"
    :class="containerClass"
  >
    <!-- Always show content during SSR for SEO -->
    <slot v-if="shouldShowContent"></slot>
    
    <!-- Loading placeholder with proper dimensions -->
    <div 
      v-else
      class="intersection-placeholder"
      :style="containerStyle"
      :class="containerClass"
    >
      <v-skeleton-loader 
        type="image" 
        color="black"
        class="w-full h-full"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  height: string
  width: string
  mobileHeight: string
  mobileWidth: string
  eager?: boolean // Force immediate loading
}

const props = withDefaults(defineProps<Props>(), {
  eager: false
})

const isLoaded = ref(false)
const containerRef = ref<HTMLElement | null>(null)

// Container styles to maintain dimensions
const containerStyle = computed(() => ({
  width: `min(${props.width}, 100%)`,
  height: props.height,
  '@media (max-width: 768px)': {
    width: `min(${props.mobileWidth}, 100%)`,
    height: props.mobileHeight,
  }
}))

const containerClass = computed(() => [
  'intersection-loader-container',
  'relative',
  'overflow-hidden'
])

// Modern approach: Load immediately if visible or if eager
const shouldShowContent = computed(() => {
  // Always show during SSR for SEO
  if (import.meta.server) return true
  
  // Show immediately if eager mode
  if (props.eager) return true
  
  // Show when loaded via intersection
  return isLoaded.value
})

// Use modern native intersection observer
let observer: IntersectionObserver | null = null

const setupObserver = () => {
  if (!containerRef.value || props.eager) return
  
  observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0]
      if (entry?.isIntersecting) {
        isLoaded.value = true
        observer?.disconnect()
        observer = null
      }
    },
    {
      rootMargin: '100px 0px', // Load 100px before entering viewport
      threshold: 0.01 // Trigger when 1% visible
    }
  )
  
  observer.observe(containerRef.value)
}

// Check if initially visible and load immediately
const checkInitialVisibility = () => {
  if (!containerRef.value || props.eager) return
  
  const rect = containerRef.value.getBoundingClientRect()
  const isVisible = (
    rect.top < window.innerHeight + 100 && // 100px buffer
    rect.bottom > -100 &&
    rect.left < window.innerWidth + 100 &&
    rect.right > -100
  )
  
  if (isVisible) {
    isLoaded.value = true
  } else {
    setupObserver()
  }
}

onMounted(() => {
  if (props.eager) {
    isLoaded.value = true
  } else {
    // Check visibility immediately after mount
    requestAnimationFrame(() => {
      checkInitialVisibility()
    })
  }
})

onUnmounted(() => {
  observer?.disconnect()
})
</script>

<style scoped>
.intersection-loader-container {
  /* Ensure consistent sizing across states */
  box-sizing: border-box;
}

.intersection-placeholder {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

/* Responsive sizing */
@media (max-width: 768px) {
  .intersection-loader-container {
    width: v-bind('props.mobileWidth') !important;
    height: v-bind('props.mobileHeight') !important;
  }
}

@media (min-width: 769px) {
  .intersection-loader-container {
    width: v-bind('props.width') !important;
    height: v-bind('props.height') !important;
  }
}
</style>
