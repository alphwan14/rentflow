import { Skeleton, SkeletonList } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-7 w-40" />
      <SkeletonList rows={5} />
    </div>
  );
}
