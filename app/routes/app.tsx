import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { MONTHLY_PLAN } from "../billing";
import { isTestStore } from "../billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, billing, redirect, session } =
    await authenticate.admin(request);

  // Every app page needs an active subscription (or free trial), except the
  // Plan page, which is where merchants start one.
  if (new URL(request.url).pathname !== "/app/plan") {
    await billing.require({
      plans: [MONTHLY_PLAN],
      isTest: await isTestStore(admin, session.shop),
      onFailure: async () => redirect("/app/plan"),
    });
  }

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Products</s-link>
        <s-link href="/app/setup">Theme setup</s-link>
        <s-link href="/app/plan">Plan</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
