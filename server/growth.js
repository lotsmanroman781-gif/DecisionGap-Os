/** Explainable strategy proposals - suggested hypotheses, NOT claims of causality. */
import { randomUUID } from 'node:crypto';
const playbooks = {
  shipping: { name:'Show delivery clarity earlier', category:'Shipping uncertainty', strategy:'Clarity first', hypothesis:'Earlier shipping details may reduce unexpected checkout friction.', action:'Place accurate shipping timing and cost rules beside the product price.', metric:'Completed orders per eligible visitor', variant:'Early shipping information', guardrail:'Do not promise unsupported shipping dates.' },
  trust: { name:'Answer warranty objections', category:'Trust', strategy:'Evidence-first assistance', hypothesis:'Verified warranty and return information may reduce uncertainty.', action:'Display a factual warranty and returns FAQ near the buy action.',metric:'Completed orders and return rate',variant:'Verified warranty FAQ',guardrail:'Do not invent warranty coverage.' },
  comparison: { name:'Create a guided product comparison',category:'Choice difficulty',strategy:'Guided comparison',hypothesis:'A concise comparison may help undecided buyers choose.',action:'Offer an opt-in comparison of price, usage, and verified features.',metric:'Conversion among shoppers opening comparison',variant:'Comparison assistant',guardrail:'Never invent product performance.' },
  price: {name:'Clarify total price and value', category:'Price',strategy:'Transparent value',hypothesis:'Understanding total cost and tradeoffs may matter more than a discount.',action:'Explain actual price, delivery/tax treatment and alternatives.',metric:'Margin-adjusted conversion',variant:'Clear price summary',guardrail:'No unapproved discounts.'},
  checkout: {name:'Simplify the checkout handoff',category:'Checkout friction',strategy:'Fast handoff',hypothesis:'A simpler, clearly labeled checkout step may lower dropout.',action:'Explain the next step and link directly to authorized checkout.',metric:'Checkout-start-to-purchase rate',variant:'Simplified checkout',guardrail:'Never collect payment details in chat.'},
};
export function proposePlaybooks(insights = []) {
  return insights.filter(x=>playbooks[x.key] && x.count > 0).slice(0,5).map(x=>({
    ...playbooks[x.key],categoryKey:x.key, evidenceCount:x.count||0,
    id:`playbook-${x.key}`, source:'Customer feedback themes (hypotheses, not proven causes)',
  }));
}
export function newExperiment(input, proposals) {
  const p=proposals.find(x=>x.id === input.playbookId);
  if(!p)throw Object.assign(new Error('Select a supported playbook.'),{status:400});
  return {id:randomUUID(), playbookId:p.id,name:p.name,hypothesis:p.hypothesis,variant:p.variant,
    primaryMetric:p.metric, guardrail:p.guardrail,status:'draft',createdAt:new Date().toISOString(),approvedAt:null};
}
export function sanitizedExperiment(exp) { return {...exp, evidenceNotice:'No causal lift claimed. Run randomized trials with enough data before concluding.'}; }
