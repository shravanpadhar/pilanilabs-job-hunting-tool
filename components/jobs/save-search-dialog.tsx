"use client";

import { BellPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import { describeFilters, type JobFilters } from "@/lib/jobs/filters";

/** Name the current filters and optionally subscribe to alerts for them. */
export function SaveSearchDialog({ filters }: { filters: JobFilters }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState<"OFF" | "DAILY" | "WEEKLY">("DAILY");
  const [email, setEmail] = useState(true);
  const [whatsapp, setWhatsapp] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/saved-searches", { method: "POST", json: { name, filters, alertFrequency: frequency, alertEmail: email, alertWhatsapp: whatsapp } });
      toast.success(frequency === "OFF" ? "Search saved" : `Search saved — you'll get ${frequency.toLowerCase()} alerts`);
      setOpen(false);
      setName("");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <BellPlus /> Save this search
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Save this search</DialogTitle>
        <DialogDescription>Current filters: {describeFilters(filters)}</DialogDescription>
        <form onSubmit={save} className="mt-4 space-y-4">
          <Field label="Name" htmlFor="ss-name">
            <Input id="ss-name" required maxLength={60} placeholder="e.g. Remote React roles" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <Field label="Alerts" htmlFor="ss-freq" hint="You'll get the top new jobs for this search. Change this any time on the Saved searches page.">
            <Select id="ss-freq" value={frequency} onChange={(e) => setFrequency(e.target.value as typeof frequency)}>
              <option value="OFF">No alerts — just save it</option>
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly (Mondays)</option>
            </Select>
          </Field>
          {frequency !== "OFF" ? (
            <div className="flex flex-wrap gap-x-5">
              <Checkbox label="Email" checked={email} onChange={(e) => setEmail(e.target.checked)} />
              <Checkbox label="WhatsApp" checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)} />
            </div>
          ) : null}
          <Button type="submit" className="w-full" loading={busy}>
            Save search
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
