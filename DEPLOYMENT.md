# Deploying & publishing on Shopify Partners

This guide takes the app from this repository to a live app in your Shopify
Partner account — either installed on specific stores (custom distribution)
or listed on the Shopify App Store (public distribution).

## 1. Prerequisites

- A Shopify Partner account: <https://partners.shopify.com/signup>
- A development store (Partner Dashboard → **Stores** → **Add store** →
  _Development store_) for testing.
- Node.js **22.12+** and Git.
- Shopify CLI: `npm install -g @shopify/cli@latest` (`shopify version` to check).

## 2. Create the app in your Partner account

```sh
git clone <this repo> && cd shopify-multi-variant-images
npm install
npm run config:link
```

`config:link` signs you in to your Partner account and asks whether to
**create a new app** or connect an existing one. Choose _Create new app_ and
name it "Multi Variant Images". The CLI writes the real `client_id` into
`shopify.app.toml`.

## 3. Test on a development store

```sh
npm run dev
```

The CLI starts a tunnel, updates the app URLs automatically, and deploys the
extensions as a development preview. Press `P` to install/open the app on your
dev store and run through the flow in the README (assign images → enable app
embed → check the product page).

## 4. Host the app

The app is a standard Node server (`npm run build && npm run start`, port 3000) with a `Dockerfile`. Any Node/Docker host works — e.g. Fly.io, Render,
Railway, Heroku, Google Cloud Run, or a VPS.

### Database

Sessions are stored with Prisma. SQLite (the default) is fine for a single
long-running server with a persistent disk. For hosts with ephemeral disks or
multiple instances, switch to PostgreSQL/MySQL:

```prisma
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Then delete `prisma/migrations`, point `DATABASE_URL` at your database, and
run `npx prisma migrate dev --name init` once to create a fresh migration.
The Docker image runs `prisma migrate deploy` on start.

### Environment variables

| Variable             | Value                                                                            |
| -------------------- | -------------------------------------------------------------------------------- |
| `SHOPIFY_API_KEY`    | Client ID (Partner Dashboard → your app → **API access**, or `npm run env show`) |
| `SHOPIFY_API_SECRET` | Client secret (same place)                                                       |
| `SHOPIFY_APP_URL`    | Public HTTPS URL of your deployment, e.g. `https://mvi.example.com`              |
| `SCOPES`             | `read_products,write_products`                                                   |
| `DATABASE_URL`       | Only when using PostgreSQL/MySQL                                                 |
| `NODE_ENV`           | `production`                                                                     |

Example with Fly.io:

```sh
fly launch --no-deploy          # detects the Dockerfile
fly secrets set SHOPIFY_API_KEY=... SHOPIFY_API_SECRET=... \
  SHOPIFY_APP_URL=https://<app>.fly.dev SCOPES=read_products,write_products
fly deploy
```

## 5. Point Shopify at your server and release a version

Edit `shopify.app.toml`:

```toml
application_url = "https://mvi.example.com"

[auth]
redirect_urls = ["https://mvi.example.com/api/auth"]
```

Then deploy the configuration and extensions:

```sh
npm run build:storefront   # make sure the minified storefront script is current
npm run deploy
```

`shopify app deploy` creates a new **app version** containing the app
configuration (URLs, scopes, webhooks, metafield definition), the theme app
extension and the admin link, and releases it to all stores that have the app
installed. You can see versions under Partner Dashboard → your app →
**Versions**.

## 6. Choose a distribution method

Until you do this, installing on any store other than your own dev stores
shows _"This app can't be installed yet. The app developer needs to select a
distribution method first."_ This is a dashboard setting, not code.

Open the app in the **Dev Dashboard** (<https://dev.shopify.com>, or Partner
Dashboard → **Apps** → your app). On the app's Home, find the **Distribution**
card → **Select distribution method** → choose one → confirm. The choice
can't be changed later.

| You want                                 | Choose              | Review needed |
| ---------------------------------------- | ------------------- | ------------- |
| Any merchant can install it (all stores) | Public distribution | Yes           |
| One store, or stores in one Plus org     | Custom distribution | No            |

With **Public distribution**, the app installs on development stores right
away; other merchants' stores can install it once Shopify approves your App
Store submission.

### Custom distribution (one store / one Plus organisation)

Pick **Custom distribution**, enter the store's `*.myshopify.com` domain, and
share the generated install link with the merchant. No App Store review
needed. (This choice can't be changed later.)

### Public distribution (Shopify App Store)

Pick **Public distribution**, then complete **App Store listing** and submit
for review. Checklist for this app:

- [x] Embedded app using session-token auth (App Bridge) — built in.
- [x] Mandatory compliance webhooks (`customers/data_request`,
      `customers/redact`, `shop/redact`) — `app/routes/webhooks.compliance.tsx`.
- [x] Storefront changes only through a theme app extension (no theme file
      edits, works with Online Store 2.0 themes, uninstall leaves the theme clean).
- [x] Minimal scopes: `read_products,write_products`.
- [x] Lightweight storefront script (~4 KB gzipped) to keep the Lighthouse
      impact low.
- [ ] App listing: name, 1200×1200 app icon, short description, detailed
      description, at least 3 screenshots (1600×900), optional demo video.
- [ ] Privacy policy URL (state that no customer data is collected; only
      shop sessions are stored).
- [ ] Support email/URL and emergency developer contact.
- [ ] Pricing. If you charge, add Shopify Billing API plans (managed pricing
      in the Partner Dashboard is the simplest option) — the app is free as
      shipped.
- [ ] Testing instructions for reviewers, e.g. _"Open any product with a Color
      option → Products → click the product → assign images to each colour →
      Save → Theme setup → Enable app embed → view the product page and switch
      colours."_ Include a dev store with demo products if possible.

Review typically takes a few business days; reviewers will email you through
the Partner Dashboard with any required changes.

## Updating the app later

Ship server changes by redeploying your host. Ship extension/config changes
with `npm run deploy` — merchants get the new version automatically.

## Troubleshooting

- **`deploy` complains about the admin link extension** — the
  `extensions/product-admin-link` extension is optional; you can delete the
  folder and deploy again. Merchants can still open products from the app.
- **Product page doesn't filter images** — make sure the app embed is enabled
  in the published theme, and see the troubleshooting section on the app's
  **Theme setup** page.
- **"This app can't be installed yet … select a distribution method"** —
  see step 6: pick a distribution method on the app's Distribution card.
- **Public app installs on dev stores but not on a merchant's store** — the
  App Store review hasn't been approved yet; submit the listing (step 6).
- **"Unable to find an app" in the CLI** — run `npm run config:link` again.
