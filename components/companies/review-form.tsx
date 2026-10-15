"use client";

import { Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field, Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";

export interface ReviewDraft {
  rating: number;
  title: string;
  pros: string;
  cons: string;
  roleTitle: string;
  relationship: "CURRENT" | "FORMER" | "INTERVIEWED";
}

export function ReviewForm({ slug, initial }: { slug: string; initial?: ReviewDraft }) {
  const router = useRouter();
  const [v, setV] = useState<ReviewDraft>(initial ?? { rating: 0, title: "", pros: "", cons: "", roleTitle: "", relationship: "CURRENT" });
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (v.rating < 1) return toast.error("Please choose a star rating.");
    setBusy(true);
    try {
      await api(`/api/companies/${slug}/reviews`, { method: "POST", json: v });
      toast.success(initial ? "Review updated" : "Thanks — your review is live");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset>
        <legend className="mb-1 text-sm font-semibold">Overall rating</legend>
        <div className="flex gap-1" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={v.rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => setV({ ...v, rating: n })} className="rounded p-1">
              <Star className={`size-7 ${n <= v.rating ? "fill-primary text-primary" : "text-input-border"}`} />
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your connection" htmlFor="rv-rel">
          <Select id="rv-rel" value={v.relationship} onChange={(e) => setV({ ...v, relationship: e.target.value as ReviewDraft["relationship"] })}>
            <option value="CURRENT">Current employee</option>
            <option value="FORMER">Former employee</option>
            <option value="INTERVIEWED">Interviewed here</option>
          </Select>
        </Field>
        <Field label="Your role (optional)" htmlFor="rv-role">
          <Input id="rv-role" maxLength={100} value={v.roleTitle} onChange={(e) => setV({ ...v, roleTitle: e.target.value })} />
        </Field>
      </div>
      <Field label="Headline" htmlFor="rv-title">
        <Input id="rv-title" required maxLength={120} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="rv-pros">Pros</Label>
          <Textarea id="rv-pros" required rows={4} maxLength={1500} value={v.pros} onChange={(e) => setV({ ...v, pros: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rv-cons">Cons</Label>
          <Textarea id="rv-cons" required rows={4} maxLength={1500} value={v.cons} onChange={(e) => setV({ ...v, cons: e.target.value })} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Be honest and specific. Don&apos;t share confidential information or personal details about colleagues. Your name is never shown.</p>
      <Button type="submit" loading={busy}>
        {initial ? "Update review" : "Post review"}
      </Button>
    </form>
  );
}
