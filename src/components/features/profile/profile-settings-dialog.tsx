"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Loader2, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeading } from "@/components/features/layout/section-heading";
import {
  BlockedUsersSettings,
  FourFavoritesEditor,
  PrivacySettings,
  ProfileEditor,
  UsernameForm,
} from "@/components/features/settings";
import { ExportDataButton } from "@/components/features/settings/export-data-button";
import { getOwnProfileSettings } from "@/server/actions/profile";
import type { OwnProfileSettingsDTO } from "@/types/social";

/**
 * Owner settings as an on-profile MODAL (no nav to a separate page). Holds
 * appearance (backdrop/avatar/accent/bio/links/location), username, Four
 * Favorites, privacy, blocked/muted, and data import/export. Fetches the
 * owner's settings client-side on open (ISR-safe — never in cacheable HTML).
 * On close it refreshes so the hero/profile reflect any changes.
 */
export function ProfileSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState<OwnProfileSettingsDTO | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open || settings) return;
    let cancelled = false;
    getOwnProfileSettings()
      .then((s) => {
        if (!cancelled) setSettings(s);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, settings]);

  const handleOpenChange = (v: boolean) => {
    onOpenChange(v);
    // Refresh on close so the hero backdrop/avatar/accent reflect edits.
    if (!v && touched) router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-h-[88dvh] gap-0 overflow-y-auto p-0 sm:max-w-2xl"
        onPointerDownCapture={() => setTouched(true)}
      >
        <DialogHeader className="sticky top-0 z-10 border-b bg-card/95 px-5 py-4 backdrop-blur">
          <DialogTitle>Profile settings</DialogTitle>
        </DialogHeader>

        {!settings ? (
          <div className="space-y-4 p-5">
            <Skeleton className="h-56 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ) : (
          <div className="space-y-8 p-5">
            <section className="space-y-3">
              <SectionHeading>Appearance</SectionHeading>
              <ProfileEditor settings={settings} />
            </section>

            <section className="space-y-3">
              <SectionHeading>Username</SectionHeading>
              <UsernameForm
                currentUsername={settings.username}
                previousUsernames={settings.previousUsernames}
              />
            </section>

            <section className="space-y-3">
              <SectionHeading>Four Favorites</SectionHeading>
              <FourFavoritesEditor initial={settings.fourFavorites} />
            </section>

            <section className="space-y-3">
              <SectionHeading>Privacy</SectionHeading>
              <PrivacySettings defaults={settings.privacy} />
            </section>

            <section className="space-y-3">
              <SectionHeading>Blocked &amp; muted</SectionHeading>
              <BlockedUsersSettings />
            </section>

            <section className="space-y-3">
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
        )}

        {!settings && (
          <span className="sr-only">
            <Loader2 className="animate-spin" /> Loading settings
          </span>
        )}
      </DialogContent>
    </Dialog>
  );
}
