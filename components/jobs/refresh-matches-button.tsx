"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";

export function RefreshMatchesButton({ label = "Refresh matches" }: { label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const s = await api<{ kept: number; aiScored: number; aiSkippedReason?: string }>("/api/matches/refresh", { method: "POST" });
          toast.success(`${s.kept} matches updated${s.aiScored ? ` · ${s.aiScored} scored by AI` : ""}`);
          if (s.aiSkippedReason && s.aiSkippedReason !== "skipped") toast.info(s.aiSkippedReason);
          router.refresh();
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {!busy ? <RefreshCw /> : null} {label}
    </Button>
  );
}
