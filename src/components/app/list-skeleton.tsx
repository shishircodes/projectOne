import { Card, PageHeader, Skeleton } from "~/components/ui/misc";

export function ListSkeleton({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Skeleton className="mb-3 h-9" />
      <Card className="divide-y divide-border">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="size-10" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </Card>
    </>
  );
}
