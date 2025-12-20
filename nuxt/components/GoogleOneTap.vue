<template>
  <div>
    <!-- Google One Tap will be rendered here -->
  </div>
</template>

<script setup lang="ts">
import { useAuth } from '#imports'

const { status, signIn } = useAuth()

// Only show One Tap for unauthenticated users
const shouldShowOneTap = computed(() => status.value === 'unauthenticated')

// Configuration for Google One Tap
const config = useRuntimeConfig()

// Track if One Tap has been attempted to avoid spamming
const oneTapAttempted = ref(false)

// Load and initialize Google One Tap
const initializeGoogleOneTap = () => {
  if (typeof window !== 'undefined' && window.google?.accounts?.id && !oneTapAttempted.value) {
    try {
      window.google.accounts.id.initialize({
        client_id: config.public.googleClientId,
        callback: async (response: any) => {
          try {
            // Sign in using the google-one-tap provider with the credential
            const result = await signIn('google-one-tap', {
              credential: response.credential,
              redirect: false
            })
            
            if (result?.error) {
              console.error('Google One Tap authentication failed:', result.error)
            } else {
              console.log('Google One Tap sign-in successful')
            }
          } catch (error) {
            console.error('Google One Tap sign-in failed:', error)
          }
        },
        // Configure One Tap display options
        auto_select: false, // Set to false to be less aggressive
        cancel_on_tap_outside: true, // Allow closing when clicking outside
        context: 'signin',
        itp_support: true,
        use_fedcm_for_prompt: true, // Disable FedCM to avoid browser blocking
      })

      // Only show the prompt if user is not authenticated
      if (shouldShowOneTap.value) {
        oneTapAttempted.value = true
        
        // Show prompt immediately - DOM is already ready since component is mounted
        if (window.google?.accounts?.id) {
          window.google.accounts.id.prompt((notification: any) => {
            if (notification.isNotDisplayed()) {
              const reason = notification.getNotDisplayedReason()
              console.log('Google One Tap not displayed:', reason)
              
              // Handle specific reasons
              if (reason === 'browser_not_supported' || reason === 'fedcm_disabled') {
                console.log('Browser does not support One Tap or FedCM is disabled')
              } else if (reason === 'suppressed_by_user') {
                console.log('User has suppressed One Tap prompts')
              }
            } else if (notification.isSkippedMoment()) {
              const reason = notification.getSkippedReason()
              console.log('Google One Tap skipped:', reason)
              
              if (reason === 'user_cancel' || reason === 'tap_outside') {
                console.log('User dismissed the One Tap prompt')
              }
            }
            
            // Reset attempt flag after some time to allow retry
            setTimeout(() => {
              oneTapAttempted.value = false
            }, 30000) // 30 seconds
          })
        }
      }
    } catch (error) {
      console.error('Error initializing Google One Tap:', error)
      oneTapAttempted.value = false
    }
  }
}

// Load Google Identity Services script
const loadGoogleScript = () => {
  return new Promise<void>((resolve) => {
    // Check if script is already loaded
    if (typeof window !== 'undefined' && window.google?.accounts?.id) {
      resolve()
      return
    }

    // Create and load the script
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => {
      console.error('Failed to load Google Identity Services script')
      resolve() // Resolve anyway to prevent hanging
    }
    
    document.head.appendChild(script)
  })
}

// Initialize when component mounts
onMounted(async () => {
  // Only run on client-side for unauthenticated users
  if (import.meta.client && shouldShowOneTap.value) {
    try {
      await loadGoogleScript()
      initializeGoogleOneTap()
    } catch (error) {
      console.error('Error initializing Google One Tap:', error)
    }
  }
})

// Watch for authentication status changes
watch(shouldShowOneTap, (newValue) => {
  if (import.meta.client && newValue) {
    // User logged out, reset attempt flag and reinitialize One Tap
    oneTapAttempted.value = false
    setTimeout(() => initializeGoogleOneTap(), 100)
  }
})

// Clean up on unmount
onUnmounted(() => {
  if (import.meta.client && window.google?.accounts?.id) {
    try {
      window.google.accounts.id.cancel()
    } catch (error) {
      // Silent fail - the API might not be fully loaded
    }
  }
})
</script>
