"use client";

import { WifiOff } from "lucide-react";

export default function OfflinePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <WifiOff className="h-16 w-16 text-muted-foreground/40 mb-6" />
      <h1 className="text-2xl font-bold mb-2">You&apos;re offline</h1>
      <p className="text-muted-foreground max-w-md">
        It looks like you&apos;ve lost your internet connection. Some previously
        visited pages and images may still be available.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="mt-6 px-6 py-2 rounded-full bg-brand text-brand-foreground font-medium hover:opacity-90 transition-opacity"
      >
        Try again
      </button>
    </div>
  );
}
