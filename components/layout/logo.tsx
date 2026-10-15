import Link from "next/link";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`inline-flex items-center gap-2 ${className}`} aria-label="Pilanilabs home">
      <span aria-hidden className="grid size-8 place-items-center rounded-[6px] bg-secondary font-heading text-lg font-bold text-primary dark:bg-link dark:text-secondary">
        P
      </span>
      <span className="font-heading text-xl font-semibold tracking-tight">
        Pilani<span className="text-gold-ink">labs</span>
      </span>
    </Link>
  );
}
