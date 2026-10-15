"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { JobCard, JobCardSkeleton } from "@/components/jobs/job-card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import type { FeedItem, FeedPage } from "@/lib/jobs/query";

type ClientItem = Omit<FeedItem, "job"> & { job: Omit<FeedItem["job"], "postedAt"> & { postedAt: string | Date } };

/**
 * Infinite-scrolling list. The server renders page 1; this fetches subsequent pages as the sentinel
 * scrolls into view. Mount it with `key={query}` so it resets when filters change.
 */
export function JobFeed({ initialItems, initialHasMore, query, feed }: { initialItems: ClientItem[]; initialHasMore: boolean; query: string; feed: "matched" | "hidden" }) {
  const [items, setItems] = useState(initialItems);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const busy = useRef(false);

  const loadMore = useCallback(async () => {
    if (busy.current || !hasMore) return;
    busy.current = true;
    setLoading(true);
    setError(null);
    try {
      const next = page + 1;
      const params = new URLSearchParams(query);
      params.set("page", String(next));
      params.set("feed", feed);
      const res = await api<FeedPage>(`/api/jobs?${params}`);
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.job.id));
        return [...prev, ...(res.items as unknown as ClientItem[]).filter((i) => !seen.has(i.job.id))];
      });
      setPage(next);
      setHasMore(res.hasMore);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [feed, hasMore, page, query]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && void loadMore(), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore]);

  return (
    <div>
      <ul className="grid gap-3" aria-label="Job results">
        {items.map((item) => (
          <li key={item.job.id}>
            <JobCard item={item} />
          </li>
        ))}
        {loading ? [0, 1].map((i) => <li key={`sk-${i}`}><JobCardSkeleton /></li>) : null}
      </ul>
      <div ref={sentinel} className="h-8" aria-hidden />
      {error ? (
        <div className="flex items-center justify-center gap-3 py-4 text-sm text-danger" role="alert">
          {error}
          <Button size="sm" variant="outline" onClick={() => void loadMore()}>Retry</Button>
        </div>
      ) : null}
      {hasMore && !loading && !error ? (
        <div className="flex justify-center py-2">
          <Button variant="outline" onClick={() => void loadMore()}>
            Load more
          </Button>
        </div>
      ) : null}
      {!hasMore && items.length > 0 ? <p className="py-6 text-center text-sm text-muted-foreground">That&apos;s everything for these filters.</p> : null}
    </div>
  );
}
