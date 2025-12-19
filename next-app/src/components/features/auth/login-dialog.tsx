"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { signIn } from "next-auth/react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface LoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Optional message to show above the login button
   */
  message?: string;
  /**
   * Callback after successful sign-in initiation
   */
  onSignInStart?: () => void;
}

export function LoginDialog({
  open,
  onOpenChange,
  message = "Sign in to access all features",
  onSignInStart,
}: LoginDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const renderAttempted = useRef(false);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    onSignInStart?.();
    
    try {
      await signIn("google", { callbackUrl: window.location.href });
    } catch (error) {
      console.error("Sign in error:", error);
      setIsLoading(false);
    }
  };

  // Render Google Sign-In button when dialog opens
  const renderGoogleButton = useCallback(() => {
    if (!googleButtonRef.current) return;
    if (!window.google?.accounts?.id) return;
    if (renderAttempted.current) return;

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    try {
      renderAttempted.current = true;
      
      // Clear any existing content
      googleButtonRef.current.innerHTML = "";
      
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "signin_with",
        shape: "rectangular",
        logo_alignment: "left",
        width: "300",
      });
    } catch (error) {
      console.error("Error rendering Google button:", error);
    }
  }, []);

  // Reset render flag when dialog closes
  useEffect(() => {
    if (!open) {
      renderAttempted.current = false;
    }
  }, [open]);

  // Try to render Google button when dialog opens
  useEffect(() => {
    if (open && window.google?.accounts?.id) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(renderGoogleButton, 100);
      return () => clearTimeout(timer);
    }
  }, [open, renderGoogleButton]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center space-y-3">
          <DialogTitle className="text-2xl font-semibold">
            Welcome to Movie Browser
          </DialogTitle>
          <DialogDescription className="text-base">
            {message}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-6 py-6">
          {/* Google Sign-In Button (rendered by Google Identity Services) */}
          <div
            ref={googleButtonRef}
            className="min-h-[44px] flex items-center justify-center"
          />

          {/* Fallback button if GIS fails to render */}
          <Button
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            variant="outline"
            size="lg"
            className={cn(
              "w-full max-w-[300px] h-12 gap-3 font-medium",
              "border-border/60 hover:bg-accent hover:border-border",
              "transition-all duration-200"
            )}
          >
            <Image
              src="/images/googleLogin/login_small.svg"
              alt=""
              width={20}
              height={20}
              className="flex-shrink-0"
            />
            <span>{isLoading ? "Signing in..." : "Continue with Google"}</span>
          </Button>

          {/* Divider */}
          <div className="relative w-full max-w-[300px]">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border/40" />
            </div>
          </div>

          {/* Benefits */}
          <div className="text-center text-sm text-muted-foreground space-y-2 max-w-[280px]">
            <p>✓ Save movies to your watchlist</p>
            <p>✓ Rate and review titles</p>
            <p>✓ Get personalized recommendations</p>
          </div>
        </div>

        {/* Not now button */}
        <div className="flex justify-center pb-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground"
          >
            Not now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Hook to manage login dialog state
export function useLoginDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState<string | undefined>();

  const openLoginDialog = useCallback((customMessage?: string) => {
    setMessage(customMessage);
    setIsOpen(true);
  }, []);

  const closeLoginDialog = useCallback(() => {
    setIsOpen(false);
    setMessage(undefined);
  }, []);

  return {
    isOpen,
    message,
    openLoginDialog,
    closeLoginDialog,
    setIsOpen,
  };
}

