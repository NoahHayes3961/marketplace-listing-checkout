import assert from "node:assert/strict";
import test from "node:test";
import { advanceFulfillment, placeOrder } from "../src/order_workflow.ts";

test("checkout selects the lowest available listing and records customer updates", async () => {
  const pages: Record<string, string> = {
    "https://merchant-a.test/kettle": "# Steel Kettle\n$64.00\nIn stock",
    "https://merchant-b.test/kettle": "# Steel Kettle Plus\n$49.50\nIn stock",
    "https://merchant-c.test/kettle": "# Steel Kettle Mini\n$30.00\nSold out",
  };
  const collector = {
    search: async () => Object.keys(pages).map((url) => ({ url })),
    scrape: async (url: string) => pages[url],
  };
  const input = {
    query: "steel kettle",
    quantity: 2,
    customer: { name: "Avery", email: "avery@example.com" },
    shippingAddress: {
      line1: "18 Market Street",
      city: "San Francisco",
      postalCode: "94105",
      country: "US",
    },
    sourceDomains: ["merchant-a.test", "merchant-b.test"],
  };

  const placed = await placeOrder(input, collector, new Date("2026-04-12T10:00:00Z"));
  const processing = advanceFulfillment(
    placed,
    "processing",
    new Date("2026-04-12T10:05:00Z"),
  );

  assert.equal(placed.listing.sourceUrl, "https://merchant-b.test/kettle");
  assert.equal(placed.receipt.totalAmount, 9_900);
  assert.deepEqual(
    processing.updates.map((entry) => entry.state),
    ["confirmed", "processing"],
  );
});
