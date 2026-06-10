import type { Metadata } from "next";
import Link from "next/link";
import { PageMain } from "@/components/features/layout/page-main";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Page Not Found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <PageMain className="flex flex-col items-center justify-center text-center gap-4 min-h-[60dvh]">
      <p className="text-sm uppercase tracking-widest text-muted-foreground">404</p>
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-muted-foreground max-w-md">
        The page you&apos;re looking for doesn&apos;t exist or may have moved.
      </p>
      <Button asChild>
        <Link href="/">Back to home</Link>
      </Button>
    </PageMain>
  );
}
