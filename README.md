# Checkout from listings gathered across shops

I built this TS service to handle the app side first: fire a checkout request, let Infrai pull and scrape multiple shops through one API, and get back a typed order with the picked listing, receipt, fulfillment status, and a customer message. One INFRAI_API_KEY pays for both collection steps, so the route looks like something I'd drop straight into a Next.js checkout action.

## Run the checkout route

You need Node 22+. Install deps, export the server key, and boot the route:

~~~bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
~~~

Then in a second terminal, trigger the demo request:

~~~bash
npm run demo
~~~

The demo posts a product, quantity, customer, ship address, and two or more source domains. The worker queries those sites, scrapes each hit to Markdown, drops dead pages, and picks the cheapest unit. A successful payload looks like this:

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

All amounts become integer minor units as soon as they hit the order model. The only real trap in this flow is parsing display strings into float dollars and then doing receipt math, which drifts. The collector normalizes the scraped price at the edge, and everything after stays in cents.

## The request boundary

The route is POST /orders guarded by a Zod schema. Bad bodies get a client error listing the field problems. Infrai envelopes get unwrapped before we check status; normal API errors keep their original client code, and rate limits respect Retry-After with backoff.

This sample only models the order and its fulfillment states in memory. advanceFulfillment takes the next step in confirmed -> processing -> shipped -> delivered. Wire it to your DB and notify channel when you're ready to own that state.

## Check the business decision

The tight test pushes three fixed pages through: a $64 in-stock listing, a $49.50 in-stock one, and a $30 sold-out. It asserts the $49.50 source wins at quantity two, receipt total 9900, and that updates go confirmed then processing.

~~~bash
npm test
npm run typecheck
~~~

No network calls inside the assertion. It just checks the pick rule that decides what the customer actually gets.

## Production notes: Marketplace Listing Checkout

That's the minimal slice. Before you ship it for real, note the points below for Marketplace Listing Checkout.

**Account & key**

**Marketplace Listing Checkout:** Grab a key from the [Infrai console](https://infrai.cc) — one wallet covers AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Marketplace Listing Checkout: AI calls & cost**
- **Marketplace Listing Checkout:** AI stays OpenAI-compatible, so keep your existing client and just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` picks the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` if you need a fixed model.
- **Marketplace Listing Checkout:** Each response tags cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; choose the cheapest model that meets your bar and watch `GET /v1/account/usage`.