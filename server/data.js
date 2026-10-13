const products = [
  {
    id: 'nova-pro', name: 'Nova Pro Headphones', subtitle: 'Focus without the noise', category: 'Headphones',
    price: 149, compareAt: 179, cost: 84, inventory: 76, icon: 'headphones', color: 'violet',
    tags: ['office', 'work', 'focus', 'noise cancellation', 'travel'],
    description: 'Over-ear wireless headphones with active noise cancellation and a comfortable fit for long listening sessions.',
    features: ['Active noise cancellation', 'Up to 30-hour battery life', 'Bluetooth 5.3', 'USB-C charging'],
    shipping: 'Standard shipping: 3–5 business days. Shipping costs are shown before checkout.',
    warranty: 'One-year limited manufacturer warranty.',
    returns: 'Returns accepted within 30 days of delivery if the product meets the return policy conditions.',
  },
  {
    id: 'pulse-buds', name: 'Pulse Wireless Earbuds', subtitle: 'Sound that moves with you', category: 'Earbuds',
    price: 89, compareAt: 109, cost: 46, inventory: 93, icon: 'earbuds', color: 'peach',
    tags: ['commute', 'running', 'travel', 'portable', 'earbuds'],
    description: 'Compact wireless earbuds made for everyday movement with a pocket-friendly charging case.',
    features: ['Up to 24 hours with charging case', 'IPX4 splash resistance', 'Bluetooth 5.3', 'USB-C charging case'],
    shipping: 'Standard shipping: 3–5 business days. Shipping costs are shown before checkout.',
    warranty: 'One-year limited manufacturer warranty.',
    returns: 'Returns accepted within 30 days of delivery if the product meets the return policy conditions.',
  },
  {
    id: 'orbit-speaker', name: 'Orbit Bluetooth Speaker', subtitle: 'Fill the room with music', category: 'Speakers',
    price: 119, compareAt: 139, cost: 65, inventory: 51, icon: 'speaker', color: 'mint',
    tags: ['home', 'speaker', 'room', 'music', 'portable'],
    description: 'A portable Bluetooth speaker for listening at home or bringing music outdoors.',
    features: ['Up to 18-hour battery life', 'IPX5 water resistance', 'Bluetooth 5.3', 'USB-C charging'],
    shipping: 'Standard shipping: 3–5 business days. Shipping costs are shown before checkout.',
    warranty: 'One-year limited manufacturer warranty.',
    returns: 'Returns accepted within 30 days of delivery if the product meets the return policy conditions.',
  },
];

const feedbackRows = [
  ['I only found the shipping fee right before checkout.', 'shipping'],
  ['How much does shipping cost? I cannot tell until the final step.', 'shipping'],
  ['I left because I was not sure when it would arrive.', 'shipping'],
  ['Delivery times should be easier to find on the product page.', 'shipping'],
  ['The delivery estimate showed up too late in checkout.', 'shipping'],
  ['I worry about what happens if the headphones stop working.', 'trust'],
  ['Is the one-year warranty included in this price?', 'trust'],
  ['I want to see the return rules before I pay.', 'trust'],
  ['I could not tell if warranty service is available.', 'trust'],
  ['Can I trust the battery-life claim?', 'trust'],
  ['Would appreciate more details about what the warranty covers.', 'trust'],
  ['Which headphone model is best for my home office?', 'comparison'],
  ['I need help comparing the headphones with the earbuds.', 'comparison'],
  ['There are several options and I am not sure which to choose.', 'comparison'],
  ['Does this work better for commuting or working?', 'comparison'],
  ['The total price is a little outside my budget.', 'price'],
  ['Would a cheaper model be good enough?', 'price'],
  ['I was looking for a promo code, but could not find one.', 'price'],
  ['I had trouble understanding the last checkout step.', 'checkout'],
  ['The payment screen felt confusing.', 'checkout'],
  ['The page did not clearly indicate where to confirm an order.', 'checkout'],
  ['Loved how clear the product comparison was.', 'positive'],
  ['The sound quality matched my expectations.', 'positive'],
];

function seededRandom(seed = 9012) {
  return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
}

export function variantForSession(sessionId) {
  let h = 2166136261;
  for (const c of String(sessionId)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 2 === 0 ? 'trust-first' : 'value-first';
}

export function initialState() {
  const now = Date.now();
  const random = seededRandom();
  const events = [];
  for (let day = 6; day >= 0; day -= 1) {
    const total = [128, 154, 142, 178, 163, 191, 205][6 - day];
    const timestamp = new Date(now - day * 86400000).toISOString();
    for (let n = 0; n < total; n += 1) {
      const sessionId = `seed-${day}-${n}`;
      const variant = variantForSession(sessionId);
      const productId = products[Math.floor(random() * products.length)].id;
      events.push({ type: 'visit', sessionId, variant, productId, timestamp, seed: true });
      if (random() < 0.22) events.push({ type: 'chat_open', sessionId, variant, productId, timestamp, seed: true });
      if (random() < 0.17) {
        events.push({ type: 'add_to_cart', sessionId, variant, productId, timestamp, seed: true });
        if (random() < (variant === 'trust-first' ? 0.29 : 0.23)) {
          const p = products.find(x => x.id === productId);
          events.push({ type: 'order', sessionId, variant, productId, amount: p.price, timestamp, seed: true });
        }
      }
    }
  }
  return {
    demo: true,
    merchant: {
      name: 'Northstar Audio', owner: 'Demo workspace', industry: 'Consumer electronics',
      policy: { aiEnabled: true, allowDiscounts: true, maxDiscountPercent: 10, minGrossMarginPercent: 25, humanApprovalRequired: true },
    },
    products,
    feedback: feedbackRows.map(([text, category], index) => ({ id: `feedback-${index + 1}`, text, category, timestamp: new Date(now - (index % 6) * 86400000).toISOString(), seed: true })),
    events, orders: [],
    decisions: [
      { id: 'sample-decision-1', title: 'Warranty clarity identified', detail: 'Multiple sample comments ask what the warranty covers.', strategy: 'Trust reassurance', timestamp: new Date(now - 1800000).toISOString(), seed: true },
      { id: 'sample-decision-2', title: 'Shipping friction identified', detail: 'Sample feedback suggests delivery costs are revealed too late.', strategy: 'Clarify shipping', timestamp: new Date(now - 7200000).toISOString(), seed: true },
      { id: 'sample-decision-3', title: 'Product comparison opportunity', detail: 'Shoppers ask for help choosing headphones versus earbuds.', strategy: 'Guided comparison', timestamp: new Date(now - 86400000).toISOString(), seed: true },
    ],
  };
}
