import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { rewrite } from "./lib/hosts";
import { parseSearch, stringifySearch } from "./lib/search";
import { DefaultError, NotFound } from "./components/errors";

export const getRouter = () =>
  createRouter({
    routeTree,
    rewrite, // custom domains / store subdomains serve their storefront at "/"
    parseSearch,
    stringifySearch,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    defaultPendingMs: 150, // don't flash skeletons for fast navigations
    defaultPendingMinMs: 300,
    defaultErrorComponent: DefaultError,
    defaultNotFoundComponent: NotFound,
  });

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
