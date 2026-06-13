"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAnalytics } from "@/hooks/use-analytics";
import { setPrivacyDefaultsAction } from "@/server/actions/profile";

interface PrivacySettingsProps {
  defaults: { logPrivatelyByDefault: boolean };
}

export function PrivacySettings({ defaults }: PrivacySettingsProps) {
  const [logPrivately, setLogPrivately] = useState(defaults.logPrivatelyByDefault);
  const { trackAction } = useAnalytics();

  const handleChange = async (next: boolean) => {
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

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border bg-card p-4">
      <div>
        <Label htmlFor="privacy-default" className="font-medium">
          Log privately by default
        </Label>
        <p className="text-xs font-medium text-muted-foreground">
          New diary entries start as private. You can flip each entry individually.
        </p>
      </div>
      <Switch
        id="privacy-default"
        checked={logPrivately}
        onCheckedChange={(v) => void handleChange(v)}
      />
    </div>
  );
}
