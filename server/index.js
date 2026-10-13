import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { loadState, updateState, resetState, addEvent, addDecision } from './store.js';
import { insightsFromFeedback, analyticsFromEvents, inferCategory, planResponse, validatePolicy } from './engine.js';
import { variantForSession } from './data.js';
import { polishReply } from './llm.js';
import { validatePassword, authCookie, clearAuthCookie, isAuthenticated, isSameOrigin, revokeSession } from './auth.js';
import { commerceEnabled, commerceStatus, syncProducts, createCheckout } from './commerce.js';
import { proposePlaybooks, newExperiment } from './growth.js';

const PORT = Math.max(1, Math.min(65535, Number(process.env.PORT) || 3000));
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../web');
const contentTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png' };

function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  // Vercel may provide a pre-parsed body to Node.js functions.
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
    try { return Promise.resolve(JSON.parse(String(req.body))); }
    catch { return Promise.reject(Object.assign(new Error('Invalid JSON payload.'), { status: 400 })); }
  }
  return new Promise((resolve, reject) => {
    let body = ''; let failed = false;
    req.on('data', data => {
      if (failed) return;
      body += data;
      if (body.length > 20000) { failed = true; reject(Object.assign(new Error('Request is too large.'), { status: 413 })); req.destroy(); }
    });
    req.on('end', () => { if (!failed) { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(Object.assign(new Error('Invalid JSON payload.'), { status: 400 })); } } });
    req.on('error', reject);
  });
}
function publicStorefront() {
  const s = loadState();
  return { demo: !(commerceEnabled && s.commerceImported), commerce: commerceStatus(), storeName: s.merchant.name, products: s.products.map(({ cost, ...safeProduct }) => safeProduct), agentEnabled: s.merchant.policy.aiEnabled, notice: commerceEnabled && s.commerceImported ? 'Checkout is completed securely on Shopify. The AI assistant cannot collect payments.' : 'Sample products. Purchases are simulated until a Shopify store is connected and synchronized.' };
}
function bootstrap() {
  const s = loadState();
  return {
    demo: !(commerceEnabled && s.commerceImported),
    commerce: commerceStatus(),
    growth: proposePlaybooks(insightsFromFeedback(s.feedback)),
    experiments: s.experiments || [],
    merchant: s.merchant,
    products: s.products.map(({ cost, ...safeProduct }) => safeProduct),
    analytics: analyticsFromEvents(s.events),
    insights: insightsFromFeedback(s.feedback),
    feedback: [...s.feedback].reverse().slice(0, 30),
    decisions: s.decisions.slice(0, 12),
    orders: s.orders.slice(-10).reverse(),
    experiment: { name: 'Trust-first vs value-first', status: 'Running · demo', method: 'Deterministic assignment by session ID', goal: 'Compare completed demo checkouts per visitor', caveat: 'Seeded synthetic metrics are not evidence of a real-world conversion lift.' },
  };
}
const validEventTypes = new Set(['visit', 'chat_open', 'add_to_cart', 'checkout_start']);
const rateCounters = new Map();
function limited(req, category, max, windowMs = 60_000) {
  const key = `${req.socket.remoteAddress || 'unknown'}:${category}`;
  const now = Date.now(); const old = rateCounters.get(key);
  if (rateCounters.size > 2000) for (const [k, v] of rateCounters) if (v.until < now) rateCounters.delete(k);
  if (!old || old.until < now) { rateCounters.set(key, { until: now + windowMs, count: 1 }); return false; }
  old.count++;
  return old.count > max;
}
const adminRoutes = new Set(['/api/bootstrap', '/api/reset', '/api/settings', '/api/feedback', '/api/commerce/sync', '/api/growth/experiments', '/api/growth/experiments/approve', '/api/growth/experiments/pause']);


async function api(req, res, url) {
  const method = req.method;
  const route = url.pathname;
  if (method !== 'GET' && method !== 'HEAD' && !isSameOrigin(req)) return json(res, 403, { error: 'Cross-origin requests are not permitted.' });
  if (method === 'GET' && route === '/api/health') return json(res, 200, { ok: true, app: 'DecisionGap OS', mode: process.env.OPENAI_API_KEY ? 'llm-assisted' : 'rules-based', commerce: commerceEnabled ? 'connected' : 'demo', hosted: process.env.NODE_ENV === 'production' });
  if (method === 'GET' && route === '/api/storefront') return json(res, 200, publicStorefront());
  if (method === 'GET' && route === '/api/auth/me') return json(res, isAuthenticated(req) ? 200 : 401, { authenticated: isAuthenticated(req) });
  if (method === 'POST' && route === '/api/auth/login') {
    if (limited(req, 'login', 8, 10 * 60_000)) return json(res, 429, { error: 'Too many attempts. Try again later.' });
    const body = await readBody(req);
    if (!validatePassword(body.password)) return json(res, 401, { error: 'Incorrect password.' });
    return json(res, 200, { authenticated: true }, { 'set-cookie': authCookie() });
  }
  if (method === 'POST' && route === '/api/auth/logout') { revokeSession(req); return json(res, 200, { authenticated: false }, { 'set-cookie': clearAuthCookie() }); }
  if (adminRoutes.has(route) && !isAuthenticated(req)) return json(res, 401, { error: 'Merchant login required.' });

  if (method === 'POST' && route === '/api/commerce/sync') {
    if (!commerceEnabled) return json(res, 409, { error: 'Set Shopify credentials in hosting environment variables first.' });
    if (limited(req, 'sync', 5, 10*60_000)) return json(res, 429, { error:'Please wait before another sync.' });
    const result = await syncProducts();
    updateState(s => {
      // Never mix fictional demo metrics into a live merchant's dashboard.
      if (!s.commerceImported) { s.events=[]; s.feedback=[]; s.decisions=[]; s.orders=[]; s.experiments=[]; }
      s.products = result.products; s.merchant.name=result.shopName; s.commerceImported=true;
    });
    return json(res, 200, {ok:true, count: result.products.length, merchant:result.shopName});
  }
  if (method === 'POST' && route === '/api/growth/experiments') {
    const body = await readBody(req);
    const proposals = proposePlaybooks(insightsFromFeedback(loadState().feedback));
    const experiment = newExperiment(body, proposals);
    updateState(s => {s.experiments ||= [];s.experiments.unshift(experiment);s.experiments=s.experiments.slice(0,50);});
    return json(res, 201, {experiment,notice:'Draft only. Approval does not automate changes to Shopify.'});
  }
  if (method === 'POST' && route === '/api/growth/experiments/approve') {
    const body = await readBody(req);
    let updated;
    updateState(s=>{const exp=(s.experiments||[]).find(e=>e.id===body.id);if(!exp||exp.status!=='draft') throw Object.assign(new Error('Draft experiment not found.'),{status:404});exp.status='approved';exp.approvedAt=new Date().toISOString();updated=exp;});
    return json(res,200,{experiment:updated,notice:'Approved as a proposed test. External site changes are not executed automatically.'});
  }
  if (method === 'POST' && route === '/api/growth/experiments/pause') {
    const body=await readBody(req);let updated;
    updateState(s=>{const exp=(s.experiments||[]).find(e=>e.id===body.id);if(!exp) throw Object.assign(new Error('Experiment not found.'),{status:404});exp.status='paused';updated=exp;});
    return json(res,200,{experiment:updated});
  }
  if (method === 'GET' && route === '/api/reports/summary.csv') {
    if (!isAuthenticated(req)) return json(res,401,{error:'Merchant login required.'});
    const snapshot=bootstrap();
    const esc=x=>'"'+String(x??'').replaceAll('"','""')+'"';
    const rows=[['metric','value','note'],
      ['visitors',snapshot.analytics.visitors,snapshot.demo?'Includes synthetic seed activity':'Recorded storefront visitor events'],
      ['orders',snapshot.analytics.orders,snapshot.demo?'Simulated and seed activity':'Verified paid-order webhooks (if enabled)'],
      ['revenue_usd',snapshot.analytics.revenue,snapshot.demo?'Synthetic sales totals':'Gross verified order amounts'],
      ['conversion_pct',snapshot.analytics.conversion,'Attribution is not proof of incremental lift'],
      ['feedback_items',snapshot.feedback.length,'Anonymized merchant-provided feedback only'],
      ['experiment_drafts',snapshot.experiments.filter(x=>x.status==='draft').length,'Merchant review needed']];
    const csv=rows.map(row=>row.map(esc).join(',')).join('\r\n')+'\r\n';
    res.writeHead(200,{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename=decisiongap-summary.csv','cache-control':'no-store','x-content-type-options':'nosniff'});
    res.end(csv);return;
  }
  if (method === 'GET' && route === '/api/bootstrap') return json(res, 200, bootstrap());
  if (method === 'POST' && route === '/api/reset') { if(commerceEnabled) return json(res,403,{error:'Reset is disabled for connected Shopify stores.'}); resetState(); return json(res, 200, bootstrap()); }
  if (method === 'POST' && route === '/api/settings') {
    const body = await readBody(req);
    updateState(s => { s.merchant.policy = validatePolicy(body, s.merchant.policy); });
    return json(res, 200, { policy: loadState().merchant.policy });
  }
  if (method === 'POST' && route === '/api/events') {
    if (limited(req, 'event', 180)) return json(res, 429, { error: 'Request limit exceeded.' });
    const body = await readBody(req);
    if (!validEventTypes.has(body.type)) return json(res, 400, { error: 'Unsupported event type.' });
    if (typeof body.sessionId !== 'string' || body.sessionId.length > 100 || body.sessionId.length < 6) return json(res, 400, { error: 'Valid sessionId required.' });
    const state = loadState();
    const id = String(body.productId || '');
    if (id && !state.products.some(p => p.id === id)) return json(res, 400, { error: 'Unknown product.' });
    const duplicate = ['visit', 'chat_open'].includes(body.type) && state.events.some(e => e.sessionId === body.sessionId && e.type === body.type);
    if (!duplicate) addEvent({ type: body.type, sessionId: body.sessionId, variant: variantForSession(body.sessionId), productId: id });
    return json(res, 200, { ok: true, variant: variantForSession(body.sessionId), deduplicated: duplicate });
  }
  if (method === 'POST' && route === '/api/chat') {
    if (limited(req, 'chat', 25)) return json(res, 429, { error: 'Please wait before sending more messages.' });
    const body = await readBody(req);
    const state = loadState();
    if (!state.merchant.policy.aiEnabled) return json(res, 403, { error: 'The merchant has paused the AI sales agent.' });
    if (typeof body.message !== 'string' || body.message.trim().length < 1 || body.message.length > 800) return json(res, 400, { error: 'Message must be 1–800 characters.' });
    const sessionId = typeof body.sessionId === 'string' && body.sessionId.length >= 6 && body.sessionId.length <= 100 ? body.sessionId : `anon-${randomUUID()}`;
    let planned = planResponse({ message: body.message, productId: body.productId, sessionId, products: state.products, policy: state.merchant.policy, evidenceInsights: insightsFromFeedback(state.feedback), demo: !(commerceEnabled && state.commerceImported), storeName: state.merchant.name });
    const complete = await polishReply(planned, state.products.find(p => p.id === planned.product.id), body.message);
    addDecision({ title: `${complete.strategy} · ${complete.product.name}`, detail: complete.reason, strategy: complete.strategy, intent: complete.intent, mode: complete.mode });
    return json(res, 200, { ...complete, sessionId, disclosure: commerceEnabled && state.commerceImported ? 'AI shopping assistant · Shopify checkout requires your confirmation.' : 'AI shopping assistant · Demo storefront · No real payments.' });
  }
  if (method === 'POST' && route === '/api/feedback') {
    const body = await readBody(req);
    if (typeof body.text !== 'string' || body.text.trim().length < 12 || body.text.length > 1000) return json(res, 400, { error: 'Feedback must contain 12–1,000 characters.' });
    const category = inferCategory(body.text);
    updateState(s => { s.feedback.push({ id: randomUUID(), text: body.text.trim(), category, timestamp: new Date().toISOString(), seed: false }); s.feedback = s.feedback.slice(-1000); });
    return json(res, 201, { ok: true, category, insights: insightsFromFeedback(loadState().feedback) });
  }
  if (method === 'POST' && route === '/api/checkout') {
    if (limited(req, 'checkout', 12)) return json(res, 429, { error: 'Request limit exceeded.' });
    const body = await readBody(req);
    if (typeof body.sessionId !== 'string' || body.sessionId.length < 6 || body.sessionId.length > 100) return json(res, 400, { error: 'Valid sessionId required.' });
    if (!Array.isArray(body.items) || !body.items.length || body.items.length > 10) return json(res, 400, { error: 'Cart must contain 1–10 products.' });
    const state = loadState(); let amount = 0; const items = [];
    for (const entry of body.items) {
      const p = state.products.find(p => p.id === entry.productId);
      const quantity = Number(entry.quantity);
      if (!p || !Number.isInteger(quantity) || quantity < 1 || quantity > 5 || quantity > p.inventory) return json(res, 400, { error: 'Invalid product or quantity.' });
      amount += p.price * quantity;
      items.push({ productId: p.id, name: p.name, quantity, unitPrice: p.price });
    }
    if (commerceEnabled && state.commerceImported) {
      if (!state.products.every(p=>p.merchandiseId)) return json(res, 409, {error:'Sync Shopify products from the dashboard before accepting real checkouts.'});
      const checkout=await createCheckout(body.items,state.products, String(req.headers['cf-connecting-ip'] || req.socket.remoteAddress || '').replace(/^::ffff:/,''), body.sessionId);
      addEvent({type:'checkout_handoff',sessionId:body.sessionId,variant:variantForSession(body.sessionId), productId:items[0].productId});
      return json(res,200,{ok:true,...checkout,paymentCollected:false,notice:'Complete payment only on Shopify checkout.'});
    }
    const order = { id: `DEMO-${Math.floor(Date.now() / 1000)}`, items, amount: Math.round(amount * 100) / 100, sessionId: body.sessionId, status: 'Simulated order — no charge', timestamp: new Date().toISOString(), demo: true };
    updateState(s => {
      s.orders.push(order); s.orders = s.orders.slice(-500);
      s.events.push({ type: 'order', amount: order.amount, sessionId: body.sessionId, variant: variantForSession(body.sessionId), timestamp: order.timestamp, seed: false, productId: items[0].productId }); s.events = s.events.slice(-10000);
    });
    return json(res, 201, { ok: true, order, paymentCollected: false });
  }
  return json(res, 404, { error: 'API endpoint not found.' });
}

function staticFile(req, res, url) {
  let relative;
  try { relative = decodeURIComponent(url.pathname); } catch { return json(res, 400, { error: 'Invalid URL.' }); }
  if (relative === '/' || relative === '/store') relative = '/index.html';
  const file = path.resolve(webDir, `.${relative}`);
  if (!file.startsWith(webDir + path.sep) && file !== webDir) return json(res, 403, { error: 'Forbidden.' });
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return json(res, 404, { error: 'Page not found.' });
  res.writeHead(200, { 'content-type': contentTypes[path.extname(file)] || 'application/octet-stream', 'x-content-type-options': 'nosniff', 'cache-control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}


function webhookBody(req) {
  return new Promise((resolve,reject)=>{
    let buffers=[], n=0;
    req.on('data',x=>{n+=x.length;if(n>262144){reject(Object.assign(new Error('Webhook too large.'),{status:413}));req.destroy();}else buffers.push(x);});
    req.on('end',()=>resolve(Buffer.concat(buffers)));
    req.on('error',reject);
  });
}
async function verifiedShopifyPaidWebhook(req,res) {
  const secret=process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!commerceEnabled || !secret) return json(res,403,{error:'Webhook integration not configured.'});
  const body=await webhookBody(req);
  const hmac=String(req.headers['x-shopify-hmac-sha256']||'');
  const expected=createHmac('sha256',secret).update(body).digest('base64');
  const a=Buffer.from(hmac),b=Buffer.from(expected);
  if(a.length!==b.length||!timingSafeEqual(a,b))return json(res,401,{error:'Invalid Shopify webhook signature.'});
  let event;try{event=JSON.parse(body.toString('utf8'));}catch{return json(res,400,{error:'Invalid JSON.'});}
  if(!event.id||!event.total_price)return json(res,400,{error:'Missing order ID or total.'});
  if(String(event.currency||'USD')!=='USD')return json(res,202,{ok:true,ignored:'Non-USD order.'});
  const orderHash=createHmac('sha256',secret).update(String(event.id)).digest('hex').slice(0,24);
  if(loadState().orders.some(x=>x.id===`SHOPIFY-${orderHash}`))return json(res,200,{ok:true,deduplicated:true});
  const amount=Number(event.total_price);if(!Number.isFinite(amount)||amount<0)return json(res,400,{error:'Invalid amount.'});
  const sessionId=Array.isArray(event.note_attributes)?String(event.note_attributes.find(x=>x.name==='decisiongap_session')?.value||'unattributed'):'unattributed';
  const order={id:`SHOPIFY-${orderHash}`,amount,sessionId:sessionId.slice(0,100),status:'Paid on Shopify',timestamp:new Date().toISOString(),demo:false};
  updateState(s=>{s.orders.push(order);s.orders=s.orders.slice(-500);s.events.push({type:'order',amount,sessionId:order.sessionId,variant:variantForSession(order.sessionId),timestamp:order.timestamp,seed:false});s.events=s.events.slice(-10000);});
  return json(res,200,{ok:true});
}

export async function handleRequest(req, res) {
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('content-security-policy', "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'");
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method === 'POST' && url.pathname === '/api/webhooks/shopify/orders-paid') return await verifiedShopifyPaidWebhook(req,res);
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' });
    return staticFile(req, res, url);
  } catch (e) {
    console.error('[DecisionGap]', e?.message || e);
    return !res.headersSent && json(res, e.status || 500, { error: e.status ? e.message : 'An unexpected server error occurred.' });
  }
}

if (!process.env.VERCEL) http.createServer(handleRequest).listen(PORT, HOST, () => {
  loadState();
  console.log(`\n  ✦ DecisionGap OS is running at http://${HOST}:${PORT}`);
  console.log(`  ✦ AI mode: ${process.env.OPENAI_API_KEY ? 'LLM-assisted' : 'Rules-based demo (no API key required)'}`);
  console.log(`  ✦ ${commerceEnabled ? 'Shopify checkout handoff enabled' : 'Sample data and simulated checkout only'}; merchant-approved actions only.\n`);
});
