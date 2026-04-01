"use client";

import { ThemeProvider } from "./theme-provider";
import { ColorPaletteProvider } from "./color-palette-provider";
import { QueryProvider } from "./query-provider";
import { AuthProvider } from "./auth-provider";
import { UserStoreProvider } from "./user-store-provider";
import { Toaster } from "@/components/ui/sonner";
import { GoogleOneTap } from "@/components/features/auth";
import {
  HoverCardProvider,
  HoverCardOverlay,
  QuickInfoProvider,
} from "@/components/features/hover-card";
import { AssistantFloaty } from "@/components/features/ai";
import { SearchProvider, SearchCommand, useSearch } from "@/components/features/search";
import { AnalyticsProvider } from "@/components/analytics";
import {
  ServiceWorkerRegister,
  InstallBanner,
  BadgeManager,
} from "@/components/features/pwa";

interface ProvidersProps {
  children: React.ReactNode;
}

// Separate component to access search context
function SearchDialogRenderer() {
  const { open, setOpen } = useSearch();
  return <SearchCommand open={open} onOpenChange={setOpen} />;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <AuthProvider>
      <UserStoreProvider>
        <ThemeProvider>
          <ColorPaletteProvider>
            <QueryProvider>
            <AnalyticsProvider>
              <SearchProvider>
                <HoverCardProvider>
                  <QuickInfoProvider>
                    {children}
                    <HoverCardOverlay />
                    <Toaster position="bottom-right" />
                    {/* Google One Tap - shows login prompt for unauthenticated users */}
                    <GoogleOneTap delay={2000} />
                    {/* Cue - AI chat assistant */}
                    <AssistantFloaty />
                    {/* Search dialog - single instance */}
                    <SearchDialogRenderer />
                    {/* PWA: service worker, install prompt, badge */}
                    <ServiceWorkerRegister />
                    <InstallBanner />
                    <BadgeManager />
                  </QuickInfoProvider>
                </HoverCardProvider>
              </SearchProvider>
            </AnalyticsProvider>
            </QueryProvider>
          </ColorPaletteProvider>
        </ThemeProvider>
      </UserStoreProvider>
    </AuthProvider>
  );
}
