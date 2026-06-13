"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getUsernameStatus } from "@/server/actions/profile";
import { UsernameForm } from "./username-form";

const SNOOZE_KEY = "username-prompt-snoozed";

/**
 * First-time username prompt: shows once per device for authenticated users
 * without a username. Mounted in the root layout; renders nothing otherwise.
 */
export function UsernameClaimPrompt() {
  const { status } = useSession();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(SNOOZE_KEY) === "1") return;
    let cancelled = false;
    getUsernameStatus()
      .then((result) => {
        if (!cancelled && result.username === null) setOpen(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [status]);

  const snooze = () => {
    window.localStorage.setItem(SNOOZE_KEY, "1");
    setOpen(false);
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : snooze())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Claim your username</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Get your public profile at themoviebrowser.com/u/yourname — your diary,
          favorites, and reviews in one shareable place.
        </p>
        <UsernameForm currentUsername={null} onClaimed={() => setOpen(false)} />
        <Button variant="ghost" size="sm" className="w-full" onClick={snooze}>
          Maybe later
        </Button>
      </DialogContent>
    </Dialog>
  );
}
