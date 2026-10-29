import { createFileRoute } from "@tanstack/react-router";
import { MessagesSquare } from "lucide-react";
import { EmptyState } from "~/components/ui/misc";

export const Route = createFileRoute("/app/inbox/")({
  component: () => (
    <div className="grid h-full place-items-center">
      <EmptyState icon={<MessagesSquare />} title="Pick a conversation" description="Messages from every channel show up on the left as they arrive." />
    </div>
  ),
});
