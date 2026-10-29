/// <reference types="vite/client" />
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import appCss from "~/styles.css?url";
import { themeScript, useTheme } from "~/lib/theme";
import { ConfirmHost } from "~/components/ui/confirm";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      // viewport-fit=cover for safe areas; resizes-content so the keyboard shrinks the layout on Android.
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" },
      { name: "color-scheme", content: "light dark" },
      { name: "theme-color", media: "(prefers-color-scheme: light)", content: "#f7f9fb" },
      { name: "theme-color", media: "(prefers-color-scheme: dark)", content: "#0d0e11" },
      { title: "NepalShop" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%235464f5'/><path d='M10 22V10l12 12V10' stroke='white' stroke-width='3' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>" },
    ],
    scripts: [{ children: themeScript }],
  }),
  shellComponent: RootDocument,
  component: Outlet,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <AppToaster />
        <ConfirmHost />
        <Scripts />
      </body>
    </html>
  );
}

function AppToaster() {
  const { resolved } = useTheme();
  return (
    <Toaster
      theme={resolved}
      position="bottom-right"
      richColors
      closeButton
      offset={{ bottom: "max(16px, env(safe-area-inset-bottom))", right: 16 }}
      mobileOffset={{ bottom: "max(12px, env(safe-area-inset-bottom))" }}
      toastOptions={{ classNames: { toast: "!font-sans" } }}
    />
  );
}
