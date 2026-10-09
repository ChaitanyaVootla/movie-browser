"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAnalytics } from "@/hooks/use-analytics";
import { setPrivacyDefaultsAction, setTasteVisibilityAction } from "@/server/actions/profile";

interface PrivacySettingsProps {
  defaults: { logPrivatelyByDefault: boolean; showTasteProfile?: boolean };
}

function SettingRow({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border bg-card p-4">
      <div>
        <Label htmlFor={id} className="font-medium">
          {label}
        </Label>
        <p className="text-xs font-medium text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export function PrivacySettings({ defaults }: PrivacySettingsProps) {
  const [logPrivately, setLogPrivately] = useState(defaults.logPrivatelyByDefault);
  const [showTaste, setShowTaste] = useState(defaults.showTasteProfile ?? true);
  const { trackAction } = useAnalytics();

  const handleLogPrivately = async (next: boolean) => {
    setLogPrivately(next);
    try {
      const result = await setPrivacyDefaultsAction({ logPrivatelyByDefault: next });
      if (!result.ok) throw new Error(result.error);
      trackAction({
        action: "settings_change",
        metadata: { setting: "logPrivatelyByDefault", value: next },
      });
    } catch {
      setLogPrivately(!next);
      toast.error("Couldn't save setting");
    }
  };

  const handleShowTaste = async (next: boolean) => {
    setShowTaste(next);
    try {
      const result = await setTasteVisibilityAction({ show: next });
      if (!result.ok) throw new Error(result.error);
      trackAction({
        action: "settings_change",
        metadata: { setting: "showTasteProfile", value: next },
      });
    } catch {
      setShowTaste(!next);
      toast.error("Couldn't save setting");
    }
  };

  return (
    <div className="space-y-3">
      <SettingRow
        id="privacy-default"
        label="Log privately by default"
        description="New diary entries start as private. You can flip each entry individually."
        checked={logPrivately}
        onChange={(v) => void handleLogPrivately(v)}
      />
      <SettingRow
        id="privacy-taste"
        label="Show taste profile on my public profile"
        description="Taste DNA, moods, people and clusters. Built only from public activity; private entries and your watchlist never count."
        checked={showTaste}
        onChange={(v) => void handleShowTaste(v)}
      />
    </div>
  );
}
