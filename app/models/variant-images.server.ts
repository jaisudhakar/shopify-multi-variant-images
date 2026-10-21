import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import {
  LEGACY_METAFIELD_KEY,
  LEGACY_METAFIELD_NAMESPACE,
  METAFIELD_KEY,
  METAFIELD_NAMESPACE,
  buildConfig,
  countConfiguredValues,
  detectColorOption,
  parseConfig,
  type ProductMedia,
  type ProductOption,
  type VariantImagesConfig,
} from "../lib/variant-images";

type Admin = AdminApiContext;

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

async function gql<T>(
  admin: Admin,
  query: string,
  variables?: Record<string, unknown>,
) {
  const response = await admin.graphql(query, { variables });
  const json = (await response.json()) as GraphQLResponse<T>;
  if (json.errors?.length) {
    throw new Error(json.errors.map((error) => error.message).join(", "));
  }
  return json.data as T;
}

function readConfig(product: {
  metafield: { value: string } | null;
  legacyMetafield: { value: string } | null;
}) {
  return (
    parseConfig(product.metafield?.value) ??
    parseConfig(product.legacyMetafield?.value)
  );
}

export function toProductGid(id: string) {
  return id.startsWith("gid://") ? id : `gid://shopify/Product/${id}`;
}

/* -------------------------------------------------------------------------- */
/* Product list                                                               */
/* -------------------------------------------------------------------------- */

const PRODUCTS_QUERY = `#graphql
  query MviProducts($first: Int, $last: Int, $after: String, $before: String, $query: String) {
    products(first: $first, last: $last, after: $after, before: $before, query: $query, sortKey: UPDATED_AT, reverse: true) {
      nodes {
        id
        title
        status
        featuredMedia {
          preview {
            image {
              url(transform: { maxWidth: 120, maxHeight: 120 })
              altText
            }
          }
        }
        mediaCount {
          count
        }
        options {
          id
          name
          optionValues {
            id
          }
        }
        metafield(namespace: "multi_variant_images", key: "config") {
          value
        }
        legacyMetafield: metafield(namespace: "$app", key: "variant_images") {
          value
        }
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
`;

interface ProductsQueryData {
  products: {
    nodes: {
      id: string;
      title: string;
      status: string;
      featuredMedia: {
        preview: { image: { url: string; altText: string | null } | null };
      } | null;
      mediaCount: { count: number } | null;
      options: { id: string; name: string; optionValues: { id: string }[] }[];
      metafield: { value: string } | null;
      legacyMetafield: { value: string } | null;
    }[];
    pageInfo: {
      hasNextPage: boolean;
      hasPreviousPage: boolean;
      startCursor: string | null;
      endCursor: string | null;
    };
  };
}

export async function listProducts(
  admin: Admin,
  {
    search,
    after,
    before,
  }: { search?: string | null; after?: string | null; before?: string | null },
) {
  const pageSize = 20;
  const data = await gql<ProductsQueryData>(admin, PRODUCTS_QUERY, {
    ...(before
      ? { last: pageSize, before }
      : { first: pageSize, after: after || null }),
    query: search ? `title:*${search.replace(/[*:"\\]/g, " ")}*` : null,
  });

  return {
    pageInfo: data.products.pageInfo,
    products: data.products.nodes.map((product) => {
      const colorOption = detectColorOption(product.options);
      const config = readConfig(product);
      return {
        id: product.id,
        title: product.title,
        status: product.status,
        image: product.featuredMedia?.preview?.image?.url ?? null,
        imageAlt: product.featuredMedia?.preview?.image?.altText ?? "",
        mediaCount: product.mediaCount?.count ?? 0,
        colorOptionName: config?.optionName ?? colorOption?.name ?? null,
        colorCount: colorOption?.optionValues.length ?? 0,
        configuredCount: countConfiguredValues(config),
      };
    }),
  };
}

/* -------------------------------------------------------------------------- */
/* Single product (editor)                                                    */
/* -------------------------------------------------------------------------- */

const PRODUCT_QUERY = `#graphql
  query MviProduct($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      status
      onlineStorePreviewUrl
      options {
        id
        name
        position
        optionValues {
          id
          name
          hasVariants
          swatch {
            color
          }
        }
      }
      media(first: 250) {
        nodes {
          id
          alt
          status
          mediaContentType
          preview {
            image {
              url(transform: { maxWidth: 400, maxHeight: 400 })
            }
          }
        }
      }
      metafield(namespace: "multi_variant_images", key: "config") {
        value
      }
      legacyMetafield: metafield(namespace: "$app", key: "variant_images") {
        value
      }
    }
  }
`;

interface ProductQueryData {
  product: {
    id: string;
    title: string;
    handle: string;
    status: string;
    onlineStorePreviewUrl: string | null;
    options: {
      id: string;
      name: string;
      position: number;
      optionValues: {
        id: string;
        name: string;
        hasVariants: boolean;
        swatch: { color: string | null } | null;
      }[];
    }[];
    media: {
      nodes: {
        id: string;
        alt: string | null;
        status: string;
        mediaContentType: string;
        preview: { image: { url: string } | null } | null;
      }[];
    };
    metafield: { value: string } | null;
    legacyMetafield: { value: string } | null;
  } | null;
}

export async function getProduct(admin: Admin, productId: string) {
  const data = await gql<ProductQueryData>(admin, PRODUCT_QUERY, {
    id: toProductGid(productId),
  });
  const product = data.product;
  if (!product) return null;

  const options: ProductOption[] = product.options.map((option) => ({
    id: option.id,
    name: option.name,
    position: option.position,
    optionValues: option.optionValues.map((value) => ({
      id: value.id,
      name: value.name,
      hasVariants: value.hasVariants,
      swatchColor: value.swatch?.color ?? null,
    })),
  }));

  const media: ProductMedia[] = product.media.nodes.map((item) => ({
    id: item.id,
    alt: item.alt ?? "",
    url: item.preview?.image?.url ?? null,
    mediaContentType: item.mediaContentType,
    processing: item.status === "UPLOADED" || item.status === "PROCESSING",
  }));

  const config = readConfig(product);
  const selectedOption =
    options.find((option) => option.id === config?.optionId) ??
    options.find((option) => option.name === config?.optionName) ??
    detectColorOption(options) ??
    options[0] ??
    null;

  return {
    id: product.id,
    title: product.title,
    handle: product.handle,
    status: product.status,
    previewUrl: product.onlineStorePreviewUrl,
    options,
    media,
    config,
    selectedOptionId: selectedOption?.id ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/* Saving                                                                     */
/* -------------------------------------------------------------------------- */

const SET_METAFIELD_MUTATION = `#graphql
  mutation MviSetMetafield($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const DELETE_METAFIELD_MUTATION = `#graphql
  mutation MviDeleteMetafield($metafields: [MetafieldIdentifierInput!]!) {
    metafieldsDelete(metafields: $metafields) {
      userErrors {
        field
        message
      }
    }
  }
`;

interface UserErrors {
  userErrors: { field?: string[] | null; message: string }[];
}

function assertNoUserErrors(result: UserErrors | null | undefined) {
  const errors = result?.userErrors ?? [];
  if (errors.length) {
    throw new Error(errors.map((error) => error.message).join(", "));
  }
}

export async function saveVariantImages(
  admin: Admin,
  {
    productId,
    option,
    selection,
    syncVariantImages,
  }: {
    productId: string;
    option: ProductOption;
    selection: Record<string, string[]>;
    syncVariantImages: boolean;
  },
) {
  const ownerId = toProductGid(productId);
  const config = buildConfig(option, selection);

  const data = await gql<{ metafieldsSet: UserErrors }>(
    admin,
    SET_METAFIELD_MUTATION,
    {
      metafields: [
        {
          ownerId,
          namespace: METAFIELD_NAMESPACE,
          key: METAFIELD_KEY,
          type: "json",
          value: JSON.stringify(config),
        },
      ],
    },
  );
  assertNoUserErrors(data.metafieldsSet);
  await deleteLegacyMetafield(admin, ownerId);

  let variantsUpdated = 0;
  if (syncVariantImages) {
    variantsUpdated = await syncVariantFeaturedImages(admin, ownerId, config);
  }

  return { config, variantsUpdated };
}

export async function clearVariantImages(admin: Admin, productId: string) {
  const ownerId = toProductGid(productId);
  const data = await gql<{ metafieldsDelete: UserErrors }>(
    admin,
    DELETE_METAFIELD_MUTATION,
    {
      metafields: [
        { ownerId, namespace: METAFIELD_NAMESPACE, key: METAFIELD_KEY },
      ],
    },
  );
  assertNoUserErrors(data.metafieldsDelete);
  await deleteLegacyMetafield(admin, ownerId);
}

/** Removes the mapping saved by the first release, if there is one. */
async function deleteLegacyMetafield(admin: Admin, ownerId: string) {
  try {
    await gql(admin, DELETE_METAFIELD_MUTATION, {
      metafields: [
        {
          ownerId,
          namespace: LEGACY_METAFIELD_NAMESPACE,
          key: LEGACY_METAFIELD_KEY,
        },
      ],
    });
  } catch {
    // Nothing to clean up.
  }
}

/* -------------------------------------------------------------------------- */
/* Uploading new images                                                       */
/* -------------------------------------------------------------------------- */

const STAGED_UPLOADS_MUTATION = `#graphql
  mutation MviStagedUploads($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        url
        resourceUrl
        parameters {
          name
          value
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const ADD_MEDIA_MUTATION = `#graphql
  mutation MviAddMedia($product: ProductUpdateInput!, $media: [CreateMediaInput!]) {
    productUpdate(product: $product, media: $media) {
      product {
        media(last: 50) {
          nodes {
            id
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

interface StagedUploadsData {
  stagedUploadsCreate: UserErrors & {
    stagedTargets: {
      url: string;
      resourceUrl: string;
      parameters: { name: string; value: string }[];
    }[];
  };
}

interface AddMediaData {
  productUpdate: UserErrors & {
    product: { media: { nodes: { id: string }[] } } | null;
  };
}

export const MAX_UPLOAD_FILES = 20;
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/**
 * Uploads image files to Shopify and adds them to the product's media.
 * Returns the new media IDs in the same order as `files`.
 */
export async function uploadProductImages(
  admin: Admin,
  productId: string,
  files: File[],
  alt: string,
) {
  const images = files
    .filter((file) => file.type.startsWith("image/"))
    .slice(0, MAX_UPLOAD_FILES);
  if (!images.length) throw new Error("Choose JPG, PNG, WEBP or GIF images");
  const tooBig = images.find((file) => file.size > MAX_UPLOAD_BYTES);
  if (tooBig) throw new Error(`${tooBig.name} is larger than 20 MB`);

  const staged = await gql<StagedUploadsData>(admin, STAGED_UPLOADS_MUTATION, {
    input: images.map((file) => ({
      filename: file.name,
      mimeType: file.type,
      fileSize: String(file.size),
      resource: "IMAGE",
      httpMethod: "POST",
    })),
  });
  assertNoUserErrors(staged.stagedUploadsCreate);
  const targets = staged.stagedUploadsCreate.stagedTargets;

  await Promise.all(
    targets.map(async (target, index) => {
      const form = new FormData();
      for (const { name, value } of target.parameters) form.append(name, value);
      form.append("file", images[index], images[index].name);
      const response = await fetch(target.url, { method: "POST", body: form });
      if (!response.ok) {
        throw new Error(`Upload of ${images[index].name} failed`);
      }
    }),
  );

  const added = await gql<AddMediaData>(admin, ADD_MEDIA_MUTATION, {
    product: { id: toProductGid(productId) },
    media: targets.map((target) => ({
      originalSource: target.resourceUrl,
      mediaContentType: "IMAGE",
      alt,
    })),
  });
  assertNoUserErrors(added.productUpdate);

  // New media is appended to the end of the product's media list.
  const nodes = added.productUpdate.product?.media.nodes ?? [];
  return nodes.slice(-targets.length).map((node) => node.id);
}

/* -------------------------------------------------------------------------- */
/* Variant featured image sync                                                */
/* -------------------------------------------------------------------------- */

const VARIANTS_QUERY = `#graphql
  query MviVariants($id: ID!, $after: String) {
    product(id: $id) {
      variants(first: 250, after: $after) {
        nodes {
          id
          selectedOptions {
            name
            value
            optionValue {
              id
            }
          }
          media(first: 10) {
            nodes {
              id
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

interface VariantsQueryData {
  product: {
    variants: {
      nodes: {
        id: string;
        selectedOptions: {
          name: string;
          value: string;
          optionValue: { id: string } | null;
        }[];
        media: { nodes: { id: string }[] };
      }[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  } | null;
}

const DETACH_MEDIA_MUTATION = `#graphql
  mutation MviDetachVariantMedia($productId: ID!, $variantMedia: [ProductVariantDetachMediaInput!]!) {
    productVariantDetachMedia(productId: $productId, variantMedia: $variantMedia) {
      userErrors {
        field
        message
      }
    }
  }
`;

const APPEND_MEDIA_MUTATION = `#graphql
  mutation MviAppendVariantMedia($productId: ID!, $variantMedia: [ProductVariantAppendMediaInput!]!) {
    productVariantAppendMedia(productId: $productId, variantMedia: $variantMedia) {
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * Sets each variant's own image (used by Shopify in the cart, checkout and
 * order emails) to the first image assigned to its colour.
 * Returns the number of variants that changed.
 */
async function syncVariantFeaturedImages(
  admin: Admin,
  productId: string,
  config: VariantImagesConfig,
) {
  // Only images (not videos or 3D models) can be attached to a variant.
  const firstImageByValue = new Map<string, string>();
  for (const value of config.values) {
    const image = value.media.find((id) => id.includes("/MediaImage/"));
    if (image) firstImageByValue.set(value.id, image);
  }

  const detach: { variantId: string; mediaIds: string[] }[] = [];
  const append: { variantId: string; mediaIds: string[] }[] = [];

  let after: string | null = null;
  do {
    const data: VariantsQueryData = await gql<VariantsQueryData>(
      admin,
      VARIANTS_QUERY,
      { id: productId, after },
    );
    const variants = data.product?.variants;
    if (!variants) break;

    for (const variant of variants.nodes) {
      const colorValue = variant.selectedOptions.find(
        (option) => option.name === config.optionName,
      );
      const target = colorValue?.optionValue?.id
        ? firstImageByValue.get(colorValue.optionValue.id)
        : undefined;
      if (!target) continue;

      const current = variant.media.nodes.map((node) => node.id);
      if (current.length === 1 && current[0] === target) continue;

      if (current.length)
        detach.push({ variantId: variant.id, mediaIds: current });
      append.push({ variantId: variant.id, mediaIds: [target] });
    }

    after = variants.pageInfo.hasNextPage ? variants.pageInfo.endCursor : null;
  } while (after);

  // The API accepts many variants per call; chunk to keep payloads small.
  for (const chunk of chunks(detach, 100)) {
    const data = await gql<{ productVariantDetachMedia: UserErrors }>(
      admin,
      DETACH_MEDIA_MUTATION,
      { productId, variantMedia: chunk },
    );
    assertNoUserErrors(data.productVariantDetachMedia);
  }
  for (const chunk of chunks(append, 100)) {
    const data = await gql<{ productVariantAppendMedia: UserErrors }>(
      admin,
      APPEND_MEDIA_MUTATION,
      { productId, variantMedia: chunk },
    );
    assertNoUserErrors(data.productVariantAppendMedia);
  }

  return append.length;
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}
