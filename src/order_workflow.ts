import { z } from "zod";
import type { InfraiCollector, SearchHit } from "./infrai_collector.ts";

export const checkoutBody = z.object({
  query: z.string().min(3).max(120),
  quantity: z.number().int().min(1).max(10),
  customer: z.object({
    email: z.string().email(),
    name: z.string().min(1).max(80),
  }),
  shippingAddress: z.object({
    line1: z.string().min(1),
    city: z.string().min(1),
    postalCode: z.string().min(2),
    country: z.string().length(2),
  }),
  sourceDomains: z.array(z.string().min(3)).min(2).max(6),
});

export type CheckoutInput = z.infer<typeof checkoutBody>;
export type Listing = {
  sourceUrl: string;
  title: string;
  currency: string;
  unitAmount: number;
  available: boolean;
};
export type OrderState = "confirmed" | "processing" | "shipped" | "delivered";
export type CustomerUpdate = { state: OrderState; message: string; at: string };
export type Receipt = {
  receiptNumber: string;
  customerEmail: string;
  item: string;
  quantity: number;
  totalAmount: number;
  currency: string;
};
export type Order = {
  id: string;
  listing: Listing;
  receipt: Receipt;
  fulfillment: { state: OrderState; destination: CheckoutInput["shippingAddress"] };
  updates: CustomerUpdate[];
};

const moneyPattern = /(?:USD\s*|\$)(\d+(?:\.\d{1,2})?)/i;
const titlePattern = /^#\s+(.+)$/m;

export function listingFromPage(hit: SearchHit, markdown: string): Listing | null {
  const amount = markdown.match(moneyPattern)?.[1];
  if (!amount) return null;
  return {
    sourceUrl: hit.url,
    title: markdown.match(titlePattern)?.[1]?.trim() || hit.title || "Marketplace item",
    currency: "USD",
    unitAmount: Math.round(Number(amount) * 100),
    available: !/out of stock|sold out/i.test(markdown),
  };
}

export function chooseListing(listings: Listing[], quantity: number): Listing {
  const eligible = listings.filter((listing) => listing.available && quantity > 0);
  eligible.sort((left, right) =>
    left.unitAmount - right.unitAmount || left.sourceUrl.localeCompare(right.sourceUrl)
  );
  const selected = eligible[0];
  if (!selected) throw new Error("No available listing matched this checkout");
  return selected;
}

function update(state: OrderState, at: string): CustomerUpdate {
  const messages: Record<OrderState, string> = {
    confirmed: "Your order is confirmed.",
    processing: "Your item is being prepared.",
    shipped: "Your item has shipped.",
    delivered: "Your item was delivered.",
  };
  return { state, message: messages[state], at };
}

export async function placeOrder(
  input: CheckoutInput,
  collector: Pick<InfraiCollector, "search" | "scrape">,
  now = new Date(),
): Promise<Order> {
  const hits = await collector.search(input.query, input.sourceDomains);
  const pages = await Promise.all(
    hits.map(async (hit) => ({ hit, markdown: await collector.scrape(hit.url) })),
  );
  const listings = pages.flatMap(({ hit, markdown }) => {
    const listing = listingFromPage(hit, markdown);
    return listing ? [listing] : [];
  });
  const listing = chooseListing(listings, input.quantity);
  const stamp = now.toISOString();
  const orderToken = now.getTime().toString(36) + "-" + input.customer.email.length;
  const id = "ord_" + orderToken;
  return {
    id,
    listing,
    receipt: {
      receiptNumber: "rcpt_" + orderToken,
      customerEmail: input.customer.email,
      item: listing.title,
      quantity: input.quantity,
      totalAmount: listing.unitAmount * input.quantity,
      currency: listing.currency,
    },
    fulfillment: { state: "confirmed", destination: input.shippingAddress },
    updates: [update("confirmed", stamp)],
  };
}

export function advanceFulfillment(
  order: Order,
  state: Exclude<OrderState, "confirmed">,
  now = new Date(),
): Order {
  const rank: Record<OrderState, number> = { confirmed: 0, processing: 1, shipped: 2, delivered: 3 };
  if (rank[state] !== rank[order.fulfillment.state] + 1) {
    throw new Error("Fulfillment updates must advance one step");
  }
  return {
    ...order,
    fulfillment: { ...order.fulfillment, state },
    updates: [...order.updates, update(state, now.toISOString())],
  };
}
