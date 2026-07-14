/** Pulsing placeholder blocks shown while server components fetch. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/70 ${className}`} />;
}

export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <Skeleton className="h-3 w-24" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`mt-2 h-6 ${i % 2 ? "w-1/2" : "w-2/3"}`} />
      ))}
    </div>
  );
}

export function SkeletonList({ rows = 6 }: { rows?: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-4 last:border-0">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="mt-2 h-3 w-3/5" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
