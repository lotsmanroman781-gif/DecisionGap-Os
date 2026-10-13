/** Merchant-controlled Shopify Storefront API integration.
 *  Products are synced on request. Checkout uses Shopify-hosted payments only.
 *  Credentials never leave the server. One connected store per deployment.
 */
const domain = (process.env.SHOPIFY_SHOP_DOMAIN || '').trim().toLowerCase();
const token = process.env.SHOPIFY_STOREFRONT_TOKEN || '';
const version = '2026-07';
// The Vercel Hobby build is a temporary non-commercial demo; real commerce is disabled.
export const commerceEnabled = !process.env.VERCEL && !!(domain && token);
if (domain && !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain)) {
  throw new Error('SHOPIFY_SHOP_DOMAIN must be a shop-name.myshopify.com hostname.');
}
export function commerceStatus() {
  return { connected: commerceEnabled, provider: 'Shopify Storefront API', shopDomain: commerceEnabled ? domain : null, checkout: commerceEnabled ? 'Shopify-hosted checkout' : 'Simulation only', currency: 'USD (MVP)' };
}
export async function shopify(query, variables = {}, options = {}) {
  if (!commerceEnabled) throw Object.assign(new Error('Shopify is not configured.'), {status: 409});
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`https://${domain}/api/${version}/graphql.json`, {
      method:'POST', signal:controller.signal,
      headers: { 'content-type':'application/json', 'X-Shopify-Storefront-Access-Token':token, ...(options.buyerIp ? {'Shopify-Storefront-Buyer-IP': options.buyerIp} : {}) },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) throw Object.assign(new Error(`Shopify request failed (HTTP ${response.status}).`), {status:502});
    const responseJson = await response.json();
    if (responseJson.errors?.length) throw Object.assign(new Error('Shopify rejected the request. Check the store and Storefront API permissions.'), {status:502});
    return responseJson.data;
  } finally { clearTimeout(timer); }
}
export async function syncProducts() {
  const data = await shopify(`query ProductCatalog { shop { name } products(first: 24) { nodes { id title description productType featuredImage { url altText } variants(first: 1) { nodes { id availableForSale quantityAvailable price { amount currencyCode } compareAtPrice { amount currencyCode } } } } } }`);
  const products = (data.products?.nodes || []).flatMap((item, index) => {
    const v = item.variants?.nodes?.[0];
    if (!v || v.price.currencyCode !== 'USD' || !v.availableForSale) return [];
    const price = Number(v.price.amount);
    if (!Number.isFinite(price) || price <= 0) return [];
    const type = String(item.productType || 'Products').slice(0, 40);
    return [{ id: `shopify-${index}-${String(item.id).split('/').pop()}`, shopifyProductId:item.id, merchandiseId:v.id,
      name:String(item.title).slice(0,100), subtitle:String(item.description||'').slice(0,115), category:type,
      description:String(item.description||'').slice(0,1500), price, compareAt:Number(v.compareAtPrice?.amount || price),
      cost:0, inventory: Number.isFinite(v.quantityAvailable) ? Math.max(0,v.quantityAvailable) : 9999,
      icon: /ear/i.test(type)?'earbuds':/audio|speaker/i.test(type)?'speaker':'bag', color:['lavender','peach','mint'][index%3],
      tags:[],features: [String(item.description || '').slice(0,170)].filter(Boolean),shipping:'Shipping and tax are calculated at Shopify checkout.',
      warranty:'Check the merchant website for the current warranty policy.', returns:'Check the merchant website for the current return policy.',
      imageUrl: /^https:\/\//i.test(String(item.featuredImage?.url||'')) ? String(item.featuredImage.url).slice(0,1000) : '' }];
  });
  if (!products.length) throw Object.assign(new Error('No available USD-priced Shopify products found. This MVP supports USD only.'), {status:422});
  return { shopName: String(data.shop?.name || 'Shopify Store').slice(0,80), products };
}
export async function createCheckout(items, catalog, buyerIp, sessionId = '') {
  if (!Array.isArray(items) || !items.length || items.length > 10) throw Object.assign(new Error('Cart must contain 1-10 products.'), {status:400});
  const lines = items.map(({productId, quantity}) => {
    const p = catalog.find(x => x.id === productId);
    if (!p?.merchandiseId || !Number.isInteger(quantity) || quantity < 1 || quantity > 5) throw Object.assign(new Error('Invalid Shopify cart item or quantity.'), {status:400});
    return {merchandiseId:p.merchandiseId,quantity};
  });
  const data=await shopify(`mutation CreateBuyerCart($input: CartInput!) { cartCreate(input:$input) { cart { id checkoutUrl cost { subtotalAmount { amount currencyCode } } } userErrors { message } } }`, {input:{lines,attributes:sessionId?[{key:'decisiongap_session',value:sessionId.slice(0,100)}]:[]}}, {buyerIp});
  if(data.cartCreate?.userErrors?.length) throw Object.assign(new Error(data.cartCreate.userErrors.map(x=>x.message).join('; ').slice(0,300)),{status:422});
  const raw=data.cartCreate?.cart?.checkoutUrl;
  if (!raw) throw Object.assign(new Error('Shopify did not return a checkout URL.'),{status:502});
  const url=new URL(raw);
  if (url.protocol!=='https:' || !url.hostname || /^(localhost|127\.|10\.|192\.168\.)/.test(url.hostname)) throw Object.assign(new Error('Invalid Shopify checkout URL.'),{status:502});
  return { checkoutUrl:url.href, estimatedSubtotal:Number(data.cartCreate.cart.cost?.subtotalAmount?.amount||0), currency:'USD', cartCreated:true };
}
