import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Logo } from "./logo";

export type LegalInfo = {
  legalName: string | null;
  email: string | null;
  address: string | null;
  businessNumber: string | null;
  siteUrl: string;
  missing: string[];
  isProduction: boolean;
};

/** Long-form reading layout for legal pages: comfortable measure, clear hierarchy, printable. */
export function LegalPage({ title, updated, info, children }: { title: string; updated: string; info: LegalInfo; children: ReactNode }) {
  return (
    <div className="min-h-svh">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
        <Logo />
        <nav className="flex gap-4 text-sm text-fg-2">
          <Link to="/privacy" className="hover:text-fg" activeProps={{ className: "font-medium text-fg" }}>
            Privacy
          </Link>
          <Link to="/data-deletion" className="hover:text-fg" activeProps={{ className: "font-medium text-fg" }}>
            Data deletion
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-20 pt-6 sm:px-6">
        {info.missing.length > 0 && (
          <div role="alert" className="mb-8 rounded-xl border border-warn/40 bg-warn-soft px-4 py-3 text-sm text-warn">
            <strong>Not ready to publish.</strong> Set {info.missing.join(", ")} in <code>.env</code> and restart the server. Meta and your customers need
            real contact details on this page.
          </div>
        )}
        <h1 className="text-3xl font-semibold tracking-[-0.025em]">{title}</h1>
        <p className="mt-2 text-sm text-fg-3">Last updated {updated}</p>
        <div className="legal mt-8">{children}</div>
      </main>
    </div>
  );
}

/** Business name / contact with a visible placeholder when not configured. */
export const orMissing = (value: string | null, label: string) => value ?? `[${label}]`;
