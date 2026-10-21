import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Multi Variant Images</h1>
        <p className={styles.text}>
          Show every colour of your product with its own set of images.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
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
      </div>
    </div>
  );
}
