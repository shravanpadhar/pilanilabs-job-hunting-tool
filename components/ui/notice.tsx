import * as React from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const styles = {
  info: { icon: Info, cls: "border-link bg-link/40 text-foreground" },
  warning: { icon: AlertTriangle, cls: "border-warning/50 bg-warning/10 text-foreground" },
  success: { icon: CheckCircle2, cls: "border-success/50 bg-success/10 text-foreground" },
} as const;

export function Notice({ tone = "info", title, children, className }: { tone?: keyof typeof styles; title?: string; children?: React.ReactNode; className?: string }) {
  const { icon: Icon, cls } = styles[tone];
  return (
    <div role={tone === "warning" ? "alert" : "status"} className={cn("flex gap-3 rounded-card border p-4 text-sm", cls, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="space-y-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="text-muted-foreground">{children}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: React.ReactNode; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed bg-card/60 px-6 py-14 text-center">
      {icon ? <div className="text-gold-ink">{icon}</div> : null}
      <h3 className="font-heading text-xl font-semibold">{title}</h3>
      {children ? <p className="max-w-md text-sm text-muted-foreground">{children}</p> : null}
      {action}
    </div>
  );
}
