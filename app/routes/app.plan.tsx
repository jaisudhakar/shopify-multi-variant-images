import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import {
  MONTHLY_PLAN,
  PLAN_CURRENCY,
  PLAN_PRICE,
  TRIAL_DAYS,
} from "../billing";
import { isTestStore, remainingTrialDays } from "../billing.server";

const DAY = 24 * 60 * 60 * 1000;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, billing, session } = await authenticate.admin(request);
  const isTest = await isTestStore(admin, session.shop);
  const { appSubscriptions } = await billing.check({
    plans: [MONTHLY_PLAN],
    isTest,
  });

  const subscription = appSubscriptions[0];
  if (!subscription) {
    const trialDaysAvailable = await remainingTrialDays(
      admin,
      isTest,
      TRIAL_DAYS,
    );
    return { subscription: null, isTest, trialDaysAvailable };
  }

  // Shopify doesn't return the trial end date, so derive it.
  const createdAt = new Date(subscription.createdAt ?? Date.now());
  const trialEndsAt = new Date(
    createdAt.getTime() + (subscription.trialDays ?? 0) * DAY,
  );
  const trialDaysLeft = Math.max(
    0,
    Math.ceil((trialEndsAt.getTime() - Date.now()) / DAY),
  );

  return {
    isTest,
    trialDaysAvailable: 0,
    subscription: {
      id: subscription.id,
      name: subscription.name,
      status: subscription.status,
      test: subscription.test,
      trialDaysLeft,
      trialEndsAt: trialEndsAt.toISOString(),
      currentPeriodEnd: subscription.currentPeriodEnd ?? null,
    },
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, billing, redirect, session } =
    await authenticate.admin(request);
  const isTest = await isTestStore(admin, session.shop);
  const form = await request.formData();

  if (form.get("intent") === "cancel") {
    const subscriptionId = String(form.get("subscriptionId"));
    await billing.cancel({ subscriptionId, isTest, prorate: true });
    return redirect("/app/plan");
  }

  // Sends the merchant to Shopify's approval page; they come back to the app.
  return billing.request({
    plan: MONTHLY_PLAN,
    isTest,
    trialDays: await remainingTrialDays(admin, isTest, TRIAL_DAYS),
  });
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

export default function Plan() {
  const { subscription, isTest, trialDaysAvailable } =
    useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const price = `$${PLAN_PRICE} ${PLAN_CURRENCY}`;

  return (
    <s-page heading="Plan">
      {isTest && (
        <s-banner tone="info" heading="Development store">
          <s-paragraph>
            This is a development store, so charges are test charges and nothing
            is billed.
          </s-paragraph>
        </s-banner>
      )}

      {subscription ? (
        <s-section heading={`${MONTHLY_PLAN} plan`}>
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" gap="small-200" alignItems="center">
              <s-heading>{`${price} / month`}</s-heading>
              {subscription.trialDaysLeft > 0 ? (
                <s-badge tone="info">
                  {`Free trial · ${subscription.trialDaysLeft} day${subscription.trialDaysLeft === 1 ? "" : "s"} left`}
                </s-badge>
              ) : (
                <s-badge tone="success">Active</s-badge>
              )}
              {subscription.test && <s-badge>Test</s-badge>}
            </s-stack>

            <s-paragraph>
              {subscription.trialDaysLeft > 0
                ? `Your free trial ends on ${formatDate(subscription.trialEndsAt)}. After that, ${price} is added to your Shopify bill every 30 days.`
                : subscription.currentPeriodEnd
                  ? `Next charge on ${formatDate(subscription.currentPeriodEnd)}, on your Shopify bill.`
                  : `Billed every 30 days on your Shopify bill.`}
            </s-paragraph>

            <s-unordered-list>
              <s-list-item>Unlimited products and colours</s-list-item>
              <s-list-item>Unlimited images per colour</s-list-item>
              <s-list-item>
                Theme gallery filtering and gallery block
              </s-list-item>
            </s-unordered-list>

            <Form method="post">
              <input type="hidden" name="intent" value="cancel" />
              <input
                type="hidden"
                name="subscriptionId"
                value={subscription.id}
              />
              <s-button type="submit" tone="critical" disabled={busy}>
                Cancel plan
              </s-button>
            </Form>
            <s-text color="subdued">
              Cancelling stops the colour images on your product pages. You can
              also uninstall the app at any time; Shopify stops billing
              automatically.
            </s-text>
          </s-stack>
        </s-section>
      ) : (
        <s-section
          heading={trialDaysAvailable ? "Start your free trial" : "Subscribe"}
        >
          <s-stack direction="block" gap="base">
            <s-heading>
              {trialDaysAvailable
                ? `${price} / month after a ${trialDaysAvailable}-day free trial`
                : `${price} / month`}
            </s-heading>
            <s-paragraph>
              Show the right images for every colour on your product pages.
              {trialDaysAvailable
                ? " You won't be charged during the trial, and you can cancel at any time from this page."
                : " Your free trial has already been used on this store. Cancel at any time from this page."}
            </s-paragraph>
            <s-unordered-list>
              <s-list-item>Unlimited products and colours</s-list-item>
              <s-list-item>Unlimited images per colour</s-list-item>
              <s-list-item>Upload images straight into a colour</s-list-item>
              <s-list-item>Works with your theme, no code edits</s-list-item>
            </s-unordered-list>
            <Form method="post">
              <input type="hidden" name="intent" value="subscribe" />
              <s-button
                type="submit"
                variant="primary"
                {...(busy ? { loading: true } : {})}
              >
                {trialDaysAvailable
                  ? `Start ${trialDaysAvailable}-day free trial`
                  : `Subscribe for ${price} / month`}
              </s-button>
            </Form>
            <s-text color="subdued">
              Billing is handled securely by Shopify and appears on your Shopify
              invoice.
            </s-text>
          </s-stack>
        </s-section>
      )}

      <s-section slot="aside" heading="Need help?">
        <s-stack direction="block" gap="small-200">
          <s-link href="/support" target="_blank">
            Help &amp; support
          </s-link>
          <s-link href="/privacy" target="_blank">
            Privacy policy
          </s-link>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
