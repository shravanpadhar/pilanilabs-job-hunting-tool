"use client";

import { ExternalLink, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/input";
import { api } from "@/lib/api-client";

export interface SavedSearchView {
  id: string;
  name: string;
  description: string;
  query: string;
  alertFrequency: "OFF" | "DAILY" | "WEEKLY";
  alertEmail: boolean;
  alertWhatsapp: boolean;
  lastAlertAt: string | null;
}

export function SavedSearchList({ initial }: { initial: SavedSearchView[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);

  async function patch(id: string, data: Partial<Pick<SavedSearchView, "alertFrequency" | "alertEmail" | "alertWhatsapp">>) {
    const prev = items;
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...data } : x)));
    try {
      await api(`/api/saved-searches/${id}`, { method: "PATCH", json: data });
    } catch (e) {
      setItems(prev);
      toast.error((e as Error).message);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this saved search?")) return;
    try {
      await api(`/api/saved-searches/${id}`, { method: "DELETE" });
      setItems((xs) => xs.filter((x) => x.id !== id));
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <ul className="grid gap-3">
      {items.map((s) => (
        <li key={s.id}>
          <Card className="space-y-3 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-sans text-lg font-semibold">{s.name}</h3>
                <p className="text-sm text-muted-foreground">{s.description}</p>
              </div>
              <div className="flex gap-2">
                <Button asChild variant="secondary" size="sm">
                  <Link href={`/jobs${s.query ? `?${s.query}` : ""}`}>
                    <ExternalLink /> Open
                  </Link>
                </Button>
                <Button variant="ghost" size="icon" className="size-9 text-danger" aria-label={`Delete ${s.name}`} onClick={() => remove(s.id)}>
                  <Trash2 />
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-3">
              <label className="flex items-center gap-2 text-sm font-semibold" htmlFor={`freq-${s.id}`}>
                Alerts
                <Select id={`freq-${s.id}`} className="h-9 w-32 py-0 text-sm" value={s.alertFrequency} onChange={(e) => patch(s.id, { alertFrequency: e.target.value as SavedSearchView["alertFrequency"] })}>
                  <option value="OFF">Off</option>
                  <option value="DAILY">Daily</option>
                  <option value="WEEKLY">Weekly</option>
                </Select>
              </label>
              {s.alertFrequency !== "OFF" ? (
                <>
                  <Checkbox label="Email" checked={s.alertEmail} onChange={(e) => patch(s.id, { alertEmail: e.target.checked })} />
                  <Checkbox label="WhatsApp" checked={s.alertWhatsapp} onChange={(e) => patch(s.id, { alertWhatsapp: e.target.checked })} />
                </>
              ) : null}
              {s.lastAlertAt ? <span className="text-xs text-muted-foreground">Last alert {new Date(s.lastAlertAt).toLocaleDateString("en-IN")}</span> : null}
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
