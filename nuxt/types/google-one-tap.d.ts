// Type definitions for Google One Tap
declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: GoogleOneTapConfig) => void
          prompt: (callback?: (notification: GoogleOneTapNotification) => void) => void
          cancel: () => void
        }
      }
    }
  }
}

interface GoogleOneTapConfig {
  client_id: string
  callback: (response: GoogleOneTapResponse) => void
  auto_select?: boolean
  cancel_on_tap_outside?: boolean
  context?: 'signin' | 'signup' | 'use'
  itp_support?: boolean
  prompt_parent_id?: string
  use_fedcm_for_prompt?: boolean
  state_cookie_domain?: string
}

interface GoogleOneTapResponse {
  credential: string
  select_by?: string
}

interface GoogleOneTapNotification {
  isNotDisplayed: () => boolean
  getNotDisplayedReason: () => string
  isSkippedMoment: () => boolean
  getSkippedReason: () => string
}

export {}
