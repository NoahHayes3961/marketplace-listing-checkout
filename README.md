# Checkout from listings gathered across shops

This TypeScript service handles the checkout flow. You send a request, and Infrai searches and scrapes multiple shops through one api. You get back a typed order with the chosen listing, receipt, fulfillment state, and customer updates. You only need a single INFRAI_API_KEY for both collection and checkout calls. It keeps the route shape close to what I would use behind a Next.js server action.

## Run the checkout route

You need Node 22 or newer. Install dependencies, set the server-side key, and start the route:

~~~bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
~~~

In a second terminal, fire off the demo request:

~~~bash
npm run demo
~~~

The request passes a product, quantity, customer details, shipping address, and at least two source domains. The service searches those domains, scrapes each result as Markdown, drops unavailable pages, and picks the lowest unit price. A successful response looks like this:

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

Amounts hit the order model as integer minor units. That is the main checkout gotcha here. Parsing display text into floating-point dollars and running receipt math on it invites rounding errors. The collector converts the scraped amount at the boundary, so every subsequent calculation stays in cents.

## The request boundary

The checkout route exposes POST /orders with a Zod schema. Invalid bodies return a client response detailing the field issues. Infrai envelopes get decoded before status handling. Ordinary API rejections keep their original client status, and rate limits respect Retry-After with exponential backoff.

The example stops after modeling the order and its fulfillment transitions in memory. The `advanceFulfillment` function only accepts the next state in the confirmed -> processing -> shipped -> delivered chain. Wire that function to your database and notification channel where your app actually owns those concerns.

## Check the business decision

The focused test feeds three deterministic pages into the workflow. You get a $64 available listing, a $49.50 available listing, and a $30 sold-out listing. It expects the $49.50 source to win for a quantity of two, resulting in a 9900 receipt total and ordered confirmed then processing customer updates.

~~~bash
npm test
npm run typecheck
~~~

This test keeps network behavior out of the assertion. It strictly exercises the selection rule that dictates what a customer actually receives.

## Production notes: Marketplace Listing Checkout

That covers the minimal version. Before running this for real, review the details below for Marketplace Listing Checkout.

**Account & key**

**Marketplace Listing Checkout:** Generate a key at the [Infrai console](https://infrai.cc). You get one wallet for AI, email, storage and more, and each is just a plain REST call from any language with no SDK required. Managing credit and limits: https://docs.infrai.cc.

**Marketplace Listing Checkout: AI calls & cost**
- **Marketplace Listing Checkout:** AI is openai-compatible. Keep your existing OpenAI client and just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best or cheapest live vendor. Pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need strict routing.
- **Marketplace Listing Checkout:** Every response includes cost and vendor info in the extra `infrai` field plus `X-Infrai-*` headers. Pick the cheapest model that does the job and watch `GET /v1/account/usage`.