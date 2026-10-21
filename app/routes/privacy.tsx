import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";

import styles from "../styles/public.module.css";

// Public page — use https://<your-app-url>/privacy as the privacy policy URL
// in the Shopify App Store listing.

export const meta: MetaFunction = () => [
  { title: "Privacy policy · Multi Variant Images" },
];

export const loader = () => ({
  supportEmail: process.env.SUPPORT_EMAIL || "",
  companyName:
    process.env.COMPANY_NAME || "the developer of Multi Variant Images",
});

export default function Privacy() {
  const { supportEmail, companyName } = useLoaderData<typeof loader>();

  return (
    <main className={styles.page}>
      <article className={styles.content}>
        <h1>Privacy policy</h1>
        <p className={styles.updated}>
          Multi Variant Images · Last updated 21 October 2026
        </p>

        <p>
          Multi Variant Images (“the App”) is provided by {companyName} (“we”,
          “us”). The App lets Shopify merchants assign several images to each
          colour variant of a product and shows the matching images on the
          online store. This policy explains what information the App handles
          when a merchant installs it.
        </p>

        <h2>Information we collect</h2>
        <ul>
          <li>
            <strong>Store information:</strong> your shop domain and the access
            token Shopify issues when you install the App. We use these only to
            connect to your store through the Shopify API.
          </li>
          <li>
            <strong>Product information:</strong> product titles, options,
            variants and images, which the App reads from Shopify to show the
            editor. Your colour-to-image assignments are saved in a product
            metafield inside your own Shopify store, not on our servers.
          </li>
          <li>
            <strong>Images you upload</strong> through the App are sent directly
            to your Shopify store as product media.
          </li>
        </ul>

        <h2>Customer information</h2>
        <p>
          The App does not collect, store or process personal information about
          your customers. The script added to your product pages runs in the
          shopper&apos;s browser, only changes which product images are shown,
          and does not use cookies, tracking, analytics or third-party services.
        </p>

        <h2>Payments</h2>
        <p>
          Subscriptions are billed by Shopify through your Shopify invoice. We
          never see or store payment card details.
        </p>

        <h2>How we use and share information</h2>
        <p>
          We use store information only to provide the App. We do not sell or
          rent it, and we do not share it with third parties except our hosting
          provider, which stores it on our behalf.
        </p>

        <h2>Data retention and deletion</h2>
        <p>
          When you uninstall the App we delete your store&apos;s access
          credentials. Shopify also sends us a data-erasure request 48 hours
          after uninstalling, and we delete any remaining data for your store.
          Colour assignments stored in your product metafields stay in your
          store until you remove them in the App or delete the products.
        </p>

        <h2>Your rights</h2>
        <p>
          You can ask us what information we hold about your store, or ask us to
          delete it, at any time using the contact details below. If you are in
          the European Economic Area or the United Kingdom, you have the right
          to access, correct, move or delete your personal data and to complain
          to your data protection authority.
        </p>

        <h2>Changes</h2>
        <p>
          We may update this policy. The date at the top shows when it last
          changed.
        </p>

        <div className={styles.contact}>
          <strong>Contact</strong>
          <br />
          {supportEmail ? (
            <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
          ) : (
            <span>
              Contact us through the App&apos;s Shopify App Store page.
            </span>
          )}
        </div>
      </article>
    </main>
  );
}
