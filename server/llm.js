/* Optional natural-language rephrasing. All agent actions and policies remain deterministic. */
export async function polishReply(plan, product, customerMessage) {
  const key = process.env.OPENAI_API_KEY;
  if (!key || !plan || plan.action === 'add_to_cart' || plan.intent === 'discount') return plan;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6500);
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', signal: controller.signal,
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        temperature: 0.1, max_tokens: 165,
        messages: [
          { role: 'system', content: `You are a transparent, non-pushy AI shopping assistant. Rewrite the reference response in a warm, concise tone. You must NOT add facts, prices, discounts, policies, guarantees, delivery promises or persuasion unsupported by the reference. Only use these exact product facts: ${JSON.stringify(product)}. State that you are an AI if it matters. Don't claim the item has been purchased. Return plain text only, 1-3 sentences.` },
          { role: 'user', content: `Customer: ${String(customerMessage).slice(0, 500)}\nReference response: ${plan.reply}` },
        ],
      }),
    });
    clearTimeout(timer);
    if (!response.ok) return plan;
    const json = await response.json();
    const reply = json.choices?.[0]?.message?.content?.trim();
    if (!reply || reply.length > 650) return plan;
    // Never let model output trigger tools. Tool decisions are entirely separate.
    return { ...plan, reply, mode: 'llm-assisted' };
  } catch { return plan; }
}
