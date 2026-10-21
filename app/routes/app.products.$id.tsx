import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";
import { SaveBar, useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import {
  clearVariantImages,
  getProduct,
  saveVariantImages,
  uploadProductImages,
} from "../models/variant-images.server";
import {
  autoAssignByName,
  isColorOptionName,
  numericId,
  selectionFromConfig,
  type ProductMedia,
  type ProductOptionValue,
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
  | { ok: true; intent: "upload"; valueId: string; mediaIds: string[] }
  | { ok: false; error: string };

export const action = async ({
  request,
  params,
}: ActionFunctionArgs): Promise<ActionResult> => {
  const { admin } = await authenticate.admin(request);

  try {
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData();
      const valueId = String(form.get("valueId") ?? "");
      const files = form
        .getAll("files")
        .filter((file): file is File => file instanceof File && file.size > 0);
      const mediaIds = await uploadProductImages(
        admin,
        params.id!,
        files,
        String(form.get("alt") ?? ""),
      );
      return { ok: true, intent: "upload", valueId, mediaIds };
    }

    const body = (await request.json()) as {
      intent: "save" | "clear";
      optionId?: string;
      selection?: Record<string, string[]>;
      syncVariantImages?: boolean;
    };

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
  const uploader = useFetcher<ActionResult>();
  const revalidator = useRevalidator();
  const shopify = useAppBridge();

  /* ---------------------------------------------------------------- state */

  const [optionId, setOptionId] = useState(product.selectedOptionId ?? "");
  const option = product.options.find((item) => item.id === optionId) ?? null;

  const savedSelection = useMemo(
    () =>
      option ? selectionFromConfig(option, product.config, product.media) : {},
    [option, product.config, product.media],
  );
  const savedKey = JSON.stringify(savedSelection);
  const [selection, setSelection] = useState(savedSelection);
  const [syncVariantImages, setSyncVariantImages] = useState(true);
  const [activeValueId, setActiveValueId] = useState(
    option?.optionValues[0]?.id ?? "",
  );
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);

  // Reset local state when the saved mapping changes (after saving, or when
  // switching the colour option). Uploading images doesn't change it, so
  // unsaved picks survive uploads.
  const [baselineKey, setBaselineKey] = useState(savedKey);
  if (baselineKey !== savedKey) {
    setBaselineKey(savedKey);
    setSelection(savedSelection);
  }

  const activeValue =
    option?.optionValues.find((value) => value.id === activeValueId) ??
    option?.optionValues[0] ??
    null;
  const selected = activeValue ? (selection[activeValue.id] ?? []) : [];

  const isDirty =
    optionId !== (product.selectedOptionId ?? "") ||
    JSON.stringify(selection) !== savedKey;
  const isSaving = fetcher.state !== "idle";
  const isUploading = uploader.state !== "idle";

  const mediaById = useMemo(
    () => new Map(product.media.map((item) => [item.id, item])),
    [product.media],
  );

  // Which colours use each image, for the labels in the library.
  const usage = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const value of option?.optionValues ?? []) {
      for (const id of selection[value.id] ?? []) {
        map.set(id, [...(map.get(id) ?? []), value.name]);
      }
    }
    return map;
  }, [option, selection]);

  /* -------------------------------------------------------------- effects */

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (!fetcher.data.ok) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    } else if (fetcher.data.intent === "clear") {
      shopify.toast.show("All colour images removed");
    } else if (fetcher.data.intent === "save") {
      const { variantsUpdated } = fetcher.data;
      shopify.toast.show(
        variantsUpdated
          ? `Saved · ${variantsUpdated} variant image${variantsUpdated === 1 ? "" : "s"} updated`
          : "Saved",
      );
    }
  }, [fetcher.state, fetcher.data, shopify]);

  // Assign freshly uploaded images to the colour they were uploaded for
  // (state derived during render, toast as a side effect).
  const uploadResult = uploader.state === "idle" ? uploader.data : undefined;
  const [appliedUpload, setAppliedUpload] = useState<unknown>(null);
  if (uploadResult && uploadResult !== appliedUpload) {
    setAppliedUpload(uploadResult);
    if (uploadResult.ok && uploadResult.intent === "upload") {
      const { valueId, mediaIds } = uploadResult;
      setSelection((current) => {
        const existing = current[valueId] ?? [];
        return {
          ...current,
          [valueId]: [
            ...existing,
            ...mediaIds.filter((id) => !existing.includes(id)),
          ],
        };
      });
    }
  }
  const toastedUpload = useRef<unknown>(null);
  useEffect(() => {
    if (!uploadResult || toastedUpload.current === uploadResult) return;
    toastedUpload.current = uploadResult;
    if (!uploadResult.ok) {
      shopify.toast.show(uploadResult.error, { isError: true });
    } else if (uploadResult.intent === "upload") {
      const count = uploadResult.mediaIds.length;
      shopify.toast.show(
        `Uploaded ${count} image${count === 1 ? "" : "s"} — click Save to publish`,
      );
    }
  }, [uploadResult, shopify]);

  // Shopify needs a few seconds to process uploads; refresh until done.
  const hasProcessing = product.media.some(
    (item) => item.processing || !item.url,
  );
  const polls = useRef(0);
  useEffect(() => {
    if (!hasProcessing || revalidator.state !== "idle" || polls.current > 20)
      return;
    const timer = setTimeout(() => {
      polls.current += 1;
      revalidator.revalidate();
    }, 2500);
    return () => clearTimeout(timer);
  }, [hasProcessing, revalidator]);

  /* -------------------------------------------------------------- actions */

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

  const setActive = (media: string[]) => {
    if (!activeValue) return;
    setSelection((current) => ({ ...current, [activeValue.id]: media }));
  };

  const toggle = (mediaId: string) =>
    setActive(
      selected.includes(mediaId)
        ? selected.filter((id) => id !== mediaId)
        : [...selected, mediaId],
    );

  const move = (from: number, to: number) => {
    if (to < 0 || to >= selected.length || from === to) return;
    const next = [...selected];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setActive(next);
  };

  const copyFrom = (valueId: string) => {
    const source = selection[valueId] ?? [];
    setActive([...source]);
  };

  const upload = (files: File[]) => {
    if (!activeValue || !files.length) return;
    const form = new FormData();
    form.append("valueId", activeValue.id);
    form.append("alt", `${product.title} - ${activeValue.name}`);
    files.forEach((file) => form.append("files", file));
    uploader.submit(form, { method: "POST", encType: "multipart/form-data" });
  };

  const autoAssign = () => {
    if (!option) return;
    const suggestion = autoAssignByName(option, product.media);
    const matched = Object.values(suggestion).flat().length;
    if (!matched) {
      shopify.toast.show(
        "No matches. Put the colour name in image file names or alt text.",
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

  /* ------------------------------------------------------------- render */

  const storeHandle = shop.replace(".myshopify.com", "");
  const productAdminUrl = `https://admin.shopify.com/store/${storeHandle}/products/${numericId(product.id)}`;
  const configuredCount =
    option?.optionValues.filter((v) => (selection[v.id] ?? []).length).length ??
    0;
  const library = onlyUnassigned
    ? product.media.filter((item) => !usage.has(item.id))
    : product.media;

  return (
    <s-page heading={product.title} inlineSize="large">
      <s-link slot="breadcrumb-actions" href="/app">
        Products
      </s-link>
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={save}
        disabled={!option || !isDirty}
        {...(isSaving ? { loading: true } : {})}
      >
        Save
      </s-button>
      <s-button slot="secondary-actions" href={productAdminUrl} target="_top">
        Edit product in Shopify
      </s-button>
      {product.previewUrl && (
        <s-button
          slot="secondary-actions"
          href={product.previewUrl}
          target="_blank"
        >
          View on store
        </s-button>
      )}
      {product.config && (
        <s-button slot="secondary-actions" tone="critical" onClick={clearAll}>
          Remove all colour images
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

      {product.options.length === 0 || !option ? (
        <NoColorOption productAdminUrl={productAdminUrl} />
      ) : (
        <>
          {!isColorOptionName(option.name) && (
            <s-banner tone="info" heading="Which option is the colour?">
              <s-paragraph>
                We couldn&apos;t find an option called “Color” or “Colour”, so
                images will change with “{option.name}”. Change it under
                Settings if that&apos;s not right.
              </s-paragraph>
            </s-banner>
          )}

          {/* Step 1 — pick a colour */}
          <s-section heading={`1. Choose a ${option.name.toLowerCase()}`}>
            <s-stack direction="block" gap="small-200">
              <s-text color="subdued">
                {`${configuredCount} of ${option.optionValues.length} have images. Pick one to choose its images.`}
              </s-text>
              <div className={styles.colors} role="tablist">
                {option.optionValues.map((value) => {
                  const count = (selection[value.id] ?? []).length;
                  const isActive = value.id === activeValue?.id;
                  const cover = mediaById.get(selection[value.id]?.[0] ?? "");
                  return (
                    <button
                      key={value.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      className={`${styles.colorChip} ${isActive ? styles.colorChipActive : ""}`}
                      onClick={() => setActiveValueId(value.id)}
                    >
                      {cover?.url ? (
                        <img
                          className={styles.colorCover}
                          src={cover.url}
                          alt=""
                        />
                      ) : (
                        <Swatch value={value} />
                      )}
                      <span className={styles.colorText}>
                        <span className={styles.colorName}>{value.name}</span>
                        <span
                          className={count ? styles.countOk : styles.countEmpty}
                        >
                          {count
                            ? `${count} image${count === 1 ? "" : "s"}`
                            : "No images yet"}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </s-stack>
          </s-section>

          {/* Step 2 — images for the chosen colour */}
          {activeValue && (
            <s-section heading={`2. Images for ${activeValue.name}`}>
              <s-stack direction="block" gap="base">
                <s-stack direction="block" gap="small-200">
                  <s-stack
                    direction="inline"
                    gap="small-200"
                    alignItems="center"
                  >
                    <Swatch value={activeValue} />
                    <s-heading>{`Shown when a shopper picks ${activeValue.name}`}</s-heading>
                  </s-stack>
                  <s-text color="subdued">
                    Drag to reorder or use the arrows. The first image is the
                    main image.
                  </s-text>
                </s-stack>

                <SelectedStrip
                  ids={selected}
                  mediaById={mediaById}
                  onMove={move}
                  onRemove={toggle}
                />

                <s-grid
                  gridTemplateColumns="1fr auto"
                  gap="small-200"
                  alignItems="center"
                >
                  <s-drop-zone
                    label={`Upload new images for ${activeValue.name}`}
                    accessibilityLabel={`Upload new images for ${activeValue.name}`}
                    accept="image/*"
                    multiple
                    disabled={isUploading}
                    onChange={(event) => {
                      upload([...event.currentTarget.files]);
                      event.currentTarget.files = [];
                    }}
                  />
                  <s-stack direction="block" gap="small-200">
                    <s-select
                      label="Copy images from"
                      value=""
                      onChange={(event) => copyFrom(event.currentTarget.value)}
                    >
                      <s-option value="">Choose…</s-option>
                      {option.optionValues
                        .filter(
                          (value) =>
                            value.id !== activeValue.id &&
                            (selection[value.id] ?? []).length,
                        )
                        .map((value) => (
                          <s-option key={value.id} value={value.id}>
                            {value.name}
                          </s-option>
                        ))}
                    </s-select>
                    <s-button
                      onClick={() => setActive([])}
                      disabled={!selected.length}
                    >
                      Clear {activeValue.name}
                    </s-button>
                  </s-stack>
                </s-grid>
                {isUploading && (
                  <s-stack
                    direction="inline"
                    gap="small-200"
                    alignItems="center"
                  >
                    <s-spinner size="base" accessibilityLabel="Uploading" />
                    <s-text>Uploading images…</s-text>
                  </s-stack>
                )}

                <s-divider />

                <s-grid
                  gridTemplateColumns="1fr auto"
                  gap="small-200"
                  alignItems="center"
                >
                  <s-stack direction="block" gap="small-100">
                    <s-heading>Product images</s-heading>
                    <s-text color="subdued">
                      {`Click images to add them to ${activeValue.name}. Click again to remove.`}
                    </s-text>
                  </s-stack>
                  <s-checkbox
                    label="Only show unassigned"
                    checked={onlyUnassigned}
                    onChange={(event) =>
                      setOnlyUnassigned(event.currentTarget.checked)
                    }
                  />
                </s-grid>

                {product.media.length === 0 ? (
                  <s-paragraph color="subdued">
                    This product has no images yet. Upload some above.
                  </s-paragraph>
                ) : (
                  <MediaLibrary
                    media={library}
                    selected={selected}
                    usage={usage}
                    activeName={activeValue.name}
                    onToggle={toggle}
                  />
                )}
              </s-stack>
            </s-section>
          )}
        </>
      )}

      {/* Aside */}
      {option && (
        <s-section slot="aside" heading="Overview">
          <s-stack direction="block" gap="small-200">
            {option.optionValues.map((value) => {
              const count = (selection[value.id] ?? []).length;
              return (
                <s-clickable
                  key={value.id}
                  onClick={() => setActiveValueId(value.id)}
                  padding="small-200"
                  borderRadius="base"
                  background={
                    value.id === activeValue?.id ? "subdued" : undefined
                  }
                >
                  <s-grid
                    gridTemplateColumns="auto 1fr auto"
                    gap="small-200"
                    alignItems="center"
                  >
                    <Swatch value={value} />
                    <s-text>{value.name}</s-text>
                    <s-badge tone={count ? "success" : "neutral"}>
                      {String(count)}
                    </s-badge>
                  </s-grid>
                </s-clickable>
              );
            })}
            <s-text color="subdued">
              {`${product.media.length - usage.size} image${product.media.length - usage.size === 1 ? " is" : "s are"} not used by any ${option.name.toLowerCase()}.`}
            </s-text>
            <s-button onClick={autoAssign}>Auto-assign by file name</s-button>
          </s-stack>
        </s-section>
      )}

      {product.options.length > 0 && (
        <s-section slot="aside" heading="Settings">
          <s-stack direction="block" gap="base">
            <s-select
              label="Images change with"
              value={optionId}
              onChange={(event) => setOptionId(event.currentTarget.value)}
            >
              {product.options.map((item) => (
                <s-option key={item.id} value={item.id}>
                  {item.name}
                </s-option>
              ))}
            </s-select>
            <s-checkbox
              label="Use each colour's main image as the variant image"
              details="Shows the right colour in the cart, checkout and order emails."
              checked={syncVariantImages}
              onChange={(event) =>
                setSyncVariantImages(event.currentTarget.checked)
              }
            />
          </s-stack>
        </s-section>
      )}

      <s-section slot="aside" heading="Not changing on your store?">
        <s-paragraph>
          Save here, then turn on the app embed in your theme.
        </s-paragraph>
        <s-link href="/app/setup">Theme setup &amp; troubleshooting</s-link>
      </s-section>
    </s-page>
  );
}

/* ------------------------------------------------------------------------ */
/* Pieces                                                                    */
/* ------------------------------------------------------------------------ */

function Swatch({ value }: { value: ProductOptionValue }) {
  // Invalid CSS colours (e.g. "Green Lake") are ignored by the browser and the
  // swatch just shows its neutral background.
  const color =
    value.swatchColor ?? value.name.toLowerCase().replace(/\s+/g, "");
  return <span className={styles.swatch} style={{ background: color }} />;
}

function NoColorOption({ productAdminUrl }: { productAdminUrl: string }) {
  return (
    <s-section>
      <s-stack direction="block" gap="base">
        <s-heading>This product has no colour option</s-heading>
        <s-paragraph>
          The app switches images when a shopper picks a colour variant. Add an
          option named “Color” (with values like Red, Blue…) to this product,
          then come back here.
        </s-paragraph>
        <s-paragraph color="subdued">
          If each colour is a separate product in your store, each product page
          already shows only its own images, so this app isn&apos;t needed for
          those products.
        </s-paragraph>
        <s-stack direction="inline">
          <s-button href={productAdminUrl} target="_top">
            Add a colour option
          </s-button>
        </s-stack>
      </s-stack>
    </s-section>
  );
}

function SelectedStrip({
  ids,
  mediaById,
  onMove,
  onRemove,
}: {
  ids: string[];
  mediaById: Map<string, ProductMedia>;
  onMove: (from: number, to: number) => void;
  onRemove: (id: string) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  if (!ids.length) {
    return (
      <div className={styles.stripEmpty}>
        No images selected yet. Click images below or upload new ones. Until you
        pick some, shoppers see all product images for this colour.
      </div>
    );
  }

  return (
    <ol className={styles.strip}>
      {ids.map((id, index) => {
        const item = mediaById.get(id);
        return (
          <li
            key={id}
            className={`${styles.stripItem} ${dragIndex === index ? styles.dragging : ""}`}
            draggable
            onDragStart={(event) => {
              setDragIndex(index);
              event.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (dragIndex !== null) onMove(dragIndex, index);
              setDragIndex(null);
            }}
            onDragEnd={() => setDragIndex(null)}
          >
            <div className={styles.stripImage}>
              <Thumb item={item} />
              <span className={styles.order}>
                {index === 0 ? "Main" : index + 1}
              </span>
              <button
                type="button"
                className={styles.remove}
                aria-label="Remove image"
                onClick={() => onRemove(id)}
              >
                ×
              </button>
            </div>
            <div className={styles.stripControls}>
              <button
                type="button"
                aria-label="Move left"
                disabled={index === 0}
                onClick={() => onMove(index, index - 1)}
              >
                ←
              </button>
              <button
                type="button"
                aria-label="Move right"
                disabled={index === ids.length - 1}
                onClick={() => onMove(index, index + 1)}
              >
                →
              </button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function MediaLibrary({
  media,
  selected,
  usage,
  activeName,
  onToggle,
}: {
  media: ProductMedia[];
  selected: string[];
  usage: Map<string, string[]>;
  activeName: string;
  onToggle: (mediaId: string) => void;
}) {
  if (!media.length) {
    return (
      <s-paragraph color="subdued">
        Every image is already used by a colour.
      </s-paragraph>
    );
  }

  return (
    <div className={styles.grid}>
      {media.map((item) => {
        const isSelected = selected.includes(item.id);
        const usedBy = (usage.get(item.id) ?? []).filter(
          (name) => name !== activeName,
        );
        return (
          <button
            key={item.id}
            type="button"
            className={`${styles.tile} ${isSelected ? styles.selected : ""}`}
            aria-pressed={isSelected}
            aria-label={`${isSelected ? "Remove from" : "Add to"} ${activeName}: ${item.alt || "image"}`}
            onClick={() => onToggle(item.id)}
          >
            <span className={styles.tileImage}>
              <Thumb item={item} />
              <span className={styles.check} aria-hidden="true">
                {isSelected ? "✓" : ""}
              </span>
              {item.mediaContentType !== "IMAGE" && (
                <span className={styles.type}>
                  {item.mediaContentType === "MODEL_3D" ? "3D" : "Video"}
                </span>
              )}
            </span>
            <span className={styles.usage}>
              {usedBy.length ? `Also in: ${usedBy.join(", ")}` : " "}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Thumb({ item }: { item?: ProductMedia }) {
  if (!item) return <span className={styles.placeholder}>Deleted</span>;
  if (!item.url || item.processing) {
    return <span className={styles.placeholder}>Processing…</span>;
  }
  return <img src={item.url} alt={item.alt} loading="lazy" draggable={false} />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
