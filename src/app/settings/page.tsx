import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Upload, UserCog } from "lucide-react";
import { auth } from "@/lib/auth";
import { getOwnProfileSettings } from "@/server/actions/profile";
import { PageMain } from "@/components/features/layout/page-main";
import { SectionHeading } from "@/components/features/layout/section-heading";
import {
  BlockedUsersSettings,
  FourFavoritesEditor,
  PrivacySettings,
  ProfileEditor,
  UsernameForm,
} from "@/components/features/settings";
import { ExportDataButton } from "@/components/features/settings/export-data-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Settings - The Movie Browser",
};

export default async function SettingsPage() {
  const session = await auth();

  if (!session?.user) {
    return (
      <PageMain>
        <div className="mx-auto flex min-h-[50dvh] max-w-md flex-col items-center justify-center gap-3 text-center">
          <UserCog className="h-8 w-8 text-muted-foreground" />
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">Sign in to manage your profile.</p>
        </div>
      </PageMain>
    );
  }

  const settings = await getOwnProfileSettings();

  return (
    <PageMain>
      <div className="mx-auto w-full max-w-2xl space-y-8 md:space-y-10">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Settings</h1>

        <section className="space-y-4">
          <SectionHeading>Account</SectionHeading>
          <UsernameForm currentUsername={settings.username} />
        </section>

        <section className="space-y-4">
          <SectionHeading>Profile</SectionHeading>
          <ProfileEditor settings={settings} />
        </section>

        <section id="four-favorites" className="space-y-4">
          <SectionHeading>Four Favorites</SectionHeading>
          <FourFavoritesEditor initial={settings.fourFavorites} />
        </section>

        <section className="space-y-4">
          <SectionHeading>Privacy</SectionHeading>
          <PrivacySettings defaults={settings.privacy} />
        </section>

        <section className="space-y-4">
          <SectionHeading>Blocked &amp; muted</SectionHeading>
          <BlockedUsersSettings />
        </section>

        <section className="space-y-4">
          <SectionHeading>Your data</SectionHeading>
          <Link
            href="/settings/import"
            className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/30"
          >
            <Upload className="h-5 w-5 text-muted-foreground" />
            <span className="flex-1">
              <span className="block text-sm font-medium">Import from Letterboxd, Trakt or IMDb</span>
              <span className="block text-xs font-medium text-muted-foreground">
                Bring your full history — dates, rewatches, ratings, reviews.
              </span>
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
          </Link>
          <ExportDataButton />
        </section>
      </div>
    </PageMain>
  );
}
