import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage, orMissing } from "~/components/legal-page";
import { api, call } from "~/lib/api";

const UPDATED = "15 October 2026";

export const Route = createFileRoute("/data-deletion")({
  loader: () => call(api.legal.$get()),
  head: () => ({
    meta: [
      { title: "Data deletion · NepalShop" },
      { name: "description", content: "How to ask NepalShop to delete your personal information, including data from WhatsApp, Messenger and Instagram." },
    ],
  }),
  component: DataDeletion,
});

function DataDeletion() {
  const info = Route.useLoaderData();
  const email = info.email;
  const subject = encodeURIComponent("Data deletion request");
  const body = encodeURIComponent(
    "Please delete my personal information from NepalShop.\n\nMy name:\nPhone number or email I used:\nStore(s) I ordered from or messaged:\nApp I messaged from (WhatsApp / Messenger / Instagram / TikTok) and my name or username there:\n",
  );
  const contact = email ? (
    <a href={`mailto:${email}?subject=${subject}&body=${body}`}>{email}</a>
  ) : (
    "[Contact email]"
  );

  return (
    <LegalPage title="Data deletion" updated={UPDATED} info={info}>
      <p>
        You can ask NepalShop to delete the personal information we hold about you at any time. This includes information from orders and
        messages you sent to a store through WhatsApp, Messenger, Instagram or TikTok.
      </p>

      <h2>How to request deletion</h2>
      <ol>
        <li>
          Email {contact} with the subject <strong>“Data deletion request”</strong>.
        </li>
        <li>
          Tell us:
          <ul>
            <li>your name;</li>
            <li>the phone number or email address you used;</li>
            <li>which store(s) you ordered from or messaged;</li>
            <li>if you messaged through an app, which one (WhatsApp, Messenger, Instagram or TikTok) and your name or username there.</li>
          </ul>
        </li>
        <li>
          We may reply to confirm the request really comes from you before deleting anything, so nobody can delete someone else's information.
        </li>
      </ol>
      <p>
        <strong>Store owners</strong> who want to close their account and delete their store can send the same email from the address on their
        NepalShop account.
      </p>

      <h2>What we delete</h2>
      <ul>
        <li>Your messages and conversation history with the store(s), and the name and ID we received from the messaging app.</li>
        <li>Your name, phone number, email and address from your orders.</li>
        <li>For store owners: your account, store, products and photos, and any connected-app and payment keys.</li>
      </ul>
      <p>
        If the law requires us or a store to keep a record of a sale (for example, for tax or accounting), we keep only what is required, remove
        everything else, and delete the rest when it is no longer required.
      </p>

      <h2>How long it takes</h2>
      <p>
        We complete deletion requests within <strong>30 days</strong> and email you to confirm when it's done. Copies in our backups are removed as
        those backups expire.
      </p>

      <h2>Data held by WhatsApp, Messenger, Instagram and TikTok</h2>
      <p>
        Deleting your information from NepalShop doesn't delete the messages stored in the messaging app itself. To remove them there, delete the
        conversation in that app, or follow its own data deletion settings. To stop receiving messages from a store, you can block it in the app.
      </p>

      <h2>Questions</h2>
      <p>
        {orMissing(info.legalName, "Registered business name")}
        {info.businessNumber && <> ({info.businessNumber})</>}, {orMissing(info.address, "Business address")}. Email: {contact}. See also our{" "}
        <Link to="/privacy">privacy policy</Link>.
      </p>
    </LegalPage>
  );
}
