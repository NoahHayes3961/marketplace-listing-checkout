export {};

const response = await fetch("http://localhost:3000/orders", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    query: "stainless steel pour over kettle",
    quantity: 1,
    customer: { name: "Avery Chen", email: "avery@example.com" },
    shippingAddress: {
      line1: "18 Market Street",
      city: "San Francisco",
      postalCode: "94105",
      country: "US",
    },
    sourceDomains: ["williams-sonoma.com", "crateandbarrel.com"],
  }),
});

const result: unknown = await response.json();
console.log(JSON.stringify(result, null, 2));
if (!response.ok) process.exitCode = 1;
