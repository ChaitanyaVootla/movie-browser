"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAnalytics } from "@/hooks/use-analytics";

/** Full CSV export of own data — the trust mirror of lossless imports (§4.2). */
export function ExportDataButton() {
  const { trackAction } = useAnalytics();
  return (
    <Button asChild variant="outline" className="gap-1.5">
      <a
        href="/api/user/export"
        download
        onClick={() => trackAction({ action: "export_data" })}
      >
        <Download className="h-4 w-4" /> Export my data (CSV zip)
      </a>
    </Button>
  );
}
