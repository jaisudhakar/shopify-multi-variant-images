import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";

// File names (without .liquid) of the blocks in extensions/variant-image-gallery/blocks.
const EMBED_HANDLE = "variant-images-embed";
const GALLERY_BLOCK_HANDLE = "variant-gallery";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const apiKey = process.env.SHOPIFY_API_KEY || "";
  const editor = `https://admin.shopify.com/store/${session.shop.replace(".myshopify.com", "")}/themes/current/editor`;

  return {
    embedUrl: `${editor}?context=apps&template=product&activateAppId=${apiKey}/${EMBED_HANDLE}`,
    blockUrl: `${editor}?template=product&addAppBlockId=${apiKey}/${GALLERY_BLOCK_HANDLE}&target=mainSection`,
  };
};

export default function Setup() {
  const { embedUrl, blockUrl } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Theme setup">
      <s-section heading="Option A — Keep your theme's gallery (recommended)">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Turn on the <s-text type="strong">Variant images</s-text> app embed.
            It filters your theme&apos;s existing product gallery so only the
            selected colour&apos;s images are shown. Works out of the box with
            Dawn and other Online Store 2.0 themes from Shopify.
          </s-paragraph>
          <s-ordered-list>
            <s-list-item>
              Open the theme editor with the button below.
            </s-list-item>
            <s-list-item>
              Make sure <s-text type="strong">Variant images</s-text> is
              switched on under App embeds, then click Save.
            </s-list-item>
            <s-list-item>
              Open a product page and switch colours to check the result.
            </s-list-item>
          </s-ordered-list>
          <s-stack direction="inline">
            <s-button variant="primary" href={embedUrl} target="_blank">
              Enable app embed
            </s-button>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section heading="Option B — Use the app's gallery block">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            If your theme&apos;s gallery isn&apos;t filtered correctly (some
            custom or third-party themes), add the{" "}
            <s-text type="strong">Variant image gallery</s-text> block to the
            product template instead and hide the theme&apos;s own media
            gallery. The block includes thumbnails, arrows and swipe support.
          </s-paragraph>
          <s-stack direction="inline">
            <s-button href={blockUrl} target="_blank">
              Add gallery block
            </s-button>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section heading="Troubleshooting">
        <s-unordered-list>
          <s-list-item>
            Images don&apos;t change: in the app embed settings, adjust the
            “Gallery item selector” to match your theme&apos;s gallery items, or
            use Option B.
          </s-list-item>
          <s-list-item>
            A colour shows all images: no images are assigned to that colour
            yet. Assign them on the product&apos;s page in this app.
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
