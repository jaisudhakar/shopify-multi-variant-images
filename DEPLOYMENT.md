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
| `SUPPORT_EMAIL`      | Shown on `/support` and `/privacy` (required for the App Store listing)          |
| `COMPANY_NAME`       | Optional — your business name, shown in the privacy policy                       |
| `BILLING_TEST`       | Optional — `true` forces test charges everywhere (staging only)                  |

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
configuration (URLs, scopes, webhooks), the theme app
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
- [x] Billing through the Shopify Billing API: **$5 USD / 30 days with a
      30-day free trial** (`app/billing.ts`). Development stores, including
      reviewers' stores, automatically get test charges.
- [x] Privacy policy page at `/privacy` and help/FAQ page at `/support`.
- [x] No "enter your shop domain" login form (Shopify-managed install only).
- [ ] App listing: copy, pricing, screenshots and reviewer instructions are
      drafted in **[APP_STORE_LISTING.md](./APP_STORE_LISTING.md)** — paste
      them in and add your icon and screenshots.
- [ ] `SUPPORT_EMAIL` set on the server; emergency developer contact entered
      in the listing.

## 7. Billing

Pricing lives in `app/billing.ts`:

```ts
export const MONTHLY_PLAN = "Pro";
export const PLAN_PRICE = 5;
export const PLAN_CURRENCY = "USD";
export const TRIAL_DAYS = 30;
```

How it works:

1. After install, every app page checks for an active subscription. Without
   one, the merchant lands on **Plan**, which shows the price and a
   **Start 30-day free trial** button.
2. The button opens Shopify's charge-approval page. After approving, the
   merchant returns to the app. Nothing is charged until the trial ends; then
   $5 is added to their Shopify invoice every 30 days.
3. **Plan** shows the days left in the trial (or the next billing date) and
   a **Cancel plan** button. Uninstalling also stops billing automatically.
4. The trial is once per store: cancelling and subscribing again only offers
   the days left from the first trial.
5. Development stores can't be charged, so they get test subscriptions
   (marked "Test"). Every other store is billed for real.

Changing the price later: edit `app/billing.ts`, redeploy the server, and
update the listing's pricing section. Existing subscribers stay on their
current price until they subscribe again.

Keep **Managed pricing** turned off in the Partner Dashboard — this app uses
the Billing API, and the two can't be combined.

> Shopify pays out app revenue to the payout details in your Partner account
> (Partner Dashboard → **Payouts**); add them before you go live.

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
