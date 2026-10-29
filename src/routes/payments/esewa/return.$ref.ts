import { createFileRoute } from "@tanstack/react-router";
import { handleEsewaReturn } from "~/server/payments";
import { redirectToOrder } from "~/server/payments/return";

// eSewa failure redirect carries our reference in the path (eSewa appends its own query string).
export const Route = createFileRoute("/payments/esewa/return/$ref")({
  server: { handlers: { GET: ({ request, params }) => redirectToOrder(request, handleEsewaReturn(new URL(request.url), params.ref)) } },
});
