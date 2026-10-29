import { AlertDialog } from "@base-ui/react/alert-dialog";
import { useSyncExternalStore, type ReactNode } from "react";
import { Button } from "./button";

// Confirmation only for irreversible actions; reversible ones use an Undo toast instead.
type Request = { title: string; description?: ReactNode; confirmLabel?: string; danger?: boolean; resolve: (ok: boolean) => void };
let current: Request | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function confirmAction(opts: Omit<Request, "resolve">): Promise<boolean> {
  return new Promise((resolve) => {
    current?.resolve(false);
    current = { ...opts, resolve };
    emit();
  });
}

function close(ok: boolean) {
  current?.resolve(ok);
  current = null;
  emit();
}

export function ConfirmHost() {
  const req = useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    () => current,
    () => null,
  );
  return (
    <AlertDialog.Root open={!!req} onOpenChange={(o) => !o && close(false)}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="scrim fixed inset-0 z-50" />
        <AlertDialog.Popup className="modal fixed left-1/2 top-1/2 z-50 grid w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-2xl border border-border bg-surface p-5 shadow-lg">
          <div className="grid gap-1.5">
            <AlertDialog.Title className="text-lg font-semibold">{req?.title}</AlertDialog.Title>
            {req?.description && <AlertDialog.Description className="text-sm text-fg-2">{req.description}</AlertDialog.Description>}
          </div>
          <div className="flex justify-end gap-2">
            <AlertDialog.Close render={<Button variant="secondary" />}>Cancel</AlertDialog.Close>
            <Button variant={req?.danger ? "danger" : "primary"} onClick={() => close(true)} autoFocus>
              {req?.confirmLabel ?? "Confirm"}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
