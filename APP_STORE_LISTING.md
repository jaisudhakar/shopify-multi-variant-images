# Shopify App Store listing — ready-to-paste content

Paste these into the Dev Dashboard / Partner Dashboard → your app →
**Distribution → Manage Shopify App Store listing**. Replace anything in
`<angle brackets>`. Character limits are Shopify's at the time of writing; the
form shows a live counter.

---

## Basic app information

**App name** (max 30)

> Multi Variant Images

**App icon** — 1200 × 1200 px PNG/JPG, no text, no rounded corners (Shopify
rounds them). Suggested: a product photo stack with three colour dots.

**App card subtitle / tagline** (max 62)

> Show the right photos for every colour variant

**Primary category:** Store design → Product display (or "Images and media").

---

## App Store listing content

**App introduction** (max 100)

> Give each colour its own photo gallery. Shoppers only see images of the colour they pick.

**App details** (max 500)

> Shopify lets you attach only one image to a variant, so shoppers scroll
> through every colour's photos to find the one they want. Multi Variant Images
> lets you pick as many images as you like for each colour — or upload new
> ones straight into a colour — and set their order. On your product page, the
> gallery instantly switches to the selected colour's images. Works with your
> existing theme gallery, no code edits, and uninstalls cleanly.

**Feature list** (up to 5 × max 80)

> - Assign unlimited images to each colour, in the order you choose
> - Upload new photos straight into a colour from the app
> - Gallery switches instantly when shoppers pick a colour
> - Works with Dawn and most themes — no code edits needed
> - Sets each variant's image so the cart and checkout show the right colour

**Pricing** (must match the app's billing exactly)

- Pricing type: **Recurring charge**
- Plan name: **Pro**
- Price: **$5 USD / month**
- Free trial: **30 days**
- Plan features: Unlimited products and colours · Unlimited images per colour ·
  Theme gallery filtering and gallery block · Upload images into a colour

> Leave Partner Dashboard **"Managed pricing" off**. This app charges through the
> Billing API in code (`app/billing.ts`); turning managed pricing on would make
> those charges fail.

**Screenshots** — 1600 × 900 px (desktop), 3–6 images. Suggested set:

1. The editor with a colour selected, its ordered images and the image library
   ("Assign images to each colour").
2. A product page on Dawn showing only the Red images, next to the same page
   with Blue selected ("Shoppers only see the colour they chose").
3. Uploading images straight into a colour.
4. The Theme setup page / app embed toggle ("No code — turn it on in the
   theme editor").
5. The Plan page ("$5/month, 30-day free trial").

**Demo store URL** (optional): `<https://your-demo-store.myshopify.com/products/...>`
— a product with a Color option and several images per colour.

**Promotional video** (optional): 30–90 s screen recording of the flow above.

---

## Support & legal

| Field                       | Value                                             |
| --------------------------- | ------------------------------------------------- |
| Privacy policy URL          | `https://<your-app-url>/privacy`                  |
| FAQ / support URL           | `https://<your-app-url>/support`                  |
| Support email               | `<the same address as SUPPORT_EMAIL>`             |
| Emergency developer contact | `<your phone + email>` (Shopify only, not public) |

Set `SUPPORT_EMAIL` (and optionally `COMPANY_NAME`) on your server so both
public pages show your contact details.

---

## Testing instructions for the reviewer

Paste into **App testing information**:

> 1. Install the app. You'll land on the Plan page — click **Start 30-day free
>    trial** and approve (development stores get a test charge).
> 2. In **Products**, open any product with a **Color** option and several
>    images (or use "<demo product name>" on our test store).
> 3. Click a colour (e.g. Red), click the images that belong to it — or upload
>    new ones — reorder by dragging, then click **Save**. Repeat for another
>    colour.
> 4. Open **Theme setup** and click **Enable app embed**, then save the theme.
> 5. Open the product on the storefront and switch colours: the gallery shows
>    only that colour's images.
> 6. **Plan** shows the trial and lets you cancel.
>
> Storefront password for our test store: `<password>`

---

## Before you click "Submit for review"

- [ ] App is deployed to your production URL and `npm run deploy` has been run
      against the production app config.
- [ ] Install → trial approval → editor → storefront works on a fresh
      development store.
- [ ] Declining the charge returns to the Plan page (not an error).
- [ ] Uninstall and reinstall works.
- [ ] Listing pricing says exactly: $5 USD / month, 30-day free trial.
- [ ] Privacy and support pages load and show your contact email.
- [ ] Screenshots don't include personal data, browser chrome or Shopify
      admin URLs with real store names you don't own.
