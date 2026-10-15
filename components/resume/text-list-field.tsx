"use client";

import { useState } from "react";
import { Input, Textarea } from "@/components/ui/input";

const clean = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean);

/**
 * Edits a string[] as free text (one item per line, or comma separated) without fighting the cursor:
 * the raw text is local state, the parsed array flows up. Remount with a new `key` to reset from props.
 */
export function TextListField({
  id,
  value,
  onChange,
  mode = "lines",
  rows = 4,
  placeholder,
  "aria-label": ariaLabel,
}: {
  id: string;
  value: string[];
  onChange: (next: string[]) => void;
  mode?: "lines" | "commas";
  rows?: number;
  placeholder?: string;
  "aria-label"?: string;
}) {
  const sep = mode === "lines" ? "\n" : ", ";
  const [text, setText] = useState(value.join(sep));
  const parse = (t: string) => clean(t.split(mode === "lines" ? "\n" : ","));

  if (mode === "commas") {
    return <Input id={id} aria-label={ariaLabel} value={text} placeholder={placeholder} onChange={(e) => { setText(e.target.value); onChange(parse(e.target.value)); }} />;
  }
  return (
    <Textarea
      id={id}
      aria-label={ariaLabel}
      rows={rows}
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parse(e.target.value));
      }}
    />
  );
}
