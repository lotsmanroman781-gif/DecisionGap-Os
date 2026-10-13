import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, variantForSession } from '../server/data.js';
import { planResponse, inferCategory, insightsFromFeedback, analyticsFromEvents, validatePolicy } from '../server/engine.js';

const state = initialState();
function plan(message, overrides = {}) {
  return planResponse({ message, productId: 'nova-pro', sessionId: 'testing-session-123', products: state.products, policy: state.merchant.policy, ...overrides });
}

test('deterministic experiment assignment', () => {
  assert.equal(variantForSession('1234'), variantForSession('1234'));
  assert.ok(['trust-first', 'value-first'].includes(variantForSession('something')));
});
test('seed analytics contain sample visitors and orders', () => {
  const a = analyticsFromEvents(state.events);
  assert.equal(a.visitors, 1161);
  assert.ok(a.orders > 0);
  assert.ok(a.revenue > 0);
  assert.equal(a.variants.reduce((s, v) => s + v.visits, 0), a.visitors);
});
test('insights are ordered by feedback evidence count', () => {
  const rows = insightsFromFeedback(state.feedback);
  assert.ok(rows[0].count >= rows.at(-1).count);
  assert.equal(rows[0].key, 'trust');
  assert.ok(rows[0].evidence.length > 0);
});
test('category inference does not fabricate sentiment', () => {
  assert.equal(inferCategory('When will my order arrive?'), 'shipping');
  assert.equal(inferCategory('I have a coupon code'), 'price');
  assert.equal(inferCategory('Nice color!'), 'general');
});
test('sales plan reveals verified warranty policy', () => {
  const response = plan('What about the warranty?');
  assert.equal(response.intent, 'trust');
  assert.match(response.reply, /One-year limited manufacturer warranty/);
  assert.equal(response.action, 'recommend');
});
test('sales plan never promises a discount just because a policy ceiling exists', () => {
  const response = plan('Please give me a discount');
  assert.equal(response.intent, 'discount');
  assert.equal(response.action, 'recommend');
  assert.match(response.reply, /not a customer offer/);
});
test('explicit purchase request creates a cart action, not a charge', () => {
  const response = plan('Add those headphones to my cart');
  assert.equal(response.action, 'add_to_cart');
  assert.match(response.reply, /no payment/i);
});
test('uses relevant product in recommendation when requested', () => {
  const response = plan('Which one should I get for commuting?');
  assert.equal(response.product.id, 'pulse-buds');
});
test('policy cannot disable human approval or exceed allowed discount limits', () => {
  const p = validatePolicy({ maxDiscountPercent: 120, minGrossMarginPercent: 0, humanApprovalRequired: false }, state.merchant.policy);
  assert.equal(p.maxDiscountPercent, 15);
  assert.equal(p.minGrossMarginPercent, 15);
  assert.equal(p.humanApprovalRequired, true);
});

test('connected commerce cart language does not describe a real purchase as a demo', () => {
  const response = plan('Add these headphones to my cart', {demo:false, storeName:'Example Store'});
  assert.equal(response.action, 'add_to_cart');
  assert.match(response.reply, /Shopify.*checkout/i);
  assert.doesNotMatch(response.reply, /demo|simulation/i);
});
test('connected store brand name appears instead of sample merchant branding', () => {
  const response = plan('Hi', {demo:false, storeName:'Example Gear'});
  if (response.variant === 'trust-first') assert.match(response.reply, /Example Gear/);
  assert.doesNotMatch(response.reply, /Northstar/);
});
test('product matching works with imported Shopify products rather than fixed sample IDs', () => {
  const products = [
    {...state.products[0],id:'shopify-red',name:'Red Running Shoes',description:'Lightweight shoes for running'},
    {...state.products[1],id:'shopify-tent',name:'Camping Tent',description:'Waterproof outdoor shelter'},
  ];
  const response = plan('Which camping tent would you recommend?',{products,productId:'shopify-red'});
  assert.equal(response.product.id,'shopify-tent');
});
