"use client";

import { ThemeProvider } from "./theme-provider";
import { QueryProvider } from "./query-provider";
import { AuthProvider } from "./auth-provider";
import { UserStoreProvider } from "./user-store-provider";
import { Toaster } from "@/components/ui/sonner";
import { GoogleOneTap } from "@/components/features/auth";
import { HoverCardProvider, HoverCardOverlay, QuickInfoProvider } from "@/components/features/hover-card";
import { AssistantFloaty } from "@/components/features/ai";

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <AuthProvider>
      <UserStoreProvider>
        <ThemeProvider>
          <QueryProvider>
            <HoverCardProvider>
              <QuickInfoProvider>
                {children}
                <HoverCardOverlay />
                <Toaster position="bottom-right" />
                {/* Google One Tap - shows login prompt for unauthenticated users */}
                <GoogleOneTap delay={2000} />
                {/* AI Assistant floating chat */}
                <AssistantFloaty />
              </QuickInfoProvider>
            </HoverCardProvider>
          </QueryProvider>
        </ThemeProvider>
      </UserStoreProvider>
    </AuthProvider>
  );
}
