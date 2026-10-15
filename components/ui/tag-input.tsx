"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** Type a value and press Enter or comma to add it as a removable chip. */
export function TagInput({
  id,
  value,
  onChange,
  placeholder,
  max = 15,
  suggestions = [],
  className,
}: {
  id: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  max?: number;
  suggestions?: string[];
  className?: string;
}) {
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const v = raw.trim().replace(/,$/, "").trim();
    if (!v || value.some((x) => x.toLowerCase() === v.toLowerCase()) || value.length >= max) return;
    onChange([...value, v]);
    setDraft("");
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-input border border-input-border bg-input px-2.5 py-1.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-link py-0.5 pl-2.5 pr-1 text-sm font-medium text-secondary dark:text-foreground">
            {t}
            <button type="button" className="rounded-full p-0.5 hover:bg-black/10" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}>
              <X className="size-3.5" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          placeholder={value.length ? "" : placeholder}
          className="min-w-32 flex-1 bg-transparent py-1 text-base outline-none placeholder:text-muted-foreground/80"
          onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => add(draft)}
        />
      </div>
      {suggestions.length ? (
        <div className="flex flex-wrap gap-1.5">
          {suggestions
            .filter((s) => !value.some((x) => x.toLowerCase() === s.toLowerCase()))
            .slice(0, 8)
            .map((s) => (
              <button key={s} type="button" onClick={() => add(s)} className="rounded-full border border-dashed px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-muted">
                + {s}
              </button>
            ))}
        </div>
      ) : null}
    </div>
  );
}
