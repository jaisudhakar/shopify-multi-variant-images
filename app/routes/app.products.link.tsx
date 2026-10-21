import type { LoaderFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";

// Target of the "Manage colour images" admin link on the product details page
// (extensions/product-admin-link). Shopify appends the product's `id`.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { redirect } = await authenticate.admin(request);
  const id = new URL(request.url).searchParams.get("id");

  return redirect(id ? `/app/products/${id.split("/").pop()}` : "/app");
};
