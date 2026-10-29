import { createFileRoute, Link } from "@tanstack/react-router";
import { BarChart3, Boxes, Globe, MessagesSquare } from "lucide-react";
import { buttonStyles } from "~/components/ui/button";
import { Logo } from "~/components/logo";
import { api, call } from "~/lib/api";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NepalShop — sell online across Nepal" },
      { name: "description", content: "Your online store, stock, sales and every customer chat in one place. Built for Nepali sellers." },
    ],
  }),
  loader: () => call(api.auth.config.$get()),
  component: Landing,
});

const FEATURES = [
  { icon: Boxes, title: "Products & stock", body: "Organise products into categories. Stock updates itself with every order, and you hear about it before you run out." },
  { icon: BarChart3, title: "Know your numbers", body: "Revenue, profit and best sellers, plus which channel and province your sales really come from." },
  { icon: Globe, title: "Your own shop", body: "A fast, phone-first store with cart, cash on delivery, eSewa and Khalti. Use our address or your own domain." },
  { icon: MessagesSquare, title: "One inbox", body: "WhatsApp, Messenger, Instagram and TikTok in one place. Turn any chat into an order in a click." },
];

function Landing() {
  const { publicSignup } = Route.useLoaderData();
  return (
    <div className="min-h-svh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-1">
          <Link to="/login" className={buttonStyles({ variant: "ghost" })}>
            Log in
          </Link>
          <Link to="/signup" className={buttonStyles({ variant: "primary" })}>
            {publicSignup ? "Start free" : "Get access"}
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="py-16 sm:py-24">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-fg-2">
            <span className="size-1.5 rounded-full bg-good-solid" /> {publicSignup ? "Made for sellers in all 7 provinces" : "Private trial · invite only"}
          </p>
          <h1 className="max-w-3xl text-[clamp(2.25rem,6vw,4rem)] font-semibold leading-[1.05] tracking-[-0.03em]">
            Run your online business from one calm place.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-fg-2">
            Publish your shop, track stock, see what's selling, and answer every DM without switching apps. Prices in rupees, cash on delivery
            built in.
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            <Link to="/signup" className={buttonStyles({ variant: "primary", size: "lg" })}>
              {publicSignup ? "Create your store" : "Request early access"}
            </Link>
            <Link to="/login" className={buttonStyles({ variant: "secondary", size: "lg" })}>
              I already have one
            </Link>
          </div>
        </section>

        <section className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="bg-surface p-6">
              <Icon className="mb-4 size-5 text-brand" aria-hidden />
              <h2 className="font-semibold">{title}</h2>
              <p className="mt-1.5 text-sm text-fg-2">{body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-wrap gap-x-6 gap-y-2 px-4 py-10 text-sm text-fg-3 sm:px-6">
        <span>© NepalShop</span>
        <Link to="/privacy" className="hover:text-fg">
          Privacy
        </Link>
        <Link to="/data-deletion" className="hover:text-fg">
          Data deletion
        </Link>
      </footer>
    </div>
  );
}
