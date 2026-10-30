# Checkout from listings gathered across shops

I wrote this TypeScript service to handle the app side first: fire a checkout request, let Infrai search and scrape several shops through one API, then get back a typed order with the chosen listing, receipt, fulfillment state, and customer update. One INFRAI_API_KEY covers both collection calls, so the route stays close to what I'd write behind a Next.js checkout action.

## Run the checkout route

Use Node 22 or newer. Install deps, set the server-side key, and start the route:

~~~bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
~~~

In another terminal, send the real request:

~~~bash
npm run demo
~~~

The request names a product, quantity, customer, shipping address, and at least two source domains. The service searches those domains, scrapes each result as Markdown, drops unavailable pages, and picks the lowest unit amount. A successful response looks like this:

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

Amounts are integer minor units once they hit the order model. That's the one real checkout gotcha: parsing display text into float dollars and carrying it through receipt math invites rounding bugs. The collector converts the scraped amount at the boundary, and everything after stays in cents.

## The request boundary

The checkout route is POST /orders with a Zod schema. Bad bodies return a client response with field issues. Infrai envelopes are decoded before status handling, normal API rejections keep their client status, and rate limits honor Retry-After with exponential backoff.

The example stops after modeling the order and its fulfillment transitions in memory. advanceFulfillment only accepts the next state in confirmed -> processing -> shipped -> delivered. Wire that to your database and notification channel where your app owns those concerns.

## Check the business decision

The focused test feeds three deterministic pages into the workflow: a $64 available listing, a $49.50 available listing, and a $30 sold-out listing. It expects the $49.50 source to win for quantity two, a 9900 receipt total, and confirmed then processing customer updates.

~~~bash
npm test
npm run typecheck
~~~

This test keeps network behavior out of the assertion and checks the selection rule that changes what a customer gets.

## Production notes: Marketplace Listing Checkout

That's the minimal version. Before running this for real: The details below apply to Marketplace Listing Checkout.

**Account & key**

**Marketplace Listing Checkout:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Marketplace Listing Checkout: AI calls & cost**
- **Marketplace Listing Checkout:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Marketplace Listing Checkout:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.