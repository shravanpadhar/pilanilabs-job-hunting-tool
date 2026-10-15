"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";

export function AddBoardForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api<{ added?: number; total?: number; message?: string }>("/api/boards", { method: "POST", json: { url } });
      toast.success(res.message ?? `Added — found ${res.total ?? 0} openings (${res.added ?? 0} new).`);
      setUrl("");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-1.5">
      <Label htmlFor="board-url">Track another company&apos;s career page</Label>
      <div className="flex gap-2">
        <Input id="board-url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://boards.greenhouse.io/company · jobs.lever.co/company · jobs.ashbyhq.com/company" />
        <Button type="submit" loading={busy}>
          <Plus /> Add
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Works with public Greenhouse, Lever and Ashby job boards. Jobs are refreshed every few hours.</p>
    </form>
  );
}
