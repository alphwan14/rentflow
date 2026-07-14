import { Skeleton, SkeletonCard, SkeletonList } from "@/components/skeleton";

export default function TenantLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-7 w-48" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} lines={1} />
        ))}
      </div>
      <SkeletonList rows={5} />
    </div>
  );
}
