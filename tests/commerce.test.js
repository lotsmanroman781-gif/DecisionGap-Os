import test from 'node:test';
import assert from 'node:assert/strict';
import { commerceEnabled, commerceStatus, syncProducts, createCheckout } from '../server/commerce.js';

test('Shopify is disabled without explicit credentials',()=>{
  if(process.env.SHOPIFY_SHOP_DOMAIN || process.env.SHOPIFY_STOREFRONT_TOKEN) return;
  assert.equal(commerceEnabled,false);
  assert.equal(commerceStatus().checkout,'Simulation only');
});
test('Shopify calls reject unconfigured integration rather than fake a checkout',async()=>{
  if(commerceEnabled) return;
  await assert.rejects(()=>syncProducts(),/not configured/);
  await assert.rejects(()=>createCheckout([{productId:'any',quantity:1}],[]),/Invalid Shopify cart item/);
});
