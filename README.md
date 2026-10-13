# DecisionGap OS 1.1 - Cloud Edition

**Customer decision intelligence + merchant-governed AI sales + growth experiments + optional Shopify commerce handoff.**

This repository contains an operational, single-merchant **deployment-ready release**, not a certified enterprise SaaS. It can run on Render, Railway, or any Docker host. Without external credentials it runs a clearly fictional but fully interactive demonstration. With Shopify credentials it can synchronize real product information and send a consenting buyer to a real Shopify-hosted checkout. Real marketing campaigns, automatic price changes, multi-tenant user administration, billing, and enterprise security compliance are **not** included. See `PRODUCT_VISION.md` for the complete intended product.

## Implemented today

- **Merchant dashboard**: anonymized funnel events, sales history, feedback analysis, recent agent decisions, CSV reporting.
- **Customer intelligence**: categorize merchant-submitted feedback; surface evidence counts and hypotheses, never pretend to know customer thoughts.
- **Public storefront**: responsive product catalog, guided product discovery, cart and visible AI shopping assistant.
- **Sales agent**: policy-bound product recommendations, warranty / returns / shipping responses, experiment-consistent conversation styles, optional OpenAI wording (model does not control tools or charges).
- **Growth Studio**: evidence-linked strategy proposals, draft creation, merchant approval/pause ledger (approval does not apply edits to external platforms).
- **Experiment dashboard**: reproducible per-session variant assignment; sample metrics are marked as simulated; experimental inference is not claimed.
- **Shopify Storefront API**: server-side catalog sync and server-generated hosted checkout links when configured. USD-only, first available variant per product in this edition.
- **Shopify paid-order webhook**: optional HMAC-verified order notification; stores hashed order identifiers and totals without customer names, email, or address.
- **Merchant policies**: agent pause, discounts ceilings, minimum margin parameters, compulsory human approval for sensitive business changes.
- **Authentication / isolation**: single merchant password session with HTTP-only cookie, cross-origin write protection, request limits, no public access to merchant data.
- **Persistence**: SQLite with WAL when `SQLITE_FILE` is set; atomic JSON for development without SQLite configuration.
- **Deployment**: Dockerfile, Render Blueprint, Railway configuration, health endpoint, graceful startup validation.
- **Test suite**: `npm test` (20 automated tests).

## Quick start (local validation)

Prerequisites: **Node.js 22+**. No third-party npm dependencies.

```bash
cp .env.example .env  # optional reference only; the app does not auto-load .env
ADMIN_PASSWORD='local-secret' SESSION_SECRET='long-random-32-plus-character-string' npm start
```

Open:
- `/` Merchant dashboard; log in with ADMIN_PASSWORD (`local-demo-only` in development if unset).
- `/?view=store` Public shopping experience.
- `/api/health` Public status check (no secret data).

`npm test` runs the test suite.

## Cloud deployment

1. Push the unzipped repository to private GitHub, omitting `.env`, `.data`, and any local database.
2. In Render, create **New > Blueprint**, connect the repo, inspect the paid plan and persistent disk described in `render.yaml`.
3. Enter `ADMIN_PASSWORD` (12+ characters); Render generates `SESSION_SECRET` (32+ characters) and persists SQLite at `/var/data/decisiongap.sqlite`.
4. Deploy and browse the HTTPS website at `/` and `/?view=store`.
5. (Optional) Configure `OPENAI_API_KEY` / `OPENAI_MODEL`.
6. (Optional) Configure `SHOPIFY_SHOP_DOMAIN` and `SHOPIFY_STOREFRONT_TOKEN` for real catalog and checkout; redeploy and click **Commerce setup > Sync live products**.
7. (Optional) Set `SHOPIFY_WEBHOOK_SECRET` and register a signed Shopify order-paid webhook at `https://YOUR-DOMAIN/api/webhooks/shopify/orders-paid` to record paid-order totals.

**Important:** A Shopify checkout URL means a cart was created, *not* that payment occurred. Do not count it as a sale. Shopify credentials, store permissions, plan terms, and external service fees belong to the merchant. The Shopify integration has not been live-tested with your private store.

See `DEPLOY.md` for provider-specific instructions and security notes.

## Architecture overview

```text
                PUBLIC CUSTOMER                     PRIVATE MERCHANT
            /?view=store                        / (password sign-in)
               |                                     |
        Catalog + guided AI                    Insights + Growth Studio
               |                                     |
               +---------- HTTPS API ----------------+
                                  |
                         Node.js HTTP Server
                    policy engine | growth hypotheses
                       event log | auth | rate limits
                          optional OpenAI API
                                  |
                      SQLite on persistent disk
                                  |
                     optional Shopify Storefront API
                           checkoutUrl -> Shopify
                           paid webhook <- Shopify
```

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV=production` | Cloud | Enables Secure cookies and strict secret requirements |
| `PORT` | Cloud host | Automatically injected by Render / Railway |
| `HOST=0.0.0.0` | Cloud | Allows inbound traffic |
| `ADMIN_PASSWORD` | Cloud | Merchant password, at least 12 characters |
| `SESSION_SECRET` | Cloud | HMAC signing secret, at least 32 characters |
| `SQLITE_FILE=/var/data/decisiongap.sqlite` | Recommended cloud | SQLite persistence on persistent volume |
| `DATA_FILE` | Development only | JSON persistence if SQLite is unset |
| `OPENAI_API_KEY` | Optional | LLM rephrasing of controlled agent responses |
| `OPENAI_MODEL` | Optional | Model identifier, default `gpt-4.1-mini` |
| `SHOPIFY_SHOP_DOMAIN` | Optional | Valid `shop-name.myshopify.com` domain |
| `SHOPIFY_STOREFRONT_TOKEN` | Optional | Storefront API access token kept only on server |
| `SHOPIFY_WEBHOOK_SECRET` | Optional | Verify Shopify paid-order webhook requests |

## Agent safety contract

- Only merchant catalog products and store-approved facts may support sales claims.
- Discounts are never issued simply because a policy allows discounts.
- All purchases require explicit buyer action on Shopify's secure checkout; the agent never handles card numbers.
- Agent wording may use an LLM, but actions/prices/policies are deterministic and server-validated.
- Strategy drafts require merchant approval; approval does not perform edits or campaigns.
- The system does not infer private motivations or use sensitive traits to manipulate customers.
- Metrics from seed data are not evidence of actual commercial lift.

## MVP limitations / production checklist

This is a **single-merchant deployment**. Before processing real, identifiable customer records or selling the software as a multi-business SaaS, implement and audit: multi-tenant auth/RBAC, tenant database isolation, privacy notices and data subject rights, consent/retention, operational backups and restore drills, telemetry/alerting, abuse protection, integration retries/idempotency, provider-specific privacy and legal reviews, accessibility testing, payment/order reconciliation, incident response, load testing, and store-specific QA.

## Documentation

- `DEPLOY.md`: cloud deployment and credentials.
- `PRODUCT_VISION.md`: full target product, including features beyond v1.
- `API.md`: HTTP API contract.
- `DecisionGap_OS_Complete_Product_Demo_and_Help.pdf`: separate comprehensive demo/help PDF delivered alongside this archive (if distributed together).

MIT-licensed source code. DecisionGap OS is a concept-stage startup product; test it with consenting pilot merchants before commercial claims.

## Version 1.1 connected-store fixes

- Customer-facing text now clearly separates demo-cart simulations from real Shopify checkout handoffs.
- The conversational agent matches product names, categories, tags and descriptions in imported catalogs rather than relying only on seeded product IDs.
- Store selection updates to the first live product after catalog synchronization and avoids using demo merchant branding.
- Shopify-integrated carts show final shipping/tax notices accurately and never claim that checkout payment happened inside DecisionGap OS.

This remains a **single-merchant deployment**, not a multi-tenant, audited production SaaS. The complete autonomous sales vision (fully deployed experiments, campaign control, multi-channel messaging, recurring billing, team management) is specified in `PRODUCT_VISION.md` but is not implemented.
