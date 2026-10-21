import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import { PLAN_CURRENCY, PLAN_PRICE, TRIAL_DAYS } from "../../billing";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return null;
};

export default function App() {
  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Multi Variant Images</h1>
        <p className={styles.text}>
          Show every colour of your product with its own set of images. Install
          it from the Shopify App Store.
        </p>
        <ul className={styles.list}>
          <li>
            <strong>Multiple images per colour</strong>. Pick any number of
            product images for each colour variant, in the order you want.
          </li>
          <li>
            <strong>Works with your theme</strong>. The product page gallery
            only shows the images of the colour the shopper selected.
          </li>
          <li>
            <strong>Cart &amp; checkout ready</strong>. Optionally sets each
            variant&apos;s image so the right colour appears in the cart.
          </li>
        </ul>
        <p className={styles.text}>
          {`$${PLAN_PRICE} ${PLAN_CURRENCY}/month after a ${TRIAL_DAYS}-day free trial · `}
          <a href="/support">Help &amp; support</a> ·{" "}
          <a href="/privacy">Privacy policy</a>
        </p>
      </div>
    </div>
  );
}
