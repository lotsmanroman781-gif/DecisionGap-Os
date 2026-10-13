# DecisionGap OS 1.1 — Start Here

**What you received:** A complete, runnable and cloud-deployable *single-merchant MVP* for presenting DecisionGap OS and testing shopping-assistant workflows. It is **not** a fully autonomous enterprise SaaS or an already-live website.

## Fastest online deployment (Render)

1. Upload all contents of this `DecisionGap-OS` directory to the root of a **private** GitHub repository. Do not commit real environment secrets.
2. In [Render](https://dashboard.render.com/), choose **New → Blueprint**, then connect the repository.
3. Review the proposed **paid** web instance and its persistent disk in `render.yaml`.
4. Supply a unique `ADMIN_PASSWORD` with at least 12 characters. Render generates `SESSION_SECRET` automatically.
5. Deploy. Once running, visit your new `https://...onrender.com` URL.
6. Sign in to the private merchant dashboard at `/`. Share `/?view=store` with prospective customers/co-founders.

## Demo without external accounts

The public store, AI shopping replies, cart simulation, business dashboard and growth recommendations work without an AI key or Shopify credentials. Checkout is **simulation only**. Sample analytics are clearly labeled as synthetic.

## Optional real shopping handoff

Configure `SHOPIFY_SHOP_DOMAIN` and `SHOPIFY_STOREFRONT_TOKEN` under Render Environment, then redeploy. In the merchant dashboard, choose Commerce setup → Sync live products. Customers can then browse imported products and explicitly proceed to **Shopify-hosted checkout**. Paid-order recording requires additional verified Shopify webhook setup (`SHOPIFY_WEBHOOK_SECRET`). You must test against your own Shopify store before allowing real buyers.

## Optional LLM wording

Set `OPENAI_API_KEY` (and optionally `OPENAI_MODEL`) to allow natural-language rephrasing of safe replies. Without it, the reliable rules-based assistant remains functional. The LLM does not control prices, tools, payments, or campaigns.

## Commands for developers

- Install Node.js 22+.
- Run tests: `npm test`
- Run the application: `npm start`
- Developer URL: `http://localhost:3000`
- Demo merchant password if `NODE_ENV` is not `production` and `ADMIN_PASSWORD` is absent: `local-demo-only` (NEVER use this password on the public internet).

## What remains to create a commercial, multi-merchant SaaS

Separate merchant accounts and tenant isolation; subscriptions/billing; direct CRM/ad-platform integrations and campaign execution; true online experiment automation; regulatory/privacy compliance controls, operational observability, and an externally audited security review. This is documented in `PRODUCT_VISION.md` and must not be represented as already implemented.

See `README.md`, `DEPLOY.md`, `API.md`, and `docs/DecisionGap_OS_Complete_Product_Demo_and_Help.pdf`.
