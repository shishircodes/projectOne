import { Link } from "@tanstack/react-router";
import { cn } from "~/lib/cn";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7 shrink-0", className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--brand)" />
      <path d="M10 22V10l12 12V10" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ to = "/" }: { to?: string }) {
  return (
    <Link to={to} className="flex items-center gap-2 font-semibold tracking-[-0.01em]">
      <LogoMark />
      NepalShop
    </Link>
  );
}
