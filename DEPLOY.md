# DecisionGap OS 1.0 - Hosting and setup guide

## Option 1: Render Blueprint (recommended for a shareable demo and pilot)

1. Extract ZIP. Upload the **contents** of the project folder to a private GitHub repository. Do not upload secret `.env` files, SQLite/JSON data, or generated test data.
2. Go to https://dashboard.render.com/ > **New** > **Blueprint** and connect your repository.
3. Confirm the cost: `render.yaml` uses a **paid 0.5c-512mb web service with a 1 GB persistent disk** (the free tier does not support persistent disks). Pricing can change; verify with Render.
4. Set `ADMIN_PASSWORD` to a unique 12+ character password when prompted. Keep the auto-generated `SESSION_SECRET` private.
5. The Blueprint mounts `/var/data` and sets `SQLITE_FILE=/var/data/decisiongap.sqlite`.
6. Deploy; open the generated HTTPS domain. The dashboard is `/`, public store is `/?view=store`, and health check is `/api/health`.
7. When adding Shopify or OpenAI credentials, use Render **Environment** settings (not your Git repository) and redeploy.

## Option 2: Railway

1. Create a project from the private GitHub repository at https://railway.com/.
2. Railway detects the included Dockerfile; generate a public HTTPS domain.
3. Set `NODE_ENV=production`, `HOST=0.0.0.0`, `ADMIN_PASSWORD`, `SESSION_SECRET`, and `SQLITE_FILE=/var/data/decisiongap.sqlite` in service variables.
4. Attach a persistent volume mounted at `/var/data` and check provider pricing. The container runs as the unprivileged `node` user; ensure the volume is writeable by its UID (1000) or configure Railway's volume ownership accordingly.
5. Run the deployment, then check `/api/health`. Do not scale this SQLite edition to multiple running replicas.

## Option 3: Docker on your own HTTPS server

```bash
docker build -t decisiongap-os:1 .
docker volume create decisiongap-data
docker run -d --name decisiongap --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -e NODE_ENV=production -e HOST=0.0.0.0 \
  -e ADMIN_PASSWORD='REPLACE_WITH_UNIQUE_12_CHAR_PLUS' \
  -e SESSION_SECRET='REPLACE_WITH_RANDOM_32_CHAR_PLUS' \
  -e SQLITE_FILE=/var/data/decisiongap.sqlite \
  -v decisiongap-data:/var/data decisiongap-os:1
```

Use an HTTPS reverse proxy (Caddy/Nginx with TLS); Secure cookie login will not work over plain HTTP in production. The host-mounted volume must be writeable by the container user.

## Optional: Shopify live products and checkout

1. Use a real Shopify store for which you have appropriate administrative rights.
2. Create a Storefront API token with read products and write cart permissions in your Shopify configuration. Version: **2026-07 Storefront GraphQL API**.
3. Set `SHOPIFY_SHOP_DOMAIN=your-shop.myshopify.com` and `SHOPIFY_STOREFRONT_TOKEN=...` on your hosting provider, then redeploy.
4. Log in as merchant. Open **Commerce setup** and select **Sync live products**. This overwrites the fictional catalog and clears initial sample metrics/feedback/decisions exactly once. Take a backup first.
5. Open public store. The cart button now obtains a Shopify-hosted `checkoutUrl`. Buyers must complete the payment themselves on Shopify.
6. This release imports up to 24 available products, only the first available variant, only USD-priced stores. Product availability, international pricing, subscription selling plans, taxes and discounts need additional QA/engineering.
7. To count confirmed paid orders, create a Shopify webhook on paid orders to POST `https://YOUR-SERVICE-DOMAIN/api/webhooks/shopify/orders-paid` and set its secret as `SHOPIFY_WEBHOOK_SECRET`. The endpoint verifies Shopify's HMAC and stores only order identifiers hashed with the webhook secret and basic financial totals. Attribution is limited if Shopify does not include the cart attribute in the webhook.

References:
- https://shopify.dev/docs/api/storefront/2026-07
- https://shopify.dev/docs/api/storefront/2026-07/mutations/cartCreate
- https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/cart/manage

## Optional: model-assisted responses

Set `OPENAI_API_KEY` and optionally `OPENAI_MODEL`. Without a key, the prebuilt agent uses deterministic guarded responses. With a key, the model *rephrases* the response, but **cannot issue discounts, charge cards, send messages, or alter policies**. LLM usage incurs provider fees. Do not paste secret information into the chat.

## Merchant demonstration journey

1. Enter `/` and sign in.
2. Check **Overview** for clearly labeled fictional metrics (first run).
3. Open **Customer intelligence**, enter anonymized text: `Shipping fees appear only at the final checkout step and that makes me hesitate.`
4. Open **Growth Studio** to review the shipping-clarity proposal; create a draft and approve it.
5. Open **AI sales agent** to see the explanation and policy rules.
6. Open `/?view=store` and ask: `How much is shipping?` or `Which one is best for office work?`.
7. Add a product, open the cart, and confirm simulated checkout. In connected mode it redirects to Shopify for user-authorized checkout.
8. Return to dashboard to review recorded events; real paid orders require signed webhook notification.

## Operational safeguards

- **Never expose** API keys, admin password or signing secret in client code, screenshots or the Git repo.
- **Backup** the SQLite database and WAL files; restore in a staging copy before relying on the backup.
- Use a **single deployed instance** and persistent volume for this SQLite edition.
- Session authentication is a single password account, not multi-user or enterprise IAM.
- Data retention/privacy policies, consent flows, audit logs, tenant isolation and rate limiting beyond the basic guard are not enterprise-complete.
- Do not send unsolicited marketing or automatic campaign actions: the Growth Studio is explicitly draft/approval only.
- Start with sample data and a test Shopify store before inviting actual buyers.
