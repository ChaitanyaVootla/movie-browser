"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";
import { useAnalytics } from "@/hooks/use-analytics";
import { checkUsernameAvailability, claimUsernameAction } from "@/server/actions/profile";
import { isValidUsername, normalizeUsername } from "@/lib/tracking-format";

interface UsernameFormProps {
  currentUsername: string | null;
  /** Prior handles left behind on username changes, newest-first. */
  previousUsernames?: string[];
  /** Called after a successful claim (e.g. close the first-run prompt). */
  onClaimed?: (username: string) => void;
}

type Availability = "idle" | "checking" | "available" | "taken" | "invalid";

/** Claim (or change) username: live availability, lowercase a-z 0-9 _ , 3-20. */
export function UsernameForm({ currentUsername, previousUsernames = [], onClaimed }: UsernameFormProps) {
  const [value, setValue] = useState(currentUsername ?? "");
  const [availability, setAvailability] = useState<Availability>("idle");
  const [busy, setBusy] = useState(false);
  const [claimed, setClaimed] = useState(currentUsername);
  const debounced = useDebounce(value, 400);
  const { trackAction } = useAnalytics();

  useEffect(() => {
    const candidate = normalizeUsername(debounced);
    if (!candidate || candidate === claimed) {
      setAvailability("idle");
      return;
    }
    if (!isValidUsername(candidate)) {
      setAvailability("invalid");
      return;
    }
    let cancelled = false;
    setAvailability("checking");
    checkUsernameAvailability(candidate)
      .then((result) => {
        if (!cancelled) setAvailability(result.available ? "available" : "taken");
      })
      .catch(() => {
        if (!cancelled) setAvailability("idle");
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, claimed]);

  const handleClaim = async () => {
    const candidate = normalizeUsername(value);
    if (!isValidUsername(candidate)) return;
    setBusy(true);
    try {
      const result = await claimUsernameAction({ username: candidate });
      if (result.ok) {
        setClaimed(candidate);
        setAvailability("idle");
        toast.success(`You're @${candidate}`);
        trackAction({ action: "username_claim", metadata: { username: candidate } });
        onClaimed?.(candidate);
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Couldn't claim username");
    } finally {
      setBusy(false);
    }
  };

  const normalized = normalizeUsername(value);
  const isError = availability === "taken" || availability === "invalid";

  // State-driven input border: green when available, red when taken/invalid.
  // We override the focus-visible variants too so the colour holds while the
  // field is focused (the user is mid-typing when these states fire).
  const inputStateClass =
    availability === "available"
      ? "border-success focus-visible:border-success focus-visible:ring-success/30"
      : isError
        ? "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/30"
        : "";

  // The status glyph; keyed so each swap replays a gentle fade+scale (no bounce).
  const statusIcon =
    availability === "checking" ? (
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
    ) : availability === "available" ? (
      <Check className="h-4 w-4 text-success" />
    ) : isError ? (
      <X className="h-4 w-4 text-destructive" />
    ) : null;

  return (
    <div className="space-y-2">
      <Label htmlFor="username-input">Username</Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            @
          </span>
          <Input
            id="username-input"
            value={value}
            onChange={(e) => setValue(normalizeUsername(e.target.value))}
            placeholder="yourname"
            maxLength={20}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={isError}
            aria-describedby="username-help"
            className={cn("h-10 pl-8 pr-9", inputStateClass)}
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
            {statusIcon && (
              <span
                key={availability}
                className="block animate-in fade-in-0 zoom-in-95 duration-200"
              >
                {statusIcon}
              </span>
            )}
          </span>
        </div>
        <Button
          className="h-10"
          disabled={busy || availability !== "available"}
          onClick={() => void handleClaim()}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : claimed ? "Change" : "Claim"}
        </Button>
      </div>
      <p id="username-help" role="status" aria-live="polite" className="text-xs font-medium">
        {availability === "checking" ? (
          <span className="text-muted-foreground">Checking availability…</span>
        ) : availability === "available" ? (
          <span className="text-success">@{normalized} is available</span>
        ) : availability === "taken" ? (
          <span className="text-destructive">That one&rsquo;s taken — try another.</span>
        ) : availability === "invalid" ? (
          <span className="text-muted-foreground">3–20 characters: a–z, 0–9, underscore.</span>
        ) : claimed ? (
          <span className="text-muted-foreground">
            Your profile:{" "}
            <Link href={`/u/${claimed}`} className="text-brand hover:underline">
              themoviebrowser.com/u/{claimed}
            </Link>
          </span>
        ) : (
          <span className="text-muted-foreground">
            Claim a username to unlock your public profile.
          </span>
        )}
      </p>
      {previousUsernames.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Previous usernames:{" "}
          {previousUsernames.map((u) => `@${u}`).join(", ")}
        </p>
      )}
    </div>
  );
}
