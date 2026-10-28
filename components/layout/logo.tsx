import Image from "next/image";
import Link from "next/link";

/** The supplied PilaniLabs logo (static asset in /public). In dark mode it sits on a light plate so it stays legible. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`inline-flex items-center ${className}`} aria-label="PilaniLabs home">
      <Image
        src="/pilanilabs-logo.png"
        alt="PilaniLabs, AI Training and Consulting"
        width={695}
        height={163}
        priority
        className="h-10 w-auto rounded-md dark:bg-white dark:px-2 dark:py-0.5"
      />
    </Link>
  );
}
