"use client";

import { useState } from "react";
import Image from "next/image";
import { Check, ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useAnalytics } from "@/hooks/use-analytics";
import { updateProfileAction } from "@/server/actions/profile";
import { PROFILE_ACCENT_OPTIONS, PROFILE_ACCENT_VARS } from "@/lib/profile-accents";
import { TMDB_IMAGE_BASE } from "@/lib/constants";
import type { AvatarCrop } from "@/lib/avatar-crop";
import type { OwnProfileSettingsDTO, ProfileAccent, TrackedMediaType } from "@/types/social";
import type { PickedImage } from "@/types/image-picker";
import { MediaImagePicker } from "@/components/features/media/media-image-picker";
import { AvatarCropper } from "@/components/features/media/avatar-cropper";
import { UserAvatar } from "@/components/features/profile/user-avatar";
import { ProfileEditorPreview } from "./profile-editor-preview";

/** A profile backdrop choice — a TMDB title + the picked backdrop file path. */
export interface BackdropSelection {
  mediaType: TrackedMediaType;
  tmdbId: number;
  titleName: string;
  imagePath: string;
}

interface ProfileEditorProps {
  settings: OwnProfileSettingsDTO;
}

interface EditableProfile {
  backdrop: BackdropSelection | null;
  avatarImagePath: string | null;
  avatarCrop: AvatarCrop | null;
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
    avatarCrop: c.avatarCrop,
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
    crop: p.avatarCrop
      ? `${p.avatarCrop.zoom.toFixed(3)}:${p.avatarCrop.nx.toFixed(3)}:${p.avatarCrop.ny.toFixed(3)}:${p.avatarCrop.r.toFixed(3)}`
      : null,
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
  const [avatarCrop, setAvatarCrop] = useState<AvatarCrop | null>(saved.avatarCrop);
  const [pickerMode, setPickerMode] = useState<"backdrop" | "avatar" | null>(null);
  // The image being framed in the cropper (just picked, or the current avatar
  // re-opened for re-framing). `r` carries its aspect ratio.
  const [cropping, setCropping] = useState<{ imagePath: string; r: number; initial: AvatarCrop | null } | null>(null);
  const [accent, setAccent] = useState<ProfileAccent>(saved.accent);
  const [bio, setBio] = useState(saved.bio);
  const [links, setLinks] = useState<string[]>([...saved.links, "", "", ""].slice(0, 3));
  const [location, setLocation] = useState(saved.location);
  const [busy, setBusy] = useState(false);
  const { trackAction } = useAnalytics();

  const current: EditableProfile = { backdrop, avatarImagePath, avatarCrop, accent, bio, links, location };
  const dirty = signature(current) !== signature(saved);

  const avatarUrl = avatarImagePath
    ? `${TMDB_IMAGE_BASE}/w342${avatarImagePath}`
    : settings.googleImageUrl;

  const handleDiscard = () => {
    setBackdrop(saved.backdrop);
    setAvatarImagePath(saved.avatarImagePath);
    setAvatarCrop(saved.avatarCrop);
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
        avatarCrop: avatarImagePath ? avatarCrop : null,
        accent,
        bio: cleanBio,
        links: cleanLinks,
        location: cleanLocation,
      });
      if (result.ok) {
        toast.success("Profile updated");
        trackAction({ action: "profile_customize", metadata: { accent, hasBackdrop: backdrop !== null } });
        setSaved({ backdrop, avatarImagePath, avatarCrop, accent, bio: cleanBio, links: cleanLinks, location: cleanLocation });
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
            avatarCrop={avatarImagePath ? avatarCrop : null}
            accent={accent}
            bio={bio}
            location={location}
          />
        </div>

        {/* Backdrop */}
        <div className="space-y-2">
          <Label>Profile backdrop</Label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPickerMode("backdrop")}
              className={cn(
                "group relative aspect-video w-40 shrink-0 overflow-hidden rounded-lg border-2 bg-muted transition-colors",
                backdrop ? "border-border hover:border-brand/60" : "border-dashed border-border hover:border-brand/60"
              )}
              aria-label="Choose a backdrop"
            >
              {backdrop ? (
                <Image
                  src={`${TMDB_IMAGE_BASE}/w300${backdrop.imagePath}`}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="160px"
                  unoptimized
                />
              ) : (
                <span className="flex h-full flex-col items-center justify-center gap-1 text-muted-foreground">
                  <ImagePlus className="h-5 w-5" />
                  <span className="text-xs font-medium">Choose</span>
                </span>
              )}
            </button>
            <div className="min-w-0 space-y-1.5">
              <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => setPickerMode("backdrop")}>
                {backdrop ? "Change backdrop" : "Choose backdrop"}
              </Button>
              {backdrop && (
                <button
                  type="button"
                  onClick={() => setBackdrop(null)}
                  className="block text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  Remove backdrop
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Avatar */}
        <div className="space-y-2">
          <Label>Avatar</Label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setAvatarImagePath(null);
                setAvatarCrop(null);
              }}
              className={cn(
                "rounded-full border-2 p-0.5 transition-colors",
                avatarImagePath === null ? "border-brand" : "border-transparent hover:border-border"
              )}
              aria-label="Use Google photo"
            >
              <UserAvatar
                src={settings.googleImageUrl}
                name={settings.displayName}
                className="size-12"
                fallbackClassName="text-xs"
              />
            </button>
            {avatarImagePath && (
              <button
                type="button"
                onClick={() =>
                  avatarCrop
                    ? setCropping({ imagePath: avatarImagePath, r: avatarCrop.r, initial: avatarCrop })
                    : setPickerMode("avatar")
                }
                className="rounded-full border-2 border-brand p-0.5"
                aria-label="Re-frame avatar artwork"
              >
                <UserAvatar
                  src={`${TMDB_IMAGE_BASE}/w342${avatarImagePath}`}
                  crop={avatarCrop}
                  name={settings.displayName}
                  className="size-12"
                  fallbackClassName="text-xs"
                />
              </button>
            )}
            <Button type="button" variant="outline" size="sm" className="h-10" onClick={() => setPickerMode("avatar")}>
              <ImagePlus className="h-4 w-4" />
              Pick artwork
            </Button>
          </div>
          <p className="text-xs font-medium text-muted-foreground">
            Use any poster, still, or cast photo as your avatar — search any title or person, then zoom and frame
            it — or keep your Google photo.
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

      {/* Standardized TMDB image picker — backdrop (movie/series backdrops) or
          avatar (any title poster / any person photo). */}
      <MediaImagePicker
        open={pickerMode !== null}
        onOpenChange={(o) => !o && setPickerMode(null)}
        entityTypes={pickerMode === "backdrop" ? ["movie", "series"] : ["movie", "series", "person"]}
        kinds={pickerMode === "backdrop" ? ["backdrop"] : ["backdrop", "poster", "profile"]}
        selectedPaths={
          pickerMode === "backdrop"
            ? backdrop
              ? [backdrop.imagePath]
              : []
            : avatarImagePath
              ? [avatarImagePath]
              : []
        }
        title={pickerMode === "backdrop" ? "Choose a backdrop" : "Choose your avatar"}
        onPick={(p: PickedImage) => {
          if (pickerMode === "backdrop") {
            setBackdrop({
              mediaType: p.entityType === "series" ? "series" : "movie",
              tmdbId: p.tmdbId,
              titleName: p.entityName,
              imagePath: p.imagePath,
            });
            setPickerMode(null);
          } else {
            // Hand off to the cropper to frame the picked image into the circle.
            setPickerMode(null);
            setCropping({ imagePath: p.imagePath, r: p.aspectRatio, initial: null });
          }
        }}
      />

      {/* Frame the picked (or current) avatar image into the circular crop. */}
      {cropping && (
        <AvatarCropper
          open={cropping !== null}
          onOpenChange={(o) => !o && setCropping(null)}
          src={`${TMDB_IMAGE_BASE}/w780${cropping.imagePath}`}
          aspectRatio={cropping.r}
          initialCrop={cropping.initial}
          onConfirm={(crop) => {
            setAvatarImagePath(cropping.imagePath);
            setAvatarCrop(crop);
            setCropping(null);
          }}
        />
      )}
    </div>
  );
}
