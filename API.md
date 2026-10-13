# DecisionGap OS 1.0 - HTTP API

All bodies are JSON. Sensitive merchant endpoints require the signed HTTP-only `dg_session` cookie. Browser writes are same-origin only. `POST` requests are rate-limited on public routes. Paths not listed may return 404.

| Method | Path | Authentication | Function |
|---|---|---|---|
| GET | `/api/health` | Public | Health check; integration status only |
| GET | `/api/storefront` | Public | Safe product catalog; no cost basis or merchant feedback |
| POST | `/api/events` | Public | Track `visit`, `chat_open`, `add_to_cart`, `checkout_start` |
| POST | `/api/chat` | Public | Guarded assistant response, strategy and cart suggestion |
| POST | `/api/checkout` | Public | Sample order OR Shopify checkout handoff (no payment collected by this app) |
| POST | `/api/auth/login` | Public, password | Create merchant session |
| GET | `/api/auth/me` | Session | Check whether session is valid |
| POST | `/api/auth/logout` | Session | Revoke session and clear cookie |
| GET | `/api/reports/summary.csv` | Merchant | Download compact CSV of funnel metrics and experiment drafts |
| GET | `/api/bootstrap` | Merchant | Full dashboard data, insights, growth proposals, experiments |
| POST | `/api/feedback` | Merchant | Add anonymized customer feedback (12-1000 characters) |
| POST | `/api/settings` | Merchant | Save safe AI rules |
| POST | `/api/reset` | Merchant (demo only) | Reset fictional workspace to sample data |
| POST | `/api/commerce/sync` | Merchant, Shopify configured | Import Shopify catalog; clears seeded data on first import |
| POST | `/api/growth/experiments` | Merchant | Draft `{ "playbookId": "playbook-shipping" }` |
| POST | `/api/growth/experiments/approve` | Merchant | Approve `{ "id": "<uuid>" }` (records approval only) |
| POST | `/api/growth/experiments/pause` | Merchant | Pause `{ "id": "<uuid>" }` |
| POST | `/api/webhooks/shopify/orders-paid` | Shopify HMAC | Record verified paid-order event; requires `SHOPIFY_WEBHOOK_SECRET` |

Important contracts:
- A Shopify checkout handoff response includes `{ "checkoutUrl": "https://...", "paymentCollected": false }`; follow the URL only after the buyer clicks checkout.
- Public assistant responses include a visible AI disclosure and policy-checked decisions; messages have an 800-character limit.
- The Growth Studio does not modify live products, discounts, advertisements or email campaigns.
- Shopify paid-order webhooks must be signed correctly, are idempotent by hashed order ID, and should never include PII in app records.
- All amounts shown as USD for the current edition.
