import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";

import styles from "../styles/public.module.css";
import { PLAN_CURRENCY, PLAN_PRICE, TRIAL_DAYS } from "../billing";

// Public page — use https://<your-app-url>/support as the support / FAQ URL
// in the Shopify App Store listing.

export const meta: MetaFunction = () => [
  { title: "Help & support · Multi Variant Images" },
];

export const loader = () => ({
  supportEmail: process.env.SUPPORT_EMAIL || "",
});

export default function Support() {
  const { supportEmail } = useLoaderData<typeof loader>();

  return (
    <main className={styles.page}>
      <article className={styles.content}>
        <h1>Help &amp; support</h1>
        <p className={styles.updated}>Multi Variant Images</p>

        <h2>Getting started</h2>
        <ol>
          <li>
            Open the app and choose a product that has a <strong>Color</strong>{" "}
            option.
          </li>
          <li>
            Pick a colour, then click the images that belong to it (or upload
            new ones). Drag to change the order. Click <strong>Save</strong>.
          </li>
          <li>
            Go to <strong>Theme setup</strong> in the app and click{" "}
            <strong>Enable app embed</strong>, then save the theme.
          </li>
          <li>Open the product on your store and switch colours.</li>
        </ol>

        <h2>Frequently asked questions</h2>
        <dl className={styles.faq}>
          <dt>How much does it cost?</dt>
          <dd>
            {`$${PLAN_PRICE} ${PLAN_CURRENCY} per month after a ${TRIAL_DAYS}-day free trial, billed by Shopify. Cancel any time from the app's Plan page or by uninstalling.`}
          </dd>

          <dt>Do I need to edit my theme code?</dt>
          <dd>
            No. The app uses a theme app extension that you switch on in the
            theme editor, and it is removed cleanly when you uninstall.
          </dd>

          <dt>Which themes are supported?</dt>
          <dd>
            Dawn and Shopify&apos;s other Online Store 2.0 themes work out of
            the box, and most custom themes are detected automatically. If your
            gallery doesn&apos;t change, add the “Variant image gallery” block
            to your product template instead, or contact us.
          </dd>

          <dt>Can one image belong to several colours?</dt>
          <dd>Yes. Images can also be shared by all colours.</dd>

          <dt>What happens to colours without images?</dt>
          <dd>They show all product images, so nothing ever looks empty.</dd>

          <dt>My colours are separate products — does the app help?</dt>
          <dd>
            The app works with colour <em>variants</em> of one product. If each
            colour is its own product, each product page already shows only its
            own images.
          </dd>

          <dt>Images aren&apos;t changing on my store</dt>
          <dd>
            Check that you saved in the app and that the app embed is on in your
            published theme. Then open the product page with{" "}
            <code>?mvi_debug=1</code> at the end of the URL and send us a
            screenshot of the browser console.
          </dd>
        </dl>

        <div className={styles.contact}>
          <strong>Contact support</strong>
          <br />
          {supportEmail ? (
            <>
              Email <a href={`mailto:${supportEmail}`}>{supportEmail}</a> — we
              reply within 1 business day.
            </>
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
