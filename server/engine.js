import { variantForSession } from './data.js';

export const barrierInfo = {
  shipping: {
    title: 'Shipping visibility', label: 'Operational friction', icon: 'truck',
    description: 'Shoppers report discovering shipping costs or delivery estimates late in checkout.',
    recommended: 'Display shipping costs and delivery estimates earlier. Run a controlled checkout test.',
  },
  trust: {
    title: 'Trust & warranty clarity', label: 'Confidence gap', icon: 'shield',
    description: 'Customers want clearer proof of warranty coverage and return conditions.',
    recommended: 'Make verified warranty and return details prominent on relevant product pages.',
  },
  comparison: {
    title: 'Product decision uncertainty', label: 'Decision friction', icon: 'compare',
    description: 'Interested shoppers want guidance matching products to their use cases.',
    recommended: 'Test guided product comparisons against the current product experience.',
  },
  price: {
    title: 'Price-value uncertainty', label: 'Value gap', icon: 'tag',
    description: 'Some shoppers want affordable alternatives or more clarity about the value offered.',
    recommended: 'Explain practical use-case differences before testing margin-safe promotions.',
  },
  checkout: {
    title: 'Checkout complexity', label: 'Process friction', icon: 'cursor',
    description: 'Some feedback suggests the checkout steps are not clear enough.',
    recommended: 'Simplify instructions and measure checkout completion against a control.',
  },
};

export function inferCategory(text) {
  const t = String(text).toLowerCase();
  if (/ship|deliver|arriv|courier|postage/.test(t)) return 'shipping';
  if (/warrant|return|refund|trust|reliab|break|quality|guarant/.test(t)) return 'trust';
  if (/compar|choos|which|option|versus|\bvs\b|difference/.test(t)) return 'comparison';
  if (/cost|budget|price|expens|cheaper|discount|promo|coupon|afford/.test(t)) return 'price';
  if (/checkout|paymen|payment screen|buy button|confirm order/.test(t)) return 'checkout';
  return 'general';
}

export function insightsFromFeedback(feedback) {
  const categories = Object.keys(barrierInfo);
  return categories.map(category => {
    const matches = feedback.filter(f => (f.category || inferCategory(f.text)) === category);
    const info = barrierInfo[category];
    return {
      key: category, ...info, count: matches.length,
      evidence: matches.slice(0, 2).map(f => f.text),
      evidenceLevel: matches.length >= 5 ? 'Repeated signal' : matches.length >= 2 ? 'Early signal' : 'Limited evidence',
      priority: Math.max(1, Math.min(5, Math.ceil(matches.length / 1.6))),
    };
  }).sort((a, b) => b.count - a.count);
}

export function analyticsFromEvents(events) {
  const count = type => events.filter(e => e.type === type).length;
  const revenue = events.filter(e => e.type === 'order').reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const visitCount = count('visit');
  const orderCount = count('order');
  const toPercent = (num, den) => den ? +(num / den * 100).toFixed(1) : 0;
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(Date.now() - (6 - i) * 86400000).toISOString().slice(0, 10);
    const dayEvents = events.filter(e => e.timestamp?.slice(0, 10) === date);
    return { date, visits: dayEvents.filter(e => e.type === 'visit').length, orders: dayEvents.filter(e => e.type === 'order').length };
  });
  const variants = ['trust-first', 'value-first'].map(key => {
    const rows = events.filter(e => e.variant === key);
    const visits = rows.filter(e => e.type === 'visit').length;
    const orders = rows.filter(e => e.type === 'order').length;
    return { key, label: key === 'trust-first' ? 'Trust-first guidance' : 'Value-first guidance', visits, chats: rows.filter(e => e.type === 'chat_open').length, carts: rows.filter(e => e.type === 'add_to_cart').length, orders, conversion: toPercent(orders, visits) };
  });
  return { visitors: visitCount, chats: count('chat_open'), carts: count('add_to_cart'), orders: orderCount, revenue: +revenue.toFixed(2), conversion: toPercent(orderCount, visitCount), week, variants, simulatedSeed: events.some(e => e.seed) };
}

function productForMessage(text, selectedId, products) {
  // Catalog-agnostic matching also works after replacing the sample products with Shopify items.
  const t = text.toLowerCase();
  const selected = products.find(p => p.id === selectedId);
  const words = (t.match(/[a-z0-9]+/g) || []).filter(w => w.length > 3 &&
    !new Set(['what', 'would', 'which', 'those', 'these', 'have', 'about', 'your', 'please', 'want', 'looking', 'show', 'with', 'this', 'that', 'does', 'from', 'should', 'their']).has(w));
  const normalized = words.map(w => w.replace(/ing$|ers$|ed$|s$/,'')).filter(w=>w.length >= 3);
  let best = null, bestScore = 0;
  for (const product of products) {
    const name = `${product.name || ''} ${product.category || ''}`.toLowerCase();
    const supporting = `${(product.tags || []).join(' ')} ${(product.features || []).join(' ')} ${product.description || ''} ${product.subtitle || ''}`.toLowerCase();
    const score = normalized.reduce((total, word) => total + (name.includes(word) ? 3 : supporting.includes(word) ? 1 : 0), 0);
    if (score > bestScore) { best = product; bestScore = score; }
  }
  return best || selected || products[0];
}

export function planResponse({ message, productId, sessionId, products, policy, evidenceInsights = [], demo = true, storeName = 'this store' }) {
  const input = String(message || '').trim().slice(0, 800);
  if (!input) throw new Error('Please type a question or request.');
  const t = input.toLowerCase();
  const variant = variantForSession(sessionId || 'anonymous');
  const topEvidence = evidenceInsights.find(item => item.count >= 3);
  const product = productForMessage(input, productId, products);
  let reply, strategy, intent, suggestedAction = 'recommend', reason;
  const canDiscount = Boolean(policy.allowDiscounts) && Number(policy.maxDiscountPercent) > 0;
  const bestMarginDiscount = Math.max(0, Math.floor((1 - product.cost / (product.price * (1 - Number(policy.minGrossMarginPercent) / 100))) * 100));
  const allowedDiscountPct = Math.max(0, Math.min(Number(policy.maxDiscountPercent), bestMarginDiscount));
  const buyIntent = /\b(buy|purchase|checkout|take it|order (it|this|one))\b/.test(t) || /\b(add|put)\b.{0,75}\bcart\b/.test(t);
  const explain = detail => `${detail} Would you like me to add ${product.name} to your ${demo ? 'demo ' : ''}cart?`;

  if (buyIntent) {
    intent = 'purchase'; strategy = 'Checkout assistance'; suggestedAction = 'add_to_cart';
    reason = 'The shopper explicitly requested a purchase or cart action.';
    reply = demo
      ? `Absolutely — I can add ${product.name} ($${product.price}) to your demo cart. This is a simulation: no payment will be taken.`
      : `Absolutely — I can add ${product.name} ($${product.price}) to your cart. You'll review the items and explicitly complete any payment on Shopify's secure checkout.`;
  } else if (/warrant|return|refund|reliab|break|guarant|trust/.test(t)) {
    intent = 'trust'; strategy = 'Trust-first explanation';
    reason = 'The shopper asked about purchase protection; verified policy information takes priority.';
    reply = `${product.name} includes: ${product.warranty} ${product.returns} I can explain the product features too, or help you add it to your cart.`;
  } else if (/ship|deliver|arriv|shipping/.test(t)) {
    intent = 'shipping'; strategy = 'Shipping transparency';
    reason = 'Delivery uncertainty is a potential purchase barrier.';
    reply = `${product.shipping} I won’t promise an exact delivery date before checkout. Want to compare products or add ${product.name} to your ${demo ? 'demo ' : ''}cart?`;
  } else if (/discount|coupon|promo|sale|deal/.test(t)) {
    intent = 'discount'; strategy = 'Guardrailed promotion';
    reason = 'The shopper requested a promotion; any offer must remain within merchant policy and margin floor.';
    if (!canDiscount || allowedDiscountPct <= 0) reply = `I don’t have an approved discount to offer right now. ${product.name} is currently $${product.price}. I can help find the best fit for your budget instead.`;
    else reply = `I can discuss ${product.name} at $${product.price}, but I can’t issue a discount without an active store promotion. The merchant has configured a maximum discount cap of ${allowedDiscountPct}%; that is a policy ceiling, not a customer offer. Would a lower-priced option be helpful?`;
  } else if (/price|cost|expens|budget|cheap|afford/.test(t)) {
    intent = 'price'; strategy = 'Value-first guidance';
    reason = 'The customer described budget or value concerns; do not discount automatically.';
    const cheapest = [...products].sort((a,b) => a.price - b.price)[0];
    reply = `The ${product.name} is $${product.price}. If your priority is a lower price, ${cheapest.name} is $${cheapest.price}. They serve different needs, so I can compare them before you decide.`;
  } else if (/compar|difference|which|choose|best|recommend|looking|need|versus|\bvs\b/.test(t)) {
    intent = 'compare'; strategy = 'Guided product discovery';
    reason = 'The shopper needs help choosing a product based on use case.';
    reply = explain(`Based on what you mentioned, I’d start with ${product.name} ($${product.price}). Key features: ${product.features.slice(0, 3).join('; ')}. This is a use-case match, not a guarantee that it is best for everyone.`);
  } else if (/battery|bluetooth|feature|spec|noise|waterproof|water.resist/.test(t)) {
    intent = 'features'; strategy = 'Verified product education';
    reason = 'The shopper requested product specifications.';
    reply = explain(`${product.name} includes ${product.features.join(', ')}.`);
  } else if (/hi|hello|hey|help|start/.test(t) && t.length < 40) {
    intent = 'greeting'; strategy = variant === 'trust-first' ? 'Trust-first greeting' : 'Value-first greeting';
    reason = `The session was assigned a reproducible experiment variant. ${topEvidence ? 'Recent feedback also prioritizes: ' + topEvidence.title + ' (' + topEvidence.count + ' mentions).' : 'No high-frequency feedback barrier is available.'}`;
    reply = variant === 'trust-first'
      ? `Hi! I’m the AI shopping assistant for ${storeName}. ${topEvidence?.key === 'shipping' ? 'I can help clarify shipping and delivery details.' : topEvidence?.key === 'trust' ? 'I can help clarify warranty and return information.' : 'I can help compare products, check warranty and return details, or prepare your cart.'} What would you like to know?`
      : `Hey there! Looking for something for work, commuting, or home? Tell me your budget or use case and I’ll suggest a relevant option from our store.`;
  } else {
    intent = 'explore'; strategy = variant === 'trust-first' ? 'Trust-first exploration' : 'Value-first exploration';
    reason = `The request does not signal a specific barrier. ${topEvidence ? 'Focus on the strongest evidence-backed concern: ' + topEvidence.title + '.' : 'Ask a relevant next question.'}`;
    reply = variant === 'trust-first'
      ? `${topEvidence?.key === 'shipping' ? 'I can show the verified delivery information for our products.' : topEvidence?.key === 'trust' ? 'I can clarify warranty and return coverage.' : 'I can help you decide using verified product details.'} Are you most concerned about comfort, reliability, or price?`
      : `Happy to help. Are you shopping for office focus, an everyday commute, or music at home? I’ll match one of our products to your needs.`;
  }
  return { reply, intent, strategy, reason, variant, product: { id: product.id, name: product.name, price: product.price }, action: suggestedAction, mode: 'rules-demo', evidenceUsed: ['greeting','explore'].includes(intent) && topEvidence ? {category:topEvidence.key, mentions:topEvidence.count, signal:topEvidence.title} : null };
}

export function validatePolicy(body, previous) {
  const value = body && typeof body === 'object' ? body : {};
  const bounded = (v, min, max, fallback) => Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Math.round(Number(v)))) : fallback;
  return {
    aiEnabled: typeof value.aiEnabled === 'boolean' ? value.aiEnabled : previous.aiEnabled,
    allowDiscounts: typeof value.allowDiscounts === 'boolean' ? value.allowDiscounts : previous.allowDiscounts,
    maxDiscountPercent: bounded(value.maxDiscountPercent, 0, 15, previous.maxDiscountPercent),
    minGrossMarginPercent: bounded(value.minGrossMarginPercent, 15, 60, previous.minGrossMarginPercent),
    humanApprovalRequired: true,
  };
}
