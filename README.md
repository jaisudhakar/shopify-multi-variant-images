# Multi Variant Images — Shopify app

Shopify only lets you attach **one** image to each variant. This app lets
merchants assign **multiple images to every colour** of a product in the
admin, and makes the product page (PDP) show only the images of the colour the
shopper selected.

> Publishing to the Shopify Partner Dashboard / App Store is covered step by
> step in **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

## Features

**Admin (embedded app)**

- Product list with search showing which products are set up.
- Per-product editor that works **one colour at a time**:
  1. Pick a colour from the colour chips (each shows how many images it has).
  2. Click product images to add them to that colour, or **upload new images
     straight into the colour**. The selected images appear in an ordered
     strip — drag or use the arrows to reorder; the first one is the main
     image.
  - "Also in: Blue" labels show which other colours already use an image,
    "Only show unassigned" hides images that are already used, and "Copy
    images from" reuses another colour's selection.
- The option that controls images is auto-detected (`Color`, `Colour`,
  `Farbe`, `Couleur`, …) and can be changed under Settings.
- The same image can belong to several colours. Videos and 3D models are
  supported too.
- **Auto-assign** matches images to colours by file name or alt text
  (`navy-blue-front.jpg` → "Navy Blue").
- Optionally sets each variant's own image to the colour's first image, so the
  right picture appears in the cart, checkout and order emails.
- "Manage colour images" link in the **More actions** menu of every product
  page in the Shopify admin.
- Contextual save bar, toasts, and a theme setup page with one-click links
  into the theme editor.

**Billing & App Store**

- $5 USD/month after a 30-day free trial, charged through Shopify's Billing
  API (`app/billing.ts`). The trial is once per store; development stores get
  test charges automatically.
- **Plan** page with trial days left, next billing date and Cancel.
- Public `/privacy` and `/support` pages for the App Store listing; draft
  listing copy in [APP_STORE_LISTING.md](./APP_STORE_LISTING.md).

**Storefront (theme app extension — no theme code edits)**

- **App embed "Variant images"** — filters the theme's own product gallery
  (slides + thumbnails + zoom modal). Works with Dawn and the other free
  Shopify themes out of the box; a CSS selector setting covers other themes.
- **App block "Variant image gallery"** — a self-contained gallery (main image,
  thumbnails below/left, arrows, swipe, counter) for themes whose gallery can't
  be filtered.
- Detects colour changes from radio buttons, dropdowns, button/link swatches,
  the `?variant=` URL, and theme variant events; re-applies automatically when
  a theme re-renders its gallery.
- Finds gallery images by media ID (Dawn and Shopify themes) **or by image
  file name**, so custom themes work without configuration; refreshes
  Swiper, Flickity and Slick sliders after filtering.
- Debug mode: add `?mvi_debug=1` to a product URL to log the detected colour
  and outline the gallery images found.
- Fallback for colours without images: show all images, or only "shared"
  images. Optionally append shared images (size charts, lifestyle shots) to
  every colour.
- ~4 KB gzipped JavaScript per bundle, no dependencies.

## How it works

```
Admin app (React Router + Polaris)            Storefront (theme app extension)
──────────────────────────────────           ─────────────────────────────────
Merchant assigns images per colour  ──►  product metafield  ──►  Liquid outputs JSON
                                multi_variant_images.config        │
                                         (type: json)              ▼
                                                           variant-images.js shows
                                                           only the selected colour's
                                                           images
```

The mapping is stored in a product metafield (`multi_variant_images.config`,
type `json`), so it lives with the product in Shopify — the app's own database
only holds OAuth sessions. A regular namespace is used so every theme can read
it in Liquid; mappings saved by the first release under `$app.variant_images`
are still read and are moved on the next save.

```jsonc
// product.metafields.multi_variant_images.config
{
  "version": 1,
  "optionId": "gid://shopify/ProductOption/123",
  "optionName": "Color",
  "values": [
    {
      "id": "gid://shopify/ProductOptionValue/456", // stable across renames
      "name": "Red",
      "media": ["gid://shopify/MediaImage/1", "gid://shopify/MediaImage/2"],
    },
  ],
  "updatedAt": "2026-10-21T10:00:00.000Z",
}
```

## Project structure

```
app/
  lib/variant-images.ts            shared types + matching/auto-assign logic (unit tested)
  models/variant-images.server.ts  Admin GraphQL: list products, load, save, sync variant images
  routes/app._index.tsx            product list
  routes/app.products.$id.tsx      colour → images editor
  routes/app.products.link.tsx     target of the admin "More actions" link
  routes/app.setup.tsx             theme setup instructions + deep links
  routes/app.plan.tsx              subscription / free trial / cancel
  routes/privacy.tsx, support.tsx  public pages for the App Store listing
  billing.ts, billing.server.ts    plan price + trial, test-store detection
  routes/webhooks.compliance.tsx   mandatory GDPR webhooks
extensions/
  variant-image-gallery/           theme app extension (app embed + app block)
  product-admin-link/              admin link on the product details page
storefront/variant-images.js       readable source of the storefront script
                                   (`npm run build:storefront` builds variant-images-theme.js
                                   and variant-images-block.js into the extension)
shopify.app.toml                   app config, scopes, metafield definition, webhooks
```

## Development

Requirements: Node.js 22.12+, [Shopify CLI](https://shopify.dev/docs/api/shopify-cli) (`npm i -g @shopify/cli`), a [Shopify Partner account](https://partners.shopify.com)
and a development store.

```sh
npm install
npm run config:link   # create/link the app in your Partner account (first time only)
npm run dev           # runs the app + extensions against your dev store
```

Press `P` in the CLI to open the app on your dev store. Then:

1. Open a product that has a colour option and several images, assign images
   to each colour, and save.
2. Go to **Theme setup** in the app and enable the app embed (or add the
   gallery block).
3. Open the product on your storefront and switch colours.

Useful scripts:

| Script                     | What it does                                           |
| -------------------------- | ------------------------------------------------------ |
| `npm run build`            | Minify the storefront script and build the server      |
| `npm run build:storefront` | Only rebuild `extensions/.../assets/variant-images.js` |
| `npm run typecheck`        | TypeScript                                             |
| `npm run lint`             | ESLint                                                 |
| `npm test`                 | Unit tests (Node test runner)                          |
| `npm run deploy`           | Push config + extensions as a new app version          |

> Edit `storefront/variant-images.js`, not the minified copy in the extension,
> and run `npm run build:storefront` before `npm run dev` / `npm run deploy`.

## Notes & limitations

- **Theme gallery order:** the app embed only shows/hides the theme's slides, so
  they keep the product's media order. The app block uses the order chosen in
  the app.
- **Dawn's "Hide other variants' media" setting** should be turned off — the
  app replaces that behaviour.
- Liquid exposes up to 250 variants per product to themes; products with more
  variants still work in the admin, and colour detection on the storefront
  falls back to the selected swatches.
- Products can have up to 250 media items (Shopify limit).
