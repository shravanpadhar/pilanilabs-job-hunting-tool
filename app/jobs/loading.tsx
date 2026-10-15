import { JobCardSkeleton } from "@/components/jobs/job-card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading jobs">
      <div className="space-y-2">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-5 w-80" />
      </div>
      <Skeleton className="h-11 w-full" />
      <div className="grid gap-3">
        {[0, 1, 2, 3].map((i) => (
          <JobCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
