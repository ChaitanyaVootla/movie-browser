import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SignInClient } from "./client";

interface SignInPageProps {
  searchParams: Promise<{
    callbackUrl?: string;
    error?: string;
  }>;
}

export const metadata = {
  title: "Sign In",
  description: "Sign in to Movie Browser to access your watchlist, ratings, and personalized recommendations.",
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  // Check if user is already authenticated
  const session = await auth();
  const { callbackUrl, error } = await searchParams;
  
  // If already logged in, redirect to callback or home
  if (session?.user) {
    redirect(callbackUrl || "/");
  }

  return <SignInClient callbackUrl={callbackUrl} error={error} />;
}


