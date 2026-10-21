import assert from "node:assert/strict";
import { test } from "node:test";

import {
  autoAssignByName,
  buildConfig,
  detectColorOption,
  selectionFromConfig,
  type ProductMedia,
  type ProductOption,
} from "./variant-images.ts";

const color: ProductOption = {
  id: "gid://shopify/ProductOption/1",
  name: "Colour",
  position: 1,
  optionValues: [
    { id: "gid://shopify/ProductOptionValue/1", name: "Blue" },
    { id: "gid://shopify/ProductOptionValue/2", name: "Light Blue" },
    { id: "gid://shopify/ProductOptionValue/3", name: "Red" },
  ],
};

const media: ProductMedia[] = [
  {
    id: "m1",
    alt: "",
    url: "https://cdn/x/files/light-blue-front.jpg?v=1",
    mediaContentType: "IMAGE",
  },
  {
    id: "m2",
    alt: "Blue back view",
    url: "https://cdn/x/files/IMG_2.jpg",
    mediaContentType: "IMAGE",
  },
  {
    id: "m3",
    alt: "",
    url: "https://cdn/x/files/red_side.png",
    mediaContentType: "IMAGE",
  },
  {
    id: "m4",
    alt: "Size chart",
    url: "https://cdn/x/files/chart.png",
    mediaContentType: "IMAGE",
  },
];

test("detectColorOption finds colour in several languages", () => {
  assert.equal(
    detectColorOption([{ name: "Size" }, { name: "Colour" }])?.name,
    "Colour",
  );
  assert.equal(detectColorOption([{ name: "Farbe" }])?.name, "Farbe");
  assert.equal(detectColorOption([{ name: "Size" }]), null);
});

test("autoAssignByName prefers the longest colour name", () => {
  assert.deepEqual(autoAssignByName(color, media), {
    "gid://shopify/ProductOptionValue/1": ["m2"],
    "gid://shopify/ProductOptionValue/2": ["m1"],
    "gid://shopify/ProductOptionValue/3": ["m3"],
  });
});

test("selectionFromConfig matches by id, then name, and drops deleted media", () => {
  const stored = buildConfig(
    {
      ...color,
      optionValues: [
        { id: "gid://shopify/ProductOptionValue/1", name: "Navy" },
        { id: "gid://shopify/ProductOptionValue/99", name: "Red" },
      ],
    },
    {
      "gid://shopify/ProductOptionValue/1": ["m2", "deleted"],
      "gid://shopify/ProductOptionValue/99": ["m3"],
    },
  );

  assert.deepEqual(selectionFromConfig(color, stored, media), {
    "gid://shopify/ProductOptionValue/1": ["m2"],
    "gid://shopify/ProductOptionValue/2": [],
    "gid://shopify/ProductOptionValue/3": ["m3"],
  });
});
