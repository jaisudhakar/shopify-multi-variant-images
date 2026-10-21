import { useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useSearchParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { listProducts } from "../models/variant-images.server";
import { numericId } from "../lib/variant-images";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);

  return listProducts(admin, {
    search: url.searchParams.get("q"),
    after: url.searchParams.get("after"),
    before: url.searchParams.get("before"),
  });
};

export default function Index() {
  const { products, pageInfo } = useLoaderData<typeof loader>();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");

  const openProduct = (id: string) =>
    navigate(`/app/products/${numericId(id)}`);

  const pickProduct = async () => {
    const selected = await shopify.resourcePicker({
      type: "product",
      action: "select",
      multiple: false,
    });
    if (selected?.[0]) openProduct(selected[0].id);
  };

  const submitSearch = () => {
    const next = new URLSearchParams(searchParams);
    if (search) next.set("q", search);
    else next.delete("q");
    next.delete("after");
    next.delete("before");
    setSearchParams(next);
  };

  const goToPage = (direction: "after" | "before", cursor: string | null) => {
    if (!cursor) return;
    const next = new URLSearchParams(searchParams);
    next.delete("after");
    next.delete("before");
    next.set(direction, cursor);
    setSearchParams(next);
  };

  return (
    <s-page heading="Multi Variant Images">
      <s-button slot="primary-action" variant="primary" onClick={pickProduct}>
        Select product
      </s-button>

      <s-section>
        <s-paragraph>
          Assign multiple images to each colour of a product. On the product
          page, shoppers only see the images of the colour they selected.
        </s-paragraph>
        <s-stack direction="inline" gap="small-200">
          <s-text color="subdued">First time here?</s-text>
          <s-link href="/app/setup">Enable the gallery in your theme</s-link>
        </s-stack>
      </s-section>

      <s-section padding="none" accessibilityLabel="Products">
        <s-table
          paginate
          hasPreviousPage={pageInfo.hasPreviousPage}
          hasNextPage={pageInfo.hasNextPage}
          onPreviousPage={() => goToPage("before", pageInfo.startCursor)}
          onNextPage={() => goToPage("after", pageInfo.endCursor)}
        >
          <form
            slot="filters"
            onSubmit={(event) => {
              event.preventDefault();
              submitSearch();
            }}
          >
            <s-grid
              gridTemplateColumns="1fr auto"
              gap="small-200"
              alignItems="center"
            >
              <s-search-field
                label="Search products"
                labelAccessibilityVisibility="exclusive"
                placeholder="Search products by title"
                value={search}
                onInput={(event) => setSearch(event.currentTarget.value)}
              />
              <s-button type="submit">Search</s-button>
            </s-grid>
          </form>

          <s-table-header-row>
            <s-table-header listSlot="primary">Product</s-table-header>
            <s-table-header>Colour option</s-table-header>
            <s-table-header format="numeric">Images</s-table-header>
            <s-table-header listSlot="secondary">Status</s-table-header>
          </s-table-header-row>

          <s-table-body>
            {products.map((product) => (
              <s-table-row
                key={product.id}
                clickDelegate={`open-${numericId(product.id)}`}
              >
                <s-table-cell>
                  <s-stack direction="inline" gap="small" alignItems="center">
                    <s-thumbnail
                      src={product.image ?? undefined}
                      alt={product.imageAlt || product.title}
                      size="small"
                    />
                    <s-link
                      id={`open-${numericId(product.id)}`}
                      href={`/app/products/${numericId(product.id)}`}
                    >
                      {product.title}
                    </s-link>
                  </s-stack>
                </s-table-cell>
                <s-table-cell>
                  {product.colorOptionName ? (
                    <s-text>
                      {product.colorOptionName} ({product.colorCount})
                    </s-text>
                  ) : (
                    <s-badge tone="warning">No colour option</s-badge>
                  )}
                </s-table-cell>
                <s-table-cell>{product.mediaCount}</s-table-cell>
                <s-table-cell>
                  {product.configuredCount > 0 ? (
                    <s-badge tone="success">
                      {`${product.configuredCount} colour${product.configuredCount === 1 ? "" : "s"} set up`}
                    </s-badge>
                  ) : (
                    <s-badge>Not set up</s-badge>
                  )}
                </s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>

        {products.length === 0 && (
          <s-box padding="base">
            <s-paragraph color="subdued">No products found.</s-paragraph>
          </s-box>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
