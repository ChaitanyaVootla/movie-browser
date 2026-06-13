"use client";

import { useState } from "react";
import { LayoutGrid, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProfileViewer } from "./profile-viewer-context";
import { ProfileSettingsDialog } from "./profile-settings-dialog";

/**
 * Owner-only hero actions — "Customize" enters dashboard edit mode (handled by
 * ProfileDashboardSwitch), "Settings" opens the on-profile settings MODAL
 * (appearance/backdrop/account/privacy — no page nav). Client-resolved
 * (cache-safe). Hidden while editing — the editor has its own toolbar.
 */
export function OwnerActions() {
  const { isOwner, editMode, setEditMode } = useProfileViewer();
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (!isOwner || editMode) return null;

  const pill =
    "h-10 gap-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/20 backdrop-blur-sm";

  return (
    <>
      <Button size="sm" className={pill} onClick={() => setEditMode(true)}>
        <LayoutGrid className="h-3.5 w-3.5" /> Customize
      </Button>
      <Button size="sm" variant="secondary" className={pill} onClick={() => setSettingsOpen(true)}>
        <Settings className="h-3.5 w-3.5" /> Settings
      </Button>
      <ProfileSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
