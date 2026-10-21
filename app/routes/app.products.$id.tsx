import { useEffect, useMemo, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { SaveBar, useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import {
  clearVariantImages,
  getProduct,
  saveVariantImages,
} from "../models/variant-images.server";
import {
  autoAssignByName,
  numericId,
  selectionFromConfig,
  type ProductMedia,
} from "../lib/variant-images";
import styles from "../styles/editor.module.css";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const product = await getProduct(admin, params.id!);
  if (!product) {
    throw new Response("Product not found", { status: 404 });
  }
  return { product, shop: session.shop };
};

type ActionResult =
  | { ok: true; intent: "save"; variantsUpdated: number }
  | { ok: true; intent: "clear" }
  | { ok: false; error: string };

export const action = async ({
  request,
  params,
}: ActionFunctionArgs): Promise<ActionResult> => {
  const { admin } = await authenticate.admin(request);
  const body = (await request.json()) as {
    intent: "save" | "clear";
    optionId?: string;
    selection?: Record<string, string[]>;
    syncVariantImages?: boolean;
  };

  try {
    if (body.intent === "clear") {
      await clearVariantImages(admin, params.id!);
      return { ok: true, intent: "clear" };
    }

    // Re-read the product so we only ever store IDs that belong to it.
    const product = await getProduct(admin, params.id!);
    if (!product) return { ok: false, error: "Product not found" };

    const option = product.options.find((item) => item.id === body.optionId);
    if (!option) return { ok: false, error: "Choose a colour option first" };

    const validMedia = new Set(product.media.map((item) => item.id));
    const selection = Object.fromEntries(
      option.optionValues.map((value) => [
        value.id,
        [...new Set(body.selection?.[value.id] ?? [])].filter((id) =>
          validMedia.has(id),
        ),
      ]),
    );

    const { variantsUpdated } = await saveVariantImages(admin, {
      productId: product.id,
      option,
      selection,
      syncVariantImages: Boolean(body.syncVariantImages),
    });
    return { ok: true, intent: "save", variantsUpdated };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Something went wrong",
    };
  }
};

export default function ProductVariantImages() {
  const { product, shop } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionResult>();
  const shopify = useAppBridge();

  const [optionId, setOptionId] = useState(product.selectedOptionId ?? "");
  const option = product.options.find((item) => item.id === optionId) ?? null;

  const savedSelection = useMemo(
    () =>
      option ? selectionFromConfig(option, product.config, product.media) : {},
    [option, product.config, product.media],
  );
  const [selection, setSelection] = useState(savedSelection);
  const [syncVariantImages, setSyncVariantImages] = useState(true);

  // Reset local state whenever fresh data arrives from the loader
  // (after saving, or when the colour option is switched).
  const [baseline, setBaseline] = useState(savedSelection);
  if (baseline !== savedSelection) {
    setBaseline(savedSelection);
    setSelection(savedSelection);
  }

  const isDirty =
    optionId !== (product.selectedOptionId ?? "") ||
    JSON.stringify(selection) !== JSON.stringify(savedSelection);
  const isSaving = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (!fetcher.data.ok) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    } else if (fetcher.data.intent === "clear") {
      shopify.toast.show("Variant images removed");
    } else {
      const { variantsUpdated } = fetcher.data;
      shopify.toast.show(
        variantsUpdated
          ? `Saved · ${variantsUpdated} variant image${variantsUpdated === 1 ? "" : "s"} updated`
          : "Saved",
      );
    }
  }, [fetcher.state, fetcher.data, shopify]);

  const save = () =>
    fetcher.submit(
      { intent: "save", optionId, selection, syncVariantImages },
      { method: "POST", encType: "application/json" },
    );

  const discard = () => {
    setOptionId(product.selectedOptionId ?? "");
    setSelection(savedSelection);
  };

  const clearAll = () =>
    fetcher.submit(
      { intent: "clear" },
      { method: "POST", encType: "application/json" },
    );

  const toggle = (valueId: string, mediaId: string) =>
    setSelection((current) => {
      const list = current[valueId] ?? [];
      return {
        ...current,
        [valueId]: list.includes(mediaId)
          ? list.filter((id) => id !== mediaId)
          : [...list, mediaId],
      };
    });

  const setValue = (valueId: string, media: string[]) =>
    setSelection((current) => ({ ...current, [valueId]: media }));

  const moveFirst = (valueId: string, mediaId: string) =>
    setSelection((current) => ({
      ...current,
      [valueId]: [
        mediaId,
        ...(current[valueId] ?? []).filter((id) => id !== mediaId),
      ],
    }));

  const autoAssign = () => {
    if (!option) return;
    const suggestion = autoAssignByName(option, product.media);
    const matched = Object.values(suggestion).flat().length;
    if (!matched) {
      shopify.toast.show(
        "No matches. Include the colour name in image file names or alt text.",
        { isError: true },
      );
      return;
    }
    setSelection((current) => {
      const next = { ...current };
      for (const [valueId, media] of Object.entries(suggestion)) {
        if (media.length) next[valueId] = media;
      }
      return next;
    });
    shopify.toast.show(`Matched ${matched} image${matched === 1 ? "" : "s"}`);
  };

  const assigned = new Set(Object.values(selection).flat());
  const sharedCount = product.media.filter((m) => !assigned.has(m.id)).length;
  const storeHandle = shop.replace(".myshopify.com", "");
  const productAdminUrl = `https://admin.shopify.com/store/${storeHandle}/products/${numericId(product.id)}`;

  return (
    <s-page heading={product.title} inlineSize="large">
      <s-link slot="breadcrumb-actions" href="/app">
        Products
      </s-link>
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={save}
        disabled={!option}
        {...(isSaving ? { loading: true } : {})}
      >
        Save
      </s-button>
      <s-button slot="secondary-actions" href={productAdminUrl} target="_top">
        Edit product
      </s-button>
      {product.previewUrl && (
        <s-button
          slot="secondary-actions"
          href={product.previewUrl}
          target="_blank"
        >
          Preview on store
        </s-button>
      )}
      {product.config && (
        <s-button slot="secondary-actions" tone="critical" onClick={clearAll}>
          Remove all assignments
        </s-button>
      )}

      <SaveBar id="mvi-save-bar" open={isDirty}>
        <button variant="primary" onClick={save} disabled={isSaving}>
          Save
        </button>
        <button onClick={discard} disabled={isSaving}>
          Discard
        </button>
      </SaveBar>

      {product.media.length === 0 && (
        <s-banner tone="warning" heading="This product has no images yet">
          <s-paragraph>
            Upload all colour images to the product first, then come back here
            to assign them to colours.
          </s-paragraph>
          <s-button
            slot="secondary-actions"
            href={productAdminUrl}
            target="_top"
          >
            Add images
          </s-button>
        </s-banner>
      )}

      {product.options.length === 0 && (
        <s-banner tone="info" heading="This product has no variants">
          <s-paragraph>
            Add a colour option (for example “Color”) with its values to the
            product to assign images per colour.
          </s-paragraph>
        </s-banner>
      )}

      {product.options.length > 0 && (
        <s-section heading="Settings">
          <s-stack direction="block" gap="base">
            <s-select
              label="Option that controls the images"
              details="Usually “Color” or “Colour”. Every value of this option gets its own set of images."
              value={optionId}
              onChange={(event) => setOptionId(event.currentTarget.value)}
            >
              {product.options.map((item) => (
                <s-option key={item.id} value={item.id}>
                  {`${item.name} (${item.optionValues.length} values)`}
                </s-option>
              ))}
            </s-select>
            <s-checkbox
              label="Use the first image of each colour as the variant image"
              details="Shopify shows the variant image in the cart, checkout and order emails."
              checked={syncVariantImages}
              onChange={(event) =>
                setSyncVariantImages(event.currentTarget.checked)
              }
            />
            <s-stack direction="inline" gap="small-200">
              <s-button onClick={autoAssign} disabled={!option}>
                Auto-assign by file name / alt text
              </s-button>
            </s-stack>
          </s-stack>
        </s-section>
      )}

      {option &&
        product.media.length > 0 &&
        option.optionValues.map((value) => {
          const selected = selection[value.id] ?? [];
          return (
            <s-section key={value.id}>
              <s-stack direction="block" gap="base">
                <s-grid
                  gridTemplateColumns="1fr auto"
                  alignItems="center"
                  gap="base"
                >
                  <s-stack
                    direction="inline"
                    gap="small-200"
                    alignItems="center"
                  >
                    {value.swatchColor && (
                      <span
                        className={styles.swatch}
                        style={{ background: value.swatchColor }}
                      />
                    )}
                    <s-heading>{value.name}</s-heading>
                    <s-badge tone={selected.length ? "success" : "neutral"}>
                      {`${selected.length} selected`}
                    </s-badge>
                    {!value.hasVariants && (
                      <s-badge tone="warning">No variants</s-badge>
                    )}
                  </s-stack>
                  <s-button-group>
                    <s-button
                      slot="secondary-actions"
                      onClick={() =>
                        setValue(
                          value.id,
                          product.media.map((item) => item.id),
                        )
                      }
                    >
                      Select all
                    </s-button>
                    <s-button
                      slot="secondary-actions"
                      onClick={() => setValue(value.id, [])}
                      disabled={!selected.length}
                    >
                      Clear
                    </s-button>
                  </s-button-group>
                </s-grid>

                <MediaGrid
                  media={product.media}
                  selected={selected}
                  assignedElsewhere={assignedElsewhere(selection, value.id)}
                  onToggle={(mediaId) => toggle(value.id, mediaId)}
                  onMakeFirst={(mediaId) => moveFirst(value.id, mediaId)}
                />
              </s-stack>
            </s-section>
          );
        })}

      <s-section slot="aside" heading="How it works">
        <s-unordered-list>
          <s-list-item>
            Click images to assign them to a colour. The number shows the order;
            the first image is the main image and is used as the variant image.
          </s-list-item>
          <s-list-item>
            The same image can be used for several colours.
          </s-list-item>
          <s-list-item>
            Colours without images show all product images.
          </s-list-item>
        </s-unordered-list>
      </s-section>

      {option && (
        <s-section slot="aside" heading="Summary">
          <s-stack direction="block" gap="small-200">
            <s-text>
              {`${option.optionValues.filter((v) => (selection[v.id] ?? []).length).length} of ${option.optionValues.length} colours have images`}
            </s-text>
            <s-text color="subdued">
              {`${sharedCount} image${sharedCount === 1 ? " is" : "s are"} not assigned to any colour`}
            </s-text>
          </s-stack>
        </s-section>
      )}

      <s-section slot="aside" heading="Storefront">
        <s-paragraph>
          Make sure the gallery is enabled in your theme so customers see the
          selected colour&apos;s images.
        </s-paragraph>
        <s-link href="/app/setup">Theme setup</s-link>
      </s-section>
    </s-page>
  );
}

function assignedElsewhere(
  selection: Record<string, string[]>,
  valueId: string,
) {
  return new Set(
    Object.entries(selection)
      .filter(([id]) => id !== valueId)
      .flatMap(([, media]) => media),
  );
}

function MediaGrid({
  media,
  selected,
  assignedElsewhere,
  onToggle,
  onMakeFirst,
}: {
  media: ProductMedia[];
  selected: string[];
  assignedElsewhere: Set<string>;
  onToggle: (mediaId: string) => void;
  onMakeFirst: (mediaId: string) => void;
}) {
  return (
    <div className={styles.grid}>
      {media.map((item) => {
        const position = selected.indexOf(item.id);
        const isSelected = position !== -1;
        return (
          <div
            key={item.id}
            className={`${styles.tile} ${isSelected ? styles.selected : ""}`}
          >
            <button
              type="button"
              className={styles.tileButton}
              aria-pressed={isSelected}
              aria-label={`${isSelected ? "Remove" : "Add"} ${item.alt || "image"}`}
              onClick={() => onToggle(item.id)}
            >
              {item.url ? (
                <img src={item.url} alt={item.alt} loading="lazy" />
              ) : (
                <span className={styles.placeholder}>No preview</span>
              )}
              {isSelected && (
                <span className={styles.order}>{position + 1}</span>
              )}
              {item.mediaContentType !== "IMAGE" && (
                <span className={styles.type}>
                  {item.mediaContentType === "MODEL_3D" ? "3D" : "Video"}
                </span>
              )}
              {!isSelected && assignedElsewhere.has(item.id) && (
                <span className={styles.used}>Used</span>
              )}
            </button>
            {isSelected && position > 0 && (
              <button
                type="button"
                className={styles.makeFirst}
                onClick={() => onMakeFirst(item.id)}
              >
                Make main
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
