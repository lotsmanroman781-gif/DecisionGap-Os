import test from 'node:test';
import assert from 'node:assert/strict';

test('Shopify product sync and checkout handoff work against a mocked Storefront API', async () => {
  const prev={domain:process.env.SHOPIFY_SHOP_DOMAIN,token:process.env.SHOPIFY_STOREFRONT_TOKEN};
  const priorFetch=globalThis.fetch;
  process.env.SHOPIFY_SHOP_DOMAIN='test-shop.myshopify.com';
  process.env.SHOPIFY_STOREFRONT_TOKEN='not-a-real-token';
  let cartInput;
  globalThis.fetch=async (url,opts)=>{
    assert.match(url,/https:\/\/test-shop\.myshopify\.com\/api\/2026-07\/graphql\.json/);
    assert.equal(opts.headers['X-Shopify-Storefront-Access-Token'],'not-a-real-token');
    const data=JSON.parse(opts.body);
    if(data.query.includes('query ProductCatalog')) return {ok:true,json:async()=>({data:{shop:{name:'Example Merchant'},products:{nodes:[{
      id:'gid://shopify/Product/19',title:'Quiet Pro',description:'Reliable product.',productType:'Headphones',
      featuredImage:{url:'https://cdn.shopify.com/example.png',altText:'Quiet Pro'},
      variants:{nodes:[{id:'gid://shopify/ProductVariant/91',availableForSale:true,quantityAvailable:10,price:{amount:'129.50',currencyCode:'USD'},compareAtPrice:{amount:'149.00',currencyCode:'USD'}}]}
    }]}}})};
    if(data.query.includes('mutation CreateBuyerCart')){
      cartInput=data.variables.input;
      return {ok:true,json:async()=>({data:{cartCreate:{cart:{id:'cid',checkoutUrl:'https://test-shop.myshopify.com/checkouts/abc',cost:{subtotalAmount:{amount:'129.50',currencyCode:'USD'}}},userErrors:[]}}})};
    }
    throw new Error('Unexpected query');
  };
  try{
    const m=await import(`../server/commerce.js?shopifytest=${Date.now()}`);
    assert.equal(m.commerceEnabled,true);
    const synced=await m.syncProducts();
    assert.equal(synced.products.length,1);
    assert.equal(synced.products[0].price,129.5);
    const result=await m.createCheckout([{productId:synced.products[0].id,quantity:1}],synced.products,'203.0.113.10','session-verified');
    assert.equal(result.paymentCollected,undefined);
    assert.match(result.checkoutUrl,/https:\/\/test-shop\.myshopify\.com/);
    assert.equal(cartInput.lines[0].merchandiseId,'gid://shopify/ProductVariant/91');
    assert.equal(cartInput.attributes[0].value,'session-verified');
    await assert.rejects(()=>m.createCheckout([{productId:'missing',quantity:1}],synced.products),/Invalid Shopify cart/);
  }finally{
    globalThis.fetch=priorFetch;
    if(prev.domain === undefined)delete process.env.SHOPIFY_SHOP_DOMAIN;else process.env.SHOPIFY_SHOP_DOMAIN=prev.domain;
    if(prev.token === undefined)delete process.env.SHOPIFY_STOREFRONT_TOKEN;else process.env.SHOPIFY_STOREFRONT_TOKEN=prev.token;
  }
});
