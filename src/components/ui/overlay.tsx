import { Dialog } from "@base-ui/react/dialog";
import { Drawer } from "@base-ui/react/drawer";
import { Menu } from "@base-ui/react/menu";
import { X } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { cn } from "~/lib/cn";
import { Button } from "./button";

/** Centered modal for short, focused tasks (confirmations, small forms). */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="scrim fixed inset-0 z-40" />
        <Dialog.Popup
          className={cn(
            "modal fixed left-1/2 top-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto overscroll-contain rounded-2xl border border-border bg-surface p-5 shadow-lg",
            className,
          )}
        >
          <div className="grid gap-1 pr-8">
            <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
            {description && <Dialog.Description className="text-sm text-fg-2">{description}</Dialog.Description>}
          </div>
          <Dialog.Close render={<Button variant="ghost" size="icon-sm" className="absolute right-3 top-3" aria-label="Close" />}>
            <X />
          </Dialog.Close>
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Right-side sheet for editing records without losing your place in the list.
 * Swipe right to dismiss on touch; enters and exits along the same edge.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = "32rem",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} swipeDirection="right">
      <Drawer.Portal>
        <Drawer.Backdrop className="scrim fixed inset-0 z-40" />
        <Drawer.Viewport className="fixed inset-0 z-50 flex justify-end pointer-events-none">
          <Drawer.Popup
            className="sheet pointer-events-auto flex h-dvh max-w-full flex-col border-l border-border bg-surface shadow-lg outline-none"
            style={{ width: `min(${width}, 100vw)` }}
          >
            <header className="flex items-start justify-between gap-3 border-b border-border px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
              <div className="grid min-w-0 gap-0.5">
                <Drawer.Title className="truncate text-lg font-semibold">{title}</Drawer.Title>
                {description && <Drawer.Description className="text-sm text-fg-2">{description}</Drawer.Description>}
              </div>
              <Drawer.Close render={<Button variant="ghost" size="icon-sm" aria-label="Close" />}>
                <X />
              </Drawer.Close>
            </header>
            <Drawer.Content className="flex-1 overflow-y-auto overscroll-contain px-5 py-5">{children}</Drawer.Content>
            {footer && (
              <footer className="flex items-center justify-end gap-2 border-t border-border bg-surface px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                {footer}
              </footer>
            )}
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export function DropdownMenu({ trigger, children, align = "end" }: { trigger: ReactElement; children: ReactNode; align?: "start" | "end" }) {
  return (
    <Menu.Root>
      <Menu.Trigger render={trigger} />
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} align={align} className="z-50">
          <Menu.Popup className="popover min-w-44 rounded-xl border border-border bg-surface p-1 shadow-md outline-none">{children}</Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

export function MenuItem({ onClick, children, danger }: { onClick: () => void; children: ReactNode; danger?: boolean }) {
  return (
    <Menu.Item
      onClick={onClick}
      className={cn(
        "flex cursor-default select-none items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none data-[highlighted]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-fg-3",
        danger && "text-bad [&_svg]:text-bad",
      )}
    >
      {children}
    </Menu.Item>
  );
}
export const MenuSeparator = () => <Menu.Separator className="my-1 h-px bg-border" />;
