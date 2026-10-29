import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "~/components/ui/button";
import { num } from "~/lib/format";

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <nav className="mt-3 flex items-center justify-between text-sm text-fg-2" aria-label="Pagination">
      <span className="tabular">
        {num(from)}–{num(to)} of {num(total)}
      </span>
      <div className="flex gap-1.5">
        <Button size="sm" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <ChevronLeft /> Previous
        </Button>
        <Button size="sm" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Next page">
          Next <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}
