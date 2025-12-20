"use client";

import { ThemeProvider } from "./theme-provider";
import { QueryProvider } from "./query-provider";
import { AuthProvider } from "./auth-provider";
import { UserStoreProvider } from "./user-store-provider";
import { Toaster } from "@/components/ui/sonner";
import { GoogleOneTap } from "@/components/features/auth";

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <AuthProvider>
      <UserStoreProvider>
        <ThemeProvider>
          <QueryProvider>
            {children}
            <Toaster position="bottom-right" />
            {/* Google One Tap - shows login prompt for unauthenticated users */}
            <GoogleOneTap delay={2000} />
          </QueryProvider>
        </ThemeProvider>
      </UserStoreProvider>
    </AuthProvider>
  );
}
