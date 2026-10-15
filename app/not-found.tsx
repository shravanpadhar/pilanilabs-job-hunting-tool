import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/notice";

export default function NotFound() {
  return (
    <EmptyState
      title="We couldn't find that page"
      action={
        <Button asChild>
          <Link href="/jobs">Back to jobs</Link>
        </Button>
      }
    >
      The job may have been removed, or the link is out of date.
    </EmptyState>
  );
}
