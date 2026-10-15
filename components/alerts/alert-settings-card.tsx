"use client";

import { BellRing, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { api } from "@/lib/api-client";

export interface AlertSettings {
  alertFrequency: "OFF" | "DAILY" | "WEEKLY";
  alertEmail: boolean;
  alertWhatsapp: boolean;
  whatsappNumber: string;
  alertMinScore: number;
}

export function AlertSettingsCard({ initial, emailEnabled, whatsappEnabled, email }: { initial: AlertSettings; emailEnabled: boolean; whatsappEnabled: boolean; email: string }) {
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState<"email" | "whatsapp" | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/alerts", { method: "PUT", json: { ...s, whatsappNumber: s.whatsappNumber.trim() || null } });
      toast.success("Alert settings saved");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function test(channel: "email" | "whatsapp") {
    setTesting(channel);
    try {
      await api("/api/alerts/test", { method: "POST", json: { channel } });
      toast.success(`Test sent to ${channel === "email" ? email : s.whatsappNumber}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setTesting(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><BellRing className="size-5 text-gold-ink" aria-hidden /> Top-matches digest</CardTitle>
        <CardDescription>The best new jobs from your feed, delivered on a schedule. Daily alerts go out around 9:00 AM IST; weekly on Mondays.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="How often" htmlFor="al-freq">
              <Select id="al-freq" value={s.alertFrequency} onChange={(e) => setS({ ...s, alertFrequency: e.target.value as AlertSettings["alertFrequency"] })}>
                <option value="OFF">Off</option>
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
              </Select>
            </Field>
            <Field label="Only matches scoring at least" htmlFor="al-score">
              <Select id="al-score" value={s.alertMinScore} onChange={(e) => setS({ ...s, alertMinScore: Number(e.target.value) })}>
                {[50, 60, 70, 80, 90].map((n) => (
                  <option key={n} value={n}>{n}+</option>
                ))}
              </Select>
            </Field>
          </div>

          <fieldset className="space-y-1">
            <legend className="text-sm font-semibold">Where to send</legend>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
              <Checkbox label={`Email (${email})`} checked={s.alertEmail} onChange={(e) => setS({ ...s, alertEmail: e.target.checked })} />
              <Checkbox label="WhatsApp" checked={s.alertWhatsapp} onChange={(e) => setS({ ...s, alertWhatsapp: e.target.checked })} />
            </div>
            {!emailEnabled ? <p className="text-xs text-warning">Email delivery isn&apos;t set up on this server yet (RESEND_API_KEY).</p> : null}
            {!whatsappEnabled ? <p className="text-xs text-warning">WhatsApp delivery isn&apos;t set up on this server yet (Twilio).</p> : null}
          </fieldset>

          {s.alertWhatsapp ? (
            <Field label="WhatsApp number" htmlFor="al-wa" hint="International format, e.g. +919876543210. With the Twilio sandbox you must first send the join code from this number.">
              <Input id="al-wa" type="tel" inputMode="tel" placeholder="+919876543210" value={s.whatsappNumber} onChange={(e) => setS({ ...s, whatsappNumber: e.target.value })} />
            </Field>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={busy}>Save alerts</Button>
            {emailEnabled ? (
              <Button type="button" variant="outline" onClick={() => test("email")} loading={testing === "email"}><Send /> Send test email</Button>
            ) : null}
            {whatsappEnabled && s.alertWhatsapp && s.whatsappNumber ? (
              <Button type="button" variant="outline" onClick={() => test("whatsapp")} loading={testing === "whatsapp"}><Send /> Send test WhatsApp</Button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
