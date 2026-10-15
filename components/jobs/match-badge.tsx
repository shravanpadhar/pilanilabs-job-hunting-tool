import { cn } from "@/lib/utils";

export function scoreTone(score: number) {
  if (score >= 80) return { ring: "border-success text-success", label: "Strong match" };
  if (score >= 60) return { ring: "border-primary text-gold-ink", label: "Good match" };
  return { ring: "border-input-border text-muted-foreground", label: "Partial match" };
}

/** Circular 0–100 match score. */
export function MatchBadge({ score, size = "md", ai = false }: { score: number; size?: "md" | "lg"; ai?: boolean }) {
  const tone = scoreTone(score);
  return (
    <span
      role="img"
      aria-label={`${tone.label}: ${score} out of 100${ai ? ", AI scored" : ""}`}
      className={cn("grid shrink-0 place-items-center rounded-full border-2 bg-card font-heading font-bold", tone.ring, size === "lg" ? "size-20 text-3xl" : "size-12 text-lg")}
    >
      {score}
    </span>
  );
}
