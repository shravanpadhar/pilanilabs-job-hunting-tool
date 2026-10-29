"use client";

import { Coins } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api-client";

interface Billing {
  balance: number;
  perTarget: number;
  canBuy: boolean;
  packs: Array<{ id: string; credits: number }>;
}

/** Credit balance. Outreach costs credits (one per person contacted); the workspace itself stays free. */
export function CreditsCard() {
  const [b, setB] = useState<Billing | null>(null);
  const load = useCallback(async () => setB(await api<Billing>("/api/billing")), []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    load().catch(() => undefined);
  }, [load]);
  if (!b) return null;

  async function buy(packId: string) {
    try {
      await api("/api/billing", { method: "POST", json: { action: "buy", packId } });
      toast.success("Credits added");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Card className="space-y-2 p-5" data-testid="credits-card">
      <div className="flex items-center gap-2">
        <Coins className="size-5 text-gold-ink" aria-hidden />
        <h2 className="text-xl font-semibold">Outreach credits</h2>
      </div>
      <p className="text-sm">
        <strong data-testid="credit-balance">{b.balance}</strong> credits left. Each person you contact uses {b.perTarget} {b.perTarget === 1 ? "credit" : "credits"}, and it is refunded if their email turns out to be undeliverable.
      </p>
      {b.canBuy ? (
        <div className="flex flex-wrap gap-2">
          {b.packs.map((p) => <Button key={p.id} size="sm" variant="secondary" onClick={() => buy(p.id)}>Add {p.credits} credits (demo)</Button>)}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Need more? Contact support to add credits.</p>
      )}
    </Card>
  );
}
