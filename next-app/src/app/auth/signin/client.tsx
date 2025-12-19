"use client";

import { signIn } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";

interface SignInClientProps {
  callbackUrl?: string;
  error?: string;
}

const errorMessages: Record<string, string> = {
  OAuthSignin: "Error starting sign in process. Please try again.",
  OAuthCallback: "Error during sign in callback. Please try again.",
  OAuthCreateAccount: "Could not create account. Email may already be in use.",
  EmailCreateAccount: "Could not create account. Please try again.",
  Callback: "Sign in callback error. Please try again.",
  OAuthAccountNotLinked: "This email is already associated with another account.",
  SessionRequired: "Please sign in to continue.",
  Default: "An error occurred during sign in. Please try again.",
};

export function SignInClient({ callbackUrl, error }: SignInClientProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      await signIn("google", {
        callbackUrl: callbackUrl || "/",
      });
    } catch (err) {
      console.error("Sign in error:", err);
      setIsLoading(false);
    }
  };

  const errorMessage = error ? errorMessages[error] || errorMessages.Default : null;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>

        <Card className="border-border/40">
          <CardHeader className="text-center space-y-2">
            {/* Logo */}
            <div className="flex justify-center mb-2">
              <Image
                src="/popcorn-lite.png"
                alt="Movie Browser"
                width={48}
                height={48}
              />
            </div>
            <CardTitle className="text-2xl font-bold">Welcome back</CardTitle>
            <CardDescription className="text-base">
              Sign in to access your watchlist, ratings, and recommendations
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Error message */}
            {errorMessage && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Google Sign In Button */}
            <Button
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              variant="outline"
              size="lg"
              className="w-full h-12 gap-3 font-medium"
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
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border/40" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Why sign in?
                </span>
              </div>
            </div>

            {/* Benefits */}
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="text-primary">✓</span>
                Save movies and shows to your watchlist
              </li>
              <li className="flex items-center gap-2">
                <span className="text-primary">✓</span>
                Rate titles and track what you&apos;ve watched
              </li>
              <li className="flex items-center gap-2">
                <span className="text-primary">✓</span>
                Get personalized recommendations
              </li>
              <li className="flex items-center gap-2">
                <span className="text-primary">✓</span>
                Sync your data across devices
              </li>
            </ul>

            {/* Terms */}
            <p className="text-xs text-center text-muted-foreground">
              By signing in, you agree to our{" "}
              <Link href="/terms" className="underline hover:text-foreground">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="underline hover:text-foreground">
                Privacy Policy
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

