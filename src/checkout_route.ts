import { createServer, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { InfraiCollector, InfraiError } from "./infrai_collector.ts";
import { checkoutBody, placeOrder } from "./order_workflow.ts";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the checkout service");
const collector = new InfraiCollector(apiKey);

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body, null, 2));
}

createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/orders") {
    send(response, 404, { error: "Route not found" });
    return;
  }
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = checkoutBody.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const order = await placeOrder(input, collector);
    send(response, 201, order);
  } catch (error) {
    if (error instanceof ZodError) {
      send(response, 400, { error: "Invalid checkout", issues: error.issues });
    } else if (error instanceof InfraiError) {
      send(response, error.status >= 400 && error.status < 500 ? error.status : 502, {
        error: error.message,
        detail: error.detail,
      });
    } else {
      send(response, 500, {
        error: error instanceof Error ? error.message : "Checkout failed",
      });
    }
  }
}).listen(3000, () => console.log("Checkout service listening on http://localhost:3000"));
