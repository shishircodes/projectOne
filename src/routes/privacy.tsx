import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage, orMissing } from "~/components/legal-page";
import { api, call } from "~/lib/api";

const UPDATED = "15 October 2026";

export const Route = createFileRoute("/privacy")({
  loader: () => call(api.legal.$get()),
  head: () => ({
    meta: [
      { title: "Privacy policy · NepalShop" },
      { name: "description", content: "How NepalShop collects, uses, shares and protects personal information." },
    ],
  }),
  component: Privacy,
});

function Privacy() {
  const info = Route.useLoaderData();
  const legalName = orMissing(info.legalName, "Registered business name");
  const name = info.businessNumber ? `${legalName} (${info.businessNumber})` : legalName;
  const email = info.email;
  const contact = email ? <a href={`mailto:${email}`}>{email}</a> : "[Contact email]";

  return (
    <LegalPage title="Privacy policy" updated={UPDATED} info={info}>
      <p>
        NepalShop is an online platform that lets businesses in Nepal run an online store, manage products and orders, and answer customer
        messages from WhatsApp, Messenger, Instagram and TikTok in one place. NepalShop is operated by <strong>{name}</strong>
        {info.address ? <>, {info.address}</> : <>, [Business address]</>} (“NepalShop”, “we”, “us”).
      </p>
      <p>
        This policy explains what personal information we collect, why, who we share it with, and the choices you have. We handle personal
        information in line with the privacy laws that apply to us and to the stores using NepalShop, including Nepal's Individual Privacy Act,
        2075 (2018), and where it applies, Australia's Privacy Act 1988.
      </p>

      <h2>Who this policy covers</h2>
      <ul>
        <li>
          <strong>Store owners</strong>: businesses and people who have a NepalShop account and run a store on it.
        </li>
        <li>
          <strong>Shoppers</strong>: people who order from, or send a message to, a store that uses NepalShop.
        </li>
      </ul>
      <p>
        Each store on NepalShop is run by an independent business. When you order from or message a store, that store is the seller you are
        dealing with and decides how to use your order and messages to serve you. NepalShop stores and processes that information on the
        store's behalf so the store can run its business.
      </p>

      <h2>Information we collect</h2>
      <h3>From store owners</h3>
      <ul>
        <li>Your name, email address and password. Passwords are stored only as a secure one-way hash; we can't read them.</li>
        <li>
          Store details you enter: store name and web address, logo, description, phone number, email, address, social media handles, delivery
          fees, products, photos, prices and stock.
        </li>
        <li>
          Settings for connected services, such as WhatsApp, Messenger, Instagram or TikTok account IDs and access tokens, and eSewa or Khalti
          merchant keys. Tokens and keys are stored encrypted.
        </li>
        <li>Account activity, such as when you last signed in.</li>
      </ul>

      <h3>From shoppers</h3>
      <ul>
        <li>
          <strong>When you place an order:</strong> your name, mobile number, email (if you give it), delivery address (province, city, street or
          landmark), the items you order, any note you add, and how you choose to pay.
        </li>
        <li>
          <strong>When you pay online with eSewa or Khalti:</strong> the payment status and transaction reference sent to us by the payment
          provider. You pay on the provider's own page; we never receive your wallet ID, password, PIN or OTP.
        </li>
        <li>
          <strong>When you message a store</strong> on WhatsApp, Messenger, Instagram or TikTok, and the store has connected that account to
          NepalShop: the ID the platform uses for you (for WhatsApp, your phone number), your display name where the platform provides it, and
          the messages and the store's replies, with their times.
        </li>
      </ul>

      <h3>Collected automatically</h3>
      <ul>
        <li>
          Your IP address, used briefly to protect sign-in, checkout and payments from abuse (for example, limiting repeated attempts). We don't
          keep it in our database.
        </li>
        <li>A sign-in cookie for store owners, which keeps you logged in for up to 30 days and is removed when you log out.</li>
        <li>
          Your shopping cart and your light/dark display preference, saved only in your own browser's storage. They aren't sent to us until you
          place an order.
        </li>
      </ul>
      <p>We don't use advertising or third-party tracking cookies, and we don't sell personal information.</p>

      <h2>How we use information</h2>
      <ul>
        <li>To provide store owners' accounts and stores, and to show their products to shoppers.</li>
        <li>To take orders and let the store confirm, deliver and collect payment for them, including contacting you about your order.</li>
        <li>To show customer messages to the store, and to send the store's replies back through the same messaging app.</li>
        <li>To confirm online payments directly with eSewa or Khalti before marking an order as paid.</li>
        <li>To keep NepalShop secure, prevent fraud and abuse, and fix problems.</li>
        <li>To provide support and to meet our legal obligations.</li>
      </ul>

      <h2>Who we share information with</h2>
      <ul>
        <li>
          <strong>The store</strong> you order from or message. It sees your order details and your conversation with it.
        </li>
        <li>
          <strong>Meta Platforms</strong> (WhatsApp, Messenger and Instagram) and <strong>TikTok</strong>, when a store uses them to talk with
          you. Messages travel through those services and are covered by their own privacy policies.
        </li>
        <li>
          <strong>eSewa and Khalti</strong>, when you choose to pay with them. We send the amount and an order reference, and receive the
          payment result.
        </li>
        <li>
          <strong>Service providers</strong> who host our servers, database and image storage for us, under obligations to protect the data.
        </li>
        <li>
          <strong>Authorities</strong>, when we are required to by law or to protect people's rights and safety.
        </li>
      </ul>
      <p>
        NepalShop's operator and some of these services, including Meta and TikTok, may store or process information outside Nepal. We share only what each service
        needs to do its job.
      </p>

      <h2>How long we keep information</h2>
      <ul>
        <li>Store owner accounts and store content are kept while the account is active.</li>
        <li>
          Orders are kept so the store can manage deliveries, returns and its accounts, and for as long as the law requires transaction records
          to be kept.
        </li>
        <li>Conversations are kept while the store uses NepalShop, unless deletion is requested sooner.</li>
        <li>Sign-in sessions expire after 30 days.</li>
      </ul>
      <p>
        You can ask us to delete your information at any time. See <Link to="/data-deletion">how to request data deletion</Link>.
      </p>

      <h2>How we protect information</h2>
      <p>
        We use encrypted connections (HTTPS), store passwords only as secure hashes, encrypt the access tokens and payment keys stores give us,
        and limit each store's data to that store's owner and the NepalShop team members who need it to run the service. No system can be
        completely secure, but we work to protect your information and will act promptly if something goes wrong.
      </p>

      <h2>Your rights and choices</h2>
      <p>You can ask to:</p>
      <ul>
        <li>see the personal information we hold about you;</li>
        <li>correct information that is wrong or out of date;</li>
        <li>delete your information, or stop receiving messages from a store;</li>
        <li>object to how we use your information.</li>
      </ul>
      <p>
        Shoppers can also contact the store directly. To make a request to us, email {contact}. We may ask you to confirm your identity, and we
        respond within 30 days.
      </p>

      <h2>Children</h2>
      <p>
        NepalShop is not meant for children under 16, and store accounts are only for adults running a business. If you believe a child has given
        us personal information, contact us and we will delete it.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        We may update this policy as NepalShop changes. We will post the new version here with a new “last updated” date, and tell store owners
        about significant changes.
      </p>

      <h2>Contact us</h2>
      <p>
        {name}
        <br />
        {orMissing(info.address, "Business address")}
        <br />
        Email: {contact}
      </p>
    </LegalPage>
  );
}
