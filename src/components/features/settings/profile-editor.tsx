"use client";

import { useState } from "react";
import Image from "next/image";
import { Loader2 } from "lucide-react";
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

interface ProfileEditorProps {
  settings: OwnProfileSettingsDTO;
}

/** Profile customization: backdrop, avatar (Google or TMDB art), accent, bio, links. */
export function ProfileEditor({ settings }: ProfileEditorProps) {
  const c = settings.customization;
  const [backdrop, setBackdrop] = useState<BackdropSelection | null>(
    c.backdrop
      ? { mediaType: c.backdrop.mediaType, tmdbId: c.backdrop.tmdbId, imagePath: c.backdrop.imagePath, titleName: "" }
      : null
  );
  const [avatarImagePath, setAvatarImagePath] = useState<string | null>(c.avatarImagePath);
  const [posterOptions, setPosterOptions] = useState<string[]>([]);
  const [accent, setAccent] = useState<ProfileAccent>(c.accent);
  const [bio, setBio] = useState(c.bio);
  const [links, setLinks] = useState<string[]>([...c.links, "", "", ""].slice(0, 3));
  const [location, setLocation] = useState(c.location);
  const [busy, setBusy] = useState(false);
  const { trackAction } = useAnalytics();

  const handleSave = async () => {
    setBusy(true);
    try {
      const result = await updateProfileAction({
        backdrop: backdrop
          ? { mediaType: backdrop.mediaType, tmdbId: backdrop.tmdbId, imagePath: backdrop.imagePath }
          : null,
        avatarImagePath,
        accent,
        bio: bio.trim().slice(0, 160),
        links: links.map((l) => l.trim()).filter(Boolean),
        location: location.trim(),
      });
      if (result.ok) {
        toast.success("Profile updated");
        trackAction({ action: "profile_customize", metadata: { accent, hasBackdrop: backdrop !== null } });
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
    <div className="space-y-6">
      {/* Backdrop */}
      <div className="space-y-2">
        <Label>Profile backdrop</Label>
        {backdrop && (
          <div className="relative aspect-video w-full max-w-sm overflow-hidden rounded-lg bg-muted">
            <Image
              src={`${TMDB_IMAGE_BASE}/w780${backdrop.imagePath}`}
              alt="Current backdrop"
              fill
              className="object-cover"
              sizes="384px"
            />
          </div>
        )}
        <BackdropPicker current={backdrop} onSelect={setBackdrop} onPostersLoaded={setPosterOptions} />
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
          Google photo, or pick artwork after choosing a backdrop title.
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
              onClick={() => setAccent(option.value)}
              className={cn(
                "size-10 rounded-full border-2 transition-transform active:scale-95",
                accent === option.value ? "border-foreground" : "border-transparent"
              )}
              style={{ backgroundColor: PROFILE_ACCENT_VARS[option.value].brand }}
            />
          ))}
        </div>
      </div>

      {/* Bio / links / location */}
      <div className="space-y-2">
        <Label htmlFor="profile-bio">Bio</Label>
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

      <Button className="h-10" disabled={busy} onClick={() => void handleSave()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save profile"}
      </Button>
    </div>
  );
}
