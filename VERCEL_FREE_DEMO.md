# DecisionGap OS v1.1 — Vercel Free Demo Edition

This edition is meant **only for personal, non-commercial demonstrations**. It uses the original application's dashboard, AI-assisted sample storefront, built-in rules-based engine, and Growth Studio. A permanent database is NOT included.

## Quick deployment with GitHub
1. Replace your GitHub repository's contents with this edition, or create a new repository named `DecisionGap-OS-Vercel-Demo` to keep the original, durable-hosting version unchanged.
2. Go to https://vercel.com/new and choose **Import Git Repository**. Connect GitHub and select the repository.
3. Set **Framework Preset = Other**, **Root Directory = repository root**. Leave Build Command, Output Directory and Install Command at defaults/blank; the static assets are in `public/` and API function is in `api/index.js`.
4. In **Environment Variables** add:
   - `ADMIN_PASSWORD`: your own password of at least 12 characters.
   - `SESSION_SECRET`: an independent random value at least 32 characters long. You can generate one locally with `openssl rand -hex 32`.
   - `VERCEL` is provided automatically by Vercel; do not set it yourself.
5. Select the Hobby (free) plan only if your use is personal and non-commercial, and click **Deploy**.
6. Check `https://<your-url>.vercel.app/api/health`; visit `/` for the merchant dashboard or `/?view=store` for the public demo storefront.

## Known limitations (important)
- Vercel Functions cannot persist state on their local filesystem. The app uses ephemeral `/tmp` storage plus a per-instance memory cache. **Feedback, experiment changes, policy changes, sample purchases and analytics can reset, differ between instances or disappear without warning.**
- For the free demo, Shopify commerce is deliberately **disabled** even if Shopify environment variables are configured. All purchases are simulated; no money is collected.
- `OPENAI_API_KEY` is optional for model-enhanced replies, but usage of the OpenAI API can incur costs. Without it, the built-in rules engine works.
- The per-instance rate limiting and logout revocation are not reliable distributed controls. Do not use for production, real shoppers, or sensitive data.
- Do not put private customer data into this demo.
- Free Vercel Hobby is only for personal/non-commercial projects. A live merchant sales service needs an appropriate commercial hosting plan.
- For a real deployment with persistence, use the original v1.1 on a host with a persistent disk (as described in `DEPLOY.md`), or rearchitect the backend to use a remote database (e.g. Turso or Postgres) with a transactional async store.

## Git commands if you keep the original repository and replace it
Copy the extracted edition's files into the local repository directory (including `api/`, `public/`, and `vercel.json`) and run:

```bash
git add .
git commit -m "Add Vercel demo deployment"
git push -u newgithub main
```

If you used a different remote name, substitute that name or use `git push` if an upstream is set.

## Local validation
Run:

```bash
npm test
npm start
```

This tests/starts the ordinary Node server locally, not the serverless Vercel runtime. Serverless adapter checks are in `tests/vercel-adapter.test.js`.
