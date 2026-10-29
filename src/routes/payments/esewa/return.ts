import { createFileRoute } from "@tanstack/react-router";
import { handleEsewaReturn } from "~/server/payments";
import { redirectToOrder } from "~/server/payments/return";

// eSewa success redirect: ?data=<base64 signed JSON>. Verified server-to-server before anything changes.
export const Route = createFileRoute("/payments/esewa/return")({
  server: { handlers: { GET: ({ request }) => redirectToOrder(request, handleEsewaReturn(new URL(request.url))) } },
});
