"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function OptOutForm({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  async function confirm() {
    setState("busy");
    try {
      const res = await fetch(`/api/optout/${encodeURIComponent(token)}`, { method: "POST" });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }
  if (state === "done") return <p role="status" className="font-semibold text-success">Done. You will not receive further emails from this sender.</p>;
  return (
    <div className="space-y-2">
      <Button onClick={confirm} loading={state === "busy"}>Yes, stop emailing me</Button>
      {state === "error" ? <p role="alert" className="text-sm text-danger">Something went wrong. Please reply &quot;unsubscribe&quot; to the email instead.</p> : null}
    </div>
  );
}
