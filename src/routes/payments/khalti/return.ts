import { createFileRoute } from "@tanstack/react-router";
import { handleKhaltiReturn } from "~/server/payments";
import { redirectToOrder } from "~/server/payments/return";

// Khalti return_url (?pidx=...). The query's status is ignored; lookup decides.
export const Route = createFileRoute("/payments/khalti/return")({
  server: { handlers: { GET: ({ request }) => redirectToOrder(request, handleKhaltiReturn(new URL(request.url))) } },
});
