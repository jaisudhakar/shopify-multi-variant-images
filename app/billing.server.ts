import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

const testStoreCache = new Map<string, boolean>();

/**
 * Development stores (including the ones Shopify's app reviewers use) can only
 * accept test charges; every other store is billed for real.
 * Set BILLING_TEST=true to force test charges everywhere (e.g. staging).
 */
export async function isTestStore(admin: AdminApiContext, shop: string) {
  if (process.env.BILLING_TEST === "true") return true;

  const cached = testStoreCache.get(shop);
  if (cached !== undefined) return cached;

  const response = await admin.graphql(`#graphql
    query MviShopPlan {
      shop {
        plan {
          partnerDevelopment
        }
      }
    }
  `);
  const json = (await response.json()) as {
    data?: { shop: { plan: { partnerDevelopment: boolean } } };
  };
  const isTest = json.data?.shop.plan.partnerDevelopment ?? false;
  testStoreCache.set(shop, isTest);
  return isTest;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * The free trial is once per store: if the merchant already started a plan
 * (and cancelled it), only the days left from the first trial are offered.
 */
export async function remainingTrialDays(
  admin: AdminApiContext,
  isTest: boolean,
  trialDays: number,
) {
  const response = await admin.graphql(`#graphql
    query MviSubscriptionHistory {
      currentAppInstallation {
        allSubscriptions(first: 25, sortKey: CREATED_AT) {
          nodes {
            createdAt
            status
            test
          }
        }
      }
    }
  `);
  const json = (await response.json()) as {
    data?: {
      currentAppInstallation: {
        allSubscriptions: {
          nodes: { createdAt: string; status: string; test: boolean }[];
        };
      };
    };
  };

  // Declined or never-approved (expired) requests don't use up the trial.
  const started = (
    json.data?.currentAppInstallation.allSubscriptions.nodes ?? []
  ).filter(
    (subscription) =>
      subscription.test === isTest &&
      ["ACTIVE", "CANCELLED", "FROZEN"].includes(subscription.status),
  );
  if (!started.length) return trialDays;

  const first = Math.min(
    ...started.map((subscription) => Date.parse(subscription.createdAt)),
  );
  const used = Math.floor((Date.now() - first) / DAY);
  return Math.max(0, trialDays - used);
}
