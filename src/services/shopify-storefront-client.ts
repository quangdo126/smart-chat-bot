/**
 * Shopify Storefront API Client (GraphQL)
 * For public operations: product search, cart management
 */

const STOREFRONT_API_VERSION = '2024-01';
const DEFAULT_PRODUCTS_LIMIT = 10;

export interface StorefrontConfig {
  storeUrl: string; // xxx.myshopify.com
  storefrontToken: string;
}

export interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  description: string;
  priceRange: { minPrice: number; maxPrice: number };
  images: Array<{ url: string; altText: string }>;
  variants: Array<{ id: string; title: string; price: number; available: boolean }>;
}

export interface CartLine {
  merchandiseId: string; // variant ID
  quantity: number;
}

export interface CartResponse {
  cartId: string;
  checkoutUrl: string;
  lines: CartLine[];
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

interface ProductNode {
  id: string;
  title: string;
  handle: string;
  description: string;
  priceRange: {
    minVariantPrice: { amount: string };
    maxVariantPrice: { amount: string };
  };
  images: { edges: Array<{ node: { url: string; altText: string | null } }> };
  variants: {
    edges: Array<{
      node: {
        id: string;
        title: string;
        price: { amount: string };
        availableForSale: boolean;
      };
    }>;
  };
}

// GraphQL Queries
const PRODUCT_FRAGMENT = `
  fragment ProductFields on Product {
    id
    title
    handle
    description
    priceRange {
      minVariantPrice { amount }
      maxVariantPrice { amount }
    }
    images(first: 5) {
      edges {
        node {
          url
          altText
        }
      }
    }
    variants(first: 10) {
      edges {
        node {
          id
          title
          price { amount }
          availableForSale
        }
      }
    }
  }
`;

const SEARCH_PRODUCTS_QUERY = `
  ${PRODUCT_FRAGMENT}
  query SearchProducts($query: String!, $first: Int!) {
    products(first: $first, query: $query) {
      edges {
        node {
          ...ProductFields
        }
      }
    }
  }
`;

const GET_PRODUCT_QUERY = `
  ${PRODUCT_FRAGMENT}
  query GetProduct($handle: String!) {
    product(handle: $handle) {
      ...ProductFields
    }
  }
`;

const CREATE_CART_MUTATION = `
  mutation CartCreate($lines: [CartLineInput!]!) {
    cartCreate(input: { lines: $lines }) {
      cart {
        id
        checkoutUrl
        lines(first: 50) {
          edges {
            node {
              id
              quantity
              merchandise {
                ... on ProductVariant {
                  id
                }
              }
            }
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

const ADD_TO_CART_MUTATION = `
  mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
    cartLinesAdd(cartId: $cartId, lines: $lines) {
      cart {
        id
        checkoutUrl
        lines(first: 50) {
          edges {
            node {
              id
              quantity
              merchandise {
                ... on ProductVariant {
                  id
                }
              }
            }
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

const GET_CART_QUERY = `
  query GetCart($cartId: ID!) {
    cart(id: $cartId) {
      id
      checkoutUrl
      lines(first: 50) {
        edges {
          node {
            id
            quantity
            merchandise {
              ... on ProductVariant {
                id
              }
            }
          }
        }
      }
    }
  }
`;

export class ShopifyStorefrontClient {
  private endpoint: string;
  private headers: Record<string, string>;

  constructor(config: StorefrontConfig) {
    const cleanUrl = config.storeUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    this.endpoint = `https://${cleanUrl}/api/${STOREFRONT_API_VERSION}/graphql.json`;
    this.headers = {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': config.storefrontToken,
    };
  }

  private async query<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`Shopify Storefront API error: ${response.status} ${response.statusText}`);
    }

    const result = (await response.json()) as GraphQLResponse<T>;

    if (result.errors?.length) {
      throw new Error(`GraphQL errors: ${result.errors.map((e) => e.message).join(', ')}`);
    }

    if (!result.data) {
      throw new Error('No data returned from Shopify Storefront API');
    }

    return result.data;
  }

  private mapProduct(node: ProductNode): ShopifyProduct {
    return {
      id: node.id,
      title: node.title,
      handle: node.handle,
      description: node.description,
      priceRange: {
        minPrice: parseFloat(node.priceRange.minVariantPrice.amount),
        maxPrice: parseFloat(node.priceRange.maxVariantPrice.amount),
      },
      images: node.images.edges.map((e) => ({
        url: e.node.url,
        altText: e.node.altText ?? '',
      })),
      variants: node.variants.edges.map((e) => ({
        id: e.node.id,
        title: e.node.title,
        price: parseFloat(e.node.price.amount),
        available: e.node.availableForSale,
      })),
    };
  }

  /**
   * Search products by query string
   */
  async searchProducts(query: string, first = DEFAULT_PRODUCTS_LIMIT): Promise<ShopifyProduct[]> {
    interface SearchResponse {
      products: { edges: Array<{ node: ProductNode }> };
    }

    const data = await this.query<SearchResponse>(SEARCH_PRODUCTS_QUERY, {
      query,
      first,
    });

    return data.products.edges.map((e) => this.mapProduct(e.node));
  }

  /**
   * Get single product by handle (URL slug)
   */
  async getProduct(handle: string): Promise<ShopifyProduct | null> {
    interface ProductResponse {
      product: ProductNode | null;
    }

    const data = await this.query<ProductResponse>(GET_PRODUCT_QUERY, { handle });

    return data.product ? this.mapProduct(data.product) : null;
  }

  /**
   * Create a new cart with initial lines
   */
  async createCart(lines: CartLine[]): Promise<CartResponse> {
    interface CartCreateResponse {
      cartCreate: {
        cart: {
          id: string;
          checkoutUrl: string;
          lines: {
            edges: Array<{
              node: { quantity: number; merchandise: { id: string } };
            }>;
          };
        };
        userErrors: Array<{ field: string; message: string }>;
      };
    }

    const cartLines = lines.map((l) => ({
      merchandiseId: l.merchandiseId,
      quantity: l.quantity,
    }));

    const data = await this.query<CartCreateResponse>(CREATE_CART_MUTATION, {
      lines: cartLines,
    });

    if (data.cartCreate.userErrors.length) {
      throw new Error(
        `Cart creation failed: ${data.cartCreate.userErrors.map((e) => e.message).join(', ')}`
      );
    }

    const cart = data.cartCreate.cart;
    return {
      cartId: cart.id,
      checkoutUrl: cart.checkoutUrl,
      lines: cart.lines.edges.map((e) => ({
        merchandiseId: e.node.merchandise.id,
        quantity: e.node.quantity,
      })),
    };
  }

  /**
   * Add lines to existing cart
   */
  async addToCart(cartId: string, lines: CartLine[]): Promise<CartResponse> {
    interface CartLinesAddResponse {
      cartLinesAdd: {
        cart: {
          id: string;
          checkoutUrl: string;
          lines: {
            edges: Array<{
              node: { quantity: number; merchandise: { id: string } };
            }>;
          };
        };
        userErrors: Array<{ field: string; message: string }>;
      };
    }

    const cartLines = lines.map((l) => ({
      merchandiseId: l.merchandiseId,
      quantity: l.quantity,
    }));

    const data = await this.query<CartLinesAddResponse>(ADD_TO_CART_MUTATION, {
      cartId,
      lines: cartLines,
    });

    if (data.cartLinesAdd.userErrors.length) {
      throw new Error(
        `Add to cart failed: ${data.cartLinesAdd.userErrors.map((e) => e.message).join(', ')}`
      );
    }

    const cart = data.cartLinesAdd.cart;
    return {
      cartId: cart.id,
      checkoutUrl: cart.checkoutUrl,
      lines: cart.lines.edges.map((e) => ({
        merchandiseId: e.node.merchandise.id,
        quantity: e.node.quantity,
      })),
    };
  }

  /**
   * Get cart details
   */
  async getCart(cartId: string): Promise<CartResponse> {
    interface GetCartResponse {
      cart: {
        id: string;
        checkoutUrl: string;
        lines: {
          edges: Array<{
            node: { quantity: number; merchandise: { id: string } };
          }>;
        };
      } | null;
    }

    const data = await this.query<GetCartResponse>(GET_CART_QUERY, { cartId });

    if (!data.cart) {
      throw new Error(`Cart not found: ${cartId}`);
    }

    return {
      cartId: data.cart.id,
      checkoutUrl: data.cart.checkoutUrl,
      lines: data.cart.lines.edges.map((e) => ({
        merchandiseId: e.node.merchandise.id,
        quantity: e.node.quantity,
      })),
    };
  }
}
