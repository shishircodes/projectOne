import { useEffect } from "react";

export type LiveEvent =
  | { type: "message:new"; data: { conversation: any; message: any } }
  | { type: "order:new"; data: { id: string; order_number: number; total: number; customer_name: string; source: string } }
  | { type: "order:paid"; data: { id: string; order_number: number; total: number; customer_name: string; payment_method: string } };

const bus = typeof window !== "undefined" ? new EventTarget() : null;

/** One EventSource for the whole dashboard; components subscribe through `useLive`. Reconnects automatically. */
export function useLiveConnection() {
  useEffect(() => {
    const es = new EventSource("/api/v1/events");
    for (const type of ["message:new", "order:new", "order:paid"] as const) {
      es.addEventListener(type, (e) => {
        try {
          bus?.dispatchEvent(new CustomEvent("live", { detail: { type, data: JSON.parse((e as MessageEvent).data) } }));
        } catch {}
      });
    }
    return () => es.close();
  }, []);
}

export function useLive(handler: (e: LiveEvent) => void) {
  useEffect(() => {
    const fn = (e: Event) => handler((e as CustomEvent<LiveEvent>).detail);
    bus?.addEventListener("live", fn);
    return () => bus?.removeEventListener("live", fn);
  }, [handler]);
}
