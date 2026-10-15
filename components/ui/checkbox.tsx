import * as React from "react";
import { cn } from "@/lib/utils";

/** Native checkbox with a visible label — keyboard and screen-reader friendly by default. */
export function Checkbox({ label, className, id, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode }) {
  const autoId = React.useId();
  const inputId = id ?? autoId;
  return (
    <label htmlFor={inputId} className={cn("inline-flex min-h-9 cursor-pointer items-center gap-2 text-sm", className)}>
      <input id={inputId} type="checkbox" className="size-4.5 accent-[#B9832C]" {...props} />
      <span>{label}</span>
    </label>
  );
}
