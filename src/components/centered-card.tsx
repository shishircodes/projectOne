import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LogoMark } from "./logo";

/** Small focused page (onboarding, password) with the logo above a single card. */
export function CenteredCard({ title, description, children }: { title: ReactNode; description?: ReactNode; children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Link to="/" className="mx-auto mb-6 flex w-fit" aria-label="NepalShop home">
          <LogoMark className="size-10" />
        </Link>
        <h1 className="text-center text-xl font-semibold">{title}</h1>
        {description && <p className="mt-1 text-center text-sm text-fg-2">{description}</p>}
        <div className="mt-6 rounded-2xl border border-border bg-surface p-5 shadow-sm">{children}</div>
      </div>
    </main>
  );
}
