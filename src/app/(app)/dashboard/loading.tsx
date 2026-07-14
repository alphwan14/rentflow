import { Skeleton, SkeletonCard, SkeletonList } from "@/components/skeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} lines={1} />
        ))}
      </div>
      <SkeletonList rows={6} />
    </div>
  );
}
