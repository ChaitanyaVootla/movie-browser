import type { Metadata } from "next";
import { Upload } from "lucide-react";
import { auth } from "@/lib/auth";
import { PageMain } from "@/components/features/layout/page-main";
import { ImportClient } from "@/components/features/settings/import-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Import your history - The Movie Browser",
};

export default async function ImportPage() {
  const session = await auth();

  if (!session?.user) {
    return (
      <PageMain>
        <div className="mx-auto flex min-h-[50dvh] max-w-md flex-col items-center justify-center gap-3 text-center">
          <Upload className="h-8 w-8 text-muted-foreground" />
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Import</h1>
          <p className="text-sm text-muted-foreground">Sign in to import your watch history.</p>
        </div>
      </PageMain>
    );
  }

  return (
    <PageMain>
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Import your history</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Letterboxd, Trakt and IMDb exports — dates, rewatches, ratings, likes and
            reviews come along. You get a row-by-row report.
          </p>
        </div>
        <ImportClient />
      </div>
    </PageMain>
  );
}
