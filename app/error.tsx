"use client";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/notice";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState title="Something went wrong" action={<Button onClick={reset}>Try again</Button>}>
      We hit an unexpected problem loading this page. It&apos;s been logged{error.digest ? ` (ref ${error.digest})` : ""}. Try again, or come back in a moment.
    </EmptyState>
  );
}
