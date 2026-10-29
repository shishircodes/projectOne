import { Link, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { buttonStyles, Button } from "./ui/button";

export function DefaultError({ error }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <div className="mx-auto grid max-w-md gap-3 px-4 py-24 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-fg-2">{error instanceof Error ? error.message : "Please try again."}</p>
      <div className="flex justify-center gap-2">
        <Button onClick={() => router.invalidate()}>Try again</Button>
        <Link to="/" className={buttonStyles({ variant: "ghost" })}>
          Go home
        </Link>
      </div>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="mx-auto grid max-w-md gap-3 px-4 py-24 text-center">
      <p className="text-sm font-medium text-fg-3">404</p>
      <h1 className="text-xl font-semibold">This page doesn't exist</h1>
      <p className="text-sm text-fg-2">The link may be old, or the page was moved.</p>
      <div>
        <Link to="/" className={buttonStyles({ variant: "secondary" })}>
          Go home
        </Link>
      </div>
    </div>
  );
}
