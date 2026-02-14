/**
 * Shopify Admin API Client (GraphQL)
 * For backend operations: draft orders, order status
 */

const ADMIN_API_VERSION = '2024-01';

export interface AdminConfig {
  storeUrl: string; // xxx.myshopify.com
  adminToken: string; // Admin API access token
}

export interface DraftOrderLine {
  variantId: string;
  quantity: number;
}

export interface DraftOrder {
  id: string;
  invoiceUrl: string;
  totalPrice: string;
  status: string;
}

export interface OrderStatus {
  id: string;
  name: string;
  displayFulfillmentStatus: string;
  trackingUrl: string | null;
  financialStatus: string;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

// GraphQL Mutations and Queries
const CREATE_DRAFT_ORDER_MUTATION = `
  mutation DraftOrderCreate($input: DraftOrderInput!) {
    draftOrderCreate(input: $input) {
      draftOrder {
        id
        invoiceUrl
        totalPrice
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const GET_ORDER_QUERY = `
  query GetOrder($id: ID!) {
    order(id: $id) {
      id
      name
      displayFulfillmentStatus
      financialStatus
      fulfillments(first: 1) {
        trackingInfo {
          url
        }
      }
    }
  }
`;

const GET_DRAFT_ORDER_QUERY = `
  query GetDraftOrder($id: ID!) {
    draftOrder(id: $id) {
      id
      invoiceUrl
      totalPrice
      status
    }
  }
`;

export class ShopifyAdminClient {
  private endpoint: string;
  private headers: Record<string, string>;

  constructor(config: AdminConfig) {
    const cleanUrl = config.storeUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    this.endpoint = `https://${cleanUrl}/admin/api/${ADMIN_API_VERSION}/graphql.json`;
    this.headers = {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': config.adminToken,
    };
  }

  private async query<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`Shopify Admin API error: ${response.status} ${response.statusText}`);
    }

    const result = (await response.json()) as GraphQLResponse<T>;

    if (result.errors?.length) {
      throw new Error(`GraphQL errors: ${result.errors.map((e) => e.message).join(', ')}`);
    }

    if (!result.data) {
      throw new Error('No data returned from Shopify Admin API');
    }

    return result.data;
  }

  /**
   * Create a draft order for a customer
   * Draft orders can be completed later with payment
   */
  async createDraftOrder(
    lines: DraftOrderLine[],
    email?: string,
    note?: string
  ): Promise<DraftOrder> {
    interface DraftOrderCreateResponse {
      draftOrderCreate: {
        draftOrder: {
          id: string;
          invoiceUrl: string;
          totalPrice: string;
          status: string;
        } | null;
        userErrors: Array<{ field: string; message: string }>;
      };
    }

    const lineItems = lines.map((l) => ({
      variantId: l.variantId,
      quantity: l.quantity,
    }));

    const input: Record<string, unknown> = {
      lineItems,
    };

    if (email) {
      input.email = email;
    }

    if (note) {
      input.note = note;
    }

    const data = await this.query<DraftOrderCreateResponse>(CREATE_DRAFT_ORDER_MUTATION, {
      input,
    });

    if (data.draftOrderCreate.userErrors.length) {
      throw new Error(
        `Draft order creation failed: ${data.draftOrderCreate.userErrors.map((e) => e.message).join(', ')}`
      );
    }

    const draftOrder = data.draftOrderCreate.draftOrder;
    if (!draftOrder) {
      throw new Error('Draft order creation returned null');
    }

    return {
      id: draftOrder.id,
      invoiceUrl: draftOrder.invoiceUrl,
      totalPrice: draftOrder.totalPrice,
      status: draftOrder.status,
    };
  }

  /**
   * Get order status and tracking info
   */
  async getOrder(orderId: string): Promise<OrderStatus> {
    interface GetOrderResponse {
      order: {
        id: string;
        name: string;
        displayFulfillmentStatus: string;
        financialStatus: string;
        fulfillments: Array<{
          trackingInfo: Array<{ url: string | null }>;
        }>;
      } | null;
    }

    const data = await this.query<GetOrderResponse>(GET_ORDER_QUERY, { id: orderId });

    if (!data.order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    const order = data.order;
    const trackingUrl =
      order.fulfillments?.[0]?.trackingInfo?.[0]?.url ?? null;

    return {
      id: order.id,
      name: order.name,
      displayFulfillmentStatus: order.displayFulfillmentStatus,
      financialStatus: order.financialStatus,
      trackingUrl,
    };
  }

  /**
   * Get draft order details
   */
  async getDraftOrder(draftOrderId: string): Promise<DraftOrder> {
    interface GetDraftOrderResponse {
      draftOrder: {
        id: string;
        invoiceUrl: string;
        totalPrice: string;
        status: string;
      } | null;
    }

    const data = await this.query<GetDraftOrderResponse>(GET_DRAFT_ORDER_QUERY, {
      id: draftOrderId,
    });

    if (!data.draftOrder) {
      throw new Error(`Draft order not found: ${draftOrderId}`);
    }

    return {
      id: data.draftOrder.id,
      invoiceUrl: data.draftOrder.invoiceUrl,
      totalPrice: data.draftOrder.totalPrice,
      status: data.draftOrder.status,
    };
  }
}
