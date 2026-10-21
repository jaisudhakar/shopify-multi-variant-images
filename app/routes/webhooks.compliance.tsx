import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// Mandatory privacy compliance webhooks for App Store apps.
// This app never stores customer data: colour/image assignments live in
// product metafields on the shop, and the only data in our database is the
// OAuth session for the shop.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST":
    case "CUSTOMERS_REDACT":
      // No customer data is stored — nothing to return or delete.
      break;
    case "SHOP_REDACT":
      // Sent 48 hours after uninstall: remove everything we hold for the shop.
      await db.session.deleteMany({ where: { shop } });
      break;
  }

  return new Response();
};
