import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface AuthErrorPageProps {
  searchParams: Promise<{
    error?: string;
  }>;
}

const errorDescriptions: Record<string, { title: string; description: string }> = {
  Configuration: {
    title: "Configuration Error",
    description: "There's a problem with the server configuration. Please contact support.",
  },
  AccessDenied: {
    title: "Access Denied",
    description: "You don't have permission to sign in. Please try a different account.",
  },
  Verification: {
    title: "Verification Failed",
    description: "The verification link may have expired. Please try signing in again.",
  },
  OAuthSignin: {
    title: "Sign In Error",
    description: "Could not start the sign in process. Please try again.",
  },
  OAuthCallback: {
    title: "Callback Error",
    description: "There was a problem during the sign in process. Please try again.",
  },
  OAuthCreateAccount: {
    title: "Account Creation Failed",
    description: "Could not create your account. The email may already be in use.",
  },
  OAuthAccountNotLinked: {
    title: "Account Not Linked",
    description: "This email is already associated with a different sign in method.",
  },
  SessionRequired: {
    title: "Session Required",
    description: "Please sign in to access this page.",
  },
  Default: {
    title: "Authentication Error",
    description: "An unexpected error occurred during sign in. Please try again.",
  },
};

export const metadata = {
  title: "Authentication Error",
  description: "An error occurred during authentication.",
};

export default async function AuthErrorPage({ searchParams }: AuthErrorPageProps) {
  const { error } = await searchParams;
  const errorInfo = error ? errorDescriptions[error] || errorDescriptions.Default : errorDescriptions.Default;

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
          <CardHeader className="text-center space-y-4">
            {/* Error icon */}
            <div className="flex justify-center">
              <div className="p-3 rounded-full bg-destructive/10">
                <AlertTriangle className="h-8 w-8 text-destructive" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold">{errorInfo.title}</CardTitle>
            <CardDescription className="text-base">
              {errorInfo.description}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Error code for debugging */}
            {error && (
              <div className="p-3 rounded-lg bg-muted text-xs text-muted-foreground font-mono text-center">
                Error code: {error}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-col gap-2">
              <Button asChild className="w-full">
                <Link href="/auth/signin">Try signing in again</Link>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link href="/">Go to homepage</Link>
              </Button>
            </div>

            {/* Help text */}
            <p className="text-xs text-center text-muted-foreground">
              If this problem persists, please{" "}
              <Link href="/contact" className="underline hover:text-foreground">
                contact support
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


