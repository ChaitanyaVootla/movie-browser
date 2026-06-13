"use client";

import { useState } from "react";
import Image from "next/image";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useAnalytics } from "@/hooks/use-analytics";
import { updateProfileAction } from "@/server/actions/profile";
import { PROFILE_ACCENT_OPTIONS, PROFILE_ACCENT_VARS } from "@/lib/profile-accents";
import { TMDB_IMAGE_BASE } from "@/lib/constants";
import type { OwnProfileSettingsDTO, ProfileAccent } from "@/types/social";
import { BackdropPicker, type BackdropSelection } from "./backdrop-picker";
import { ProfileEditorPreview } from "./profile-editor-preview";

interface ProfileEditorProps {
  settings: OwnProfileSettingsDTO;
}

interface EditableProfile {
  backdrop: BackdropSelection | null;
  avatarImagePath: string | null;
  accent: ProfileAccent;
  bio: string;
  /** Stored value = persisted (filtered) links; UI pads to 3 slots. */
  links: string[];
  location: string;
}

function initialFrom(c: OwnProfileSettingsDTO["customization"]): EditableProfile {
  return {
    backdrop: c.backdrop
      ? { mediaType: c.backdrop.mediaType, tmdbId: c.backdrop.tmdbId, imagePath: c.backdrop.imagePath, titleName: "" }
      : null,
    avatarImagePath: c.avatarImagePath,
    accent: c.accent,
    bio: c.bio,
    links: c.links,
    location: c.location,
  };
}

/** Normalized signature for dirty-checking (order-stable, trimmed). */
function signature(p: EditableProfile): string {
  return JSON.stringify({
    b: p.backdrop ? `${p.backdrop.mediaType}:${p.backdrop.tmdbId}:${p.backdrop.imagePath}` : null,
    a: p.avatarImagePath,
    ac: p.accent,
    bio: p.bio.trim(),
    links: p.links.map((l) => l.trim()).filter(Boolean),
    loc: p.location.trim(),
  });
}

/** Profile customization: live preview + backdrop, avatar, accent, bio, links, location. */
export function ProfileEditor({ settings }: ProfileEditorProps) {
  const [saved, setSaved] = useState<EditableProfile>(() => initialFrom(settings.customization));
  const [backdrop, setBackdrop] = useState<BackdropSelection | null>(saved.backdrop);
  const [avatarImagePath, setAvatarImagePath] = useState<string | null>(saved.avatarImagePath);
  const [posterOptions, setPosterOptions] = useState<string[]>([]);
  const [accent, setAccent] = useState<ProfileAccent>(saved.accent);
  const [bio, setBio] = useState(saved.bio);
  const [links, setLinks] = useState<string[]>([...saved.links, "", "", ""].slice(0, 3));
  const [location, setLocation] = useState(saved.location);
  const [busy, setBusy] = useState(false);
  const { trackAction } = useAnalytics();

  const current: EditableProfile = { backdrop, avatarImagePath, accent, bio, links, location };
  const dirty = signature(current) !== signature(saved);

  const avatarUrl = avatarImagePath
    ? `${TMDB_IMAGE_BASE}/w185${avatarImagePath}`
    : settings.googleImageUrl;

  const handleDiscard = () => {
    setBackdrop(saved.backdrop);
    setAvatarImagePath(saved.avatarImagePath);
    setAccent(saved.accent);
    setBio(saved.bio);
    setLinks([...saved.links, "", "", ""].slice(0, 3));
    setLocation(saved.location);
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      const cleanLinks = links.map((l) => l.trim()).filter(Boolean);
      const cleanBio = bio.trim().slice(0, 160);
      const cleanLocation = location.trim();
      const result = await updateProfileAction({
        backdrop: backdrop
          ? { mediaType: backdrop.mediaType, tmdbId: backdrop.tmdbId, imagePath: backdrop.imagePath }
          : null,
        avatarImagePath,
        accent,
        bio: cleanBio,
        links: cleanLinks,
        location: cleanLocation,
      });
      if (result.ok) {
        toast.success("Profile updated");
        trackAction({ action: "profile_customize", metadata: { accent, hasBackdrop: backdrop !== null } });
        setSaved({ backdrop, avatarImagePath, accent, bio: cleanBio, links: cleanLinks, location: cleanLocation });
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Couldn't save profile");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="space-y-6 p-4 md:p-6">
        {/* Live preview — updates as you edit */}
        <div className="space-y-2">
          <Label>Preview</Label>
          <ProfileEditorPreview
            displayName={settings.displayName}
            username={settings.username}
            backdropImagePath={backdrop?.imagePath ?? null}
            avatarUrl={avatarUrl}
            accent={accent}
            bio={bio}
            location={location}
          />
        </div>

        {/* Backdrop */}
        <div className="space-y-2">
          <Label>Profile backdrop</Label>
          <BackdropPicker current={backdrop} onSelect={setBackdrop} onPostersLoaded={setPosterOptions} />
          {backdrop && (
            <button
              type="button"
              onClick={() => setBackdrop(null)}
              className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Remove backdrop
            </button>
          )}
        </div>

        {/* Avatar */}
        <div className="space-y-2">
          <Label>Avatar</Label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAvatarImagePath(null)}
              className={cn(
                "rounded-full border-2 p-0.5 transition-colors",
                avatarImagePath === null ? "border-brand" : "border-transparent hover:border-border"
              )}
              aria-label="Use Google photo"
            >
              <Avatar className="size-12">
                {settings.googleImageUrl && (
                  <AvatarImage src={settings.googleImageUrl} alt="" referrerPolicy="no-referrer" />
                )}
                <AvatarFallback className="text-xs">{settings.displayName.slice(0, 2)}</AvatarFallback>
              </Avatar>
            </button>
            {posterOptions.map((path) => (
              <button
                key={path}
                type="button"
                onClick={() => setAvatarImagePath(path)}
                className={cn(
                  "rounded-full border-2 p-0.5 transition-colors",
                  avatarImagePath === path ? "border-brand" : "border-transparent hover:border-border"
                )}
                aria-label="Use this artwork as avatar"
              >
                <span className="relative block size-12 overflow-hidden rounded-full bg-muted">
                  <Image src={`${TMDB_IMAGE_BASE}/w185${path}`} alt="" fill className="object-cover" sizes="48px" />
                </span>
              </button>
            ))}
          </div>
          <p className="text-xs font-medium text-muted-foreground">
            {posterOptions.length > 0
              ? "Pick a poster as your avatar, or keep your Google photo."
              : "Using your Google photo. Choose a backdrop title above to pick poster art instead."}
          </p>
        </div>

        {/* Accent */}
        <div className="space-y-2">
          <Label>Accent color</Label>
          <div className="flex flex-wrap gap-2">
            {PROFILE_ACCENT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-label={option.label}
                title={option.label}
                onClick={() => setAccent(option.value)}
                className={cn(
                  "flex size-10 items-center justify-center rounded-full border-2 transition-transform active:scale-95",
                  accent === option.value ? "border-foreground" : "border-transparent"
                )}
                style={{ backgroundColor: PROFILE_ACCENT_VARS[option.value].brand }}
              >
                {accent === option.value && <Check className="h-4 w-4 text-black/80" />}
              </button>
            ))}
          </div>
        </div>

        {/* Bio / links / location */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="profile-bio">Bio</Label>
            <span className="text-xs font-medium text-muted-foreground tabular-nums">{bio.trim().length}/160</span>
          </div>
          <textarea
            id="profile-bio"
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, 160))}
            rows={3}
            className="w-full rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="160 characters about your taste"
          />
        </div>
        <div className="space-y-2">
          <Label>Links (up to 3)</Label>
          {links.map((link, i) => (
            <Input
              key={i}
              value={link}
              type="url"
              inputMode="url"
              placeholder="https://"
              className="h-10"
              onChange={(e) => setLinks((prev) => prev.map((p, j) => (j === i ? e.target.value : p)))}
            />
          ))}
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-location">Location</Label>
          <Input
            id="profile-location"
            value={location}
            onChange={(e) => setLocation(e.target.value.slice(0, 60))}
            className="h-10"
            placeholder="City, Country"
          />
        </div>
      </div>

      {/* Save footer — contextual to this card, gated on unsaved changes. */}
      <div className="flex items-center justify-between gap-3 border-t bg-card/60 px-4 py-3 md:px-6">
        <span className="text-xs font-medium text-muted-foreground">
          {dirty ? "Unsaved changes" : "All changes saved"}
        </span>
        <div className="flex items-center gap-2">
          {dirty && !busy && (
            <Button variant="ghost" size="sm" className="h-10" onClick={handleDiscard}>
              Discard
            </Button>
          )}
          <Button className="h-10 min-w-28" disabled={busy || !dirty} onClick={() => void handleSave()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : dirty ? "Save changes" : "Saved"}
          </Button>
        </div>
      </div>
    </div>
  );
}
