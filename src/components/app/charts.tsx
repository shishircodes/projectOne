import { ClientOnly } from "@tanstack/react-router";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ReactNode } from "react";
import { Skeleton } from "~/components/ui/misc";

/**
 * Single-series trend. One hue (validated series slot 1), 2px line, light fill,
 * recessive grid, crosshair + tooltip on hover. Rendered client-side only (needs layout size).
 */
export function TrendChart({
  data,
  format,
  axisFormat,
  label,
  height = 260,
}: {
  data: { label: string; value: number }[];
  format: (n: number) => string;
  axisFormat: (n: number) => string;
  label: string;
  height?: number;
}) {
  return (
    <ClientOnly fallback={<Skeleton className="w-full" />}>
      <div style={{ height }} role="img" aria-label={`${label} over time`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.18} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: "var(--border-strong)" }}
              tick={{ fill: "var(--text-3)", fontSize: 12 }}
              minTickGap={24}
              interval="preserveStartEnd"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--text-3)", fontSize: 12 }}
              tickFormatter={axisFormat}
              width={64}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
              isAnimationActive={false}
              content={({ active, payload, label: l }) =>
                active && payload?.length ? (
                  <div className="rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-md">
                    <p className="text-xs text-fg-3">{l}</p>
                    <p className="tabular font-semibold">{format(Number(payload[0].value))}</p>
                  </div>
                ) : null
              }
            />
            <Area
              type="monotone"
              dataKey="value"
              name={label}
              stroke="var(--accent)"
              strokeWidth={2}
              fill="url(#trendFill)"
              activeDot={{ r: 4, fill: "var(--accent)", stroke: "var(--surface)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ClientOnly>
  );
}

/**
 * Ranked horizontal bars with direct labels — readable without hover, works as its own table.
 */
export function BarList({
  rows,
  format,
  empty = "No data yet",
}: {
  rows: { key: string; label: ReactNode; value: number; hint?: ReactNode }[];
  format: (n: number) => string;
  empty?: string;
}) {
  if (!rows.length) return <p className="py-8 text-center text-sm text-fg-3">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="grid gap-2.5">
      {rows.map((r) => (
        <li key={r.key} className="grid gap-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate" title={typeof r.label === "string" ? r.label : undefined}>
              {r.label}
            </span>
            <span className="tabular shrink-0 font-medium">
              {format(r.value)}
              {r.hint && <span className="ml-1.5 font-normal text-fg-3">{r.hint}</span>}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
