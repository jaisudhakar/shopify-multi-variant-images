import assert from "node:assert/strict";
import { test } from "node:test";

import { remainingTrialDays } from "./billing.server.ts";

const DAY = 24 * 60 * 60 * 1000;

function adminWith(
  nodes: { createdAt: string; status: string; test: boolean }[],
) {
  return {
    graphql: async () =>
      new Response(
        JSON.stringify({
          data: { currentAppInstallation: { allSubscriptions: { nodes } } },
        }),
      ),
  } as never;
}

const daysAgo = (days: number) =>
  new Date(Date.now() - days * DAY).toISOString();

test("full trial for a store that never subscribed", async () => {
  assert.equal(await remainingTrialDays(adminWith([]), false, 30), 30);
});

test("declined or expired requests don't use the trial", async () => {
  const admin = adminWith([
    { createdAt: daysAgo(10), status: "DECLINED", test: false },
    { createdAt: daysAgo(5), status: "EXPIRED", test: false },
  ]);
  assert.equal(await remainingTrialDays(admin, false, 30), 30);
});

test("resubscribing only offers the rest of the first trial", async () => {
  const admin = adminWith([
    { createdAt: daysAgo(12), status: "CANCELLED", test: false },
    { createdAt: daysAgo(3), status: "CANCELLED", test: false },
  ]);
  assert.equal(await remainingTrialDays(admin, false, 30), 18);
});

test("no trial left after it has run out", async () => {
  const admin = adminWith([
    { createdAt: daysAgo(45), status: "CANCELLED", test: false },
  ]);
  assert.equal(await remainingTrialDays(admin, false, 30), 0);
});

test("test subscriptions don't count against real billing", async () => {
  const admin = adminWith([
    { createdAt: daysAgo(20), status: "CANCELLED", test: true },
  ]);
  assert.equal(await remainingTrialDays(admin, false, 30), 30);
});
