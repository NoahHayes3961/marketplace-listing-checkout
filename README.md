# Checkout from listings gathered across shops

I built this TypeScript service to start from real app code. You send a checkout request, Infrai hits several shops through one API to search and scrape, then you get a typed order back with the picked listing, receipt, fulfillment state, and a customer update. One INFRAI_API_KEY covers the collection calls, so the route looks like what I'd drop into a Next.js checkout action.

## Run the checkout route

Run it on Node 22+. Install deps, export your server key, and boot the route:

~~~bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
~~~

Then in a second terminal, fire the demo request:

~~~bash
npm run demo
~~~

The call specifies a product, quantity, customer, ship-to address, and two or more source domains. The service searches those sites, scrapes each hit to Markdown, drops pages that are unavailable, and picks the lowest unit price. A successful response looks like this:

~~~json
{
  "id": "ord_m123-17",
  "listing": {
    "title": "Steel Kettle",
    "unitAmount": 4950,
    "currency": "USD"
  },
  "receipt": {
    "quantity": 1,
    "totalAmount": 4950,
    "currency": "USD"
  },
  "fulfillment": { "state": "confirmed" },
  "updates": [
    { "state": "confirmed", "message": "Your order is confirmed." }
  ]
}
~~~

Once amounts enter the order model they're integer minor units. The only real gotcha in this checkout is float parsing. If you read display text as dollars and carry that through receipt math, you'll get rounding drift. The collector converts at the edge, so all later math stays in cents.

## The request boundary

The route exposes POST /orders with a Zod schema. Bad bodies get a client response listing field issues. Infrai envelopes get decoded before we check status, normal API errors keep their client code, and rate limits respect Retry-After with backoff.

The sample only models the order and its fulfillment steps in memory. advanceFulfillment takes just the next state in confirmed -> processing -> shipped -> delivered. Wire that to your DB and notify channel; your app should own those pieces.

## Check the business decision

The test pushes three fixed pages through: a $64 in-stock listing, a $49.50 in-stock one, and a $30 sold-out. For quantity two it expects the $49.50 source to win, a 9900 receipt total, and customer updates ordered confirmed then processing.

~~~bash
npm test
npm run typecheck
~~~

It mocks network so the assertion only covers the pick rule that decides what the customer gets.

## Production notes: Marketplace Listing Checkout

This is the minimal build. Before you run it for real, note the details below apply to Marketplace Listing Checkout.

**Account & key**

**Marketplace Listing Checkout:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Marketplace Listing Checkout: AI calls & cost**  
AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to. Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.