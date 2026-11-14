const BASE_URL = 'https://ms-tiktok-awards.vercel.app';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!stripeKey || !supabaseUrl || !serviceKey) {
    return res.status(503).json({ error: 'O pagamento Stripe ainda não está configurado no servidor.' });
  }

  try {
    const { categoryId, nomineeId, quantity, email } = req.body || {};
    const votes = Number(quantity);
    if (!categoryId || !nomineeId || !Number.isInteger(votes) || votes < 1 || votes > 1000) {
      return res.status(400).json({ error: 'Dados de votação inválidos.' });
    }
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return res.status(400).json({ error: 'Introduz um email válido.' });
    }

    const headers = { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey };
    const nomineeUrl = new URL('/rest/v1/nominees', supabaseUrl);
    nomineeUrl.search = new URLSearchParams({ id: 'eq.' + nomineeId, category_id: 'eq.' + categoryId, is_active: 'eq.true', select: 'id,category_id,name' }).toString();
    const nomineeResponse = await fetch(nomineeUrl, { headers });
    if (!nomineeResponse.ok) throw new Error('Não foi possível validar o nomeado.');
    const nominees = await nomineeResponse.json();
    if (!nominees.length) return res.status(400).json({ error: 'Este nomeado já não está disponível para votação.' });

    const categoryUrl = new URL('/rest/v1/categories', supabaseUrl);
    categoryUrl.search = new URLSearchParams({ id: 'eq.' + categoryId, is_active: 'eq.true', select: 'id,title' }).toString();
    const categoryResponse = await fetch(categoryUrl, { headers });
    if (!categoryResponse.ok) throw new Error('Não foi possível validar a categoria.');
    const categories = await categoryResponse.json();
    if (!categories.length) return res.status(400).json({ error: 'Esta categoria já não está disponível.' });

    const nominee = nominees[0];
    const category = categories[0];
    const amountCents = (votes === 10 ? 800 : votes * 100);
    const reference = 'Voto X ' + category.title + ' X ' + nominee.name + ' X ' + votes + ' votos';
    const form = new URLSearchParams();
    form.set('mode', 'payment');
    form.set('success_url', BASE_URL + '/?payment=success&session_id={CHECKOUT_SESSION_ID}');
    form.set('cancel_url', BASE_URL + '/?payment=cancel');
    form.set('customer_email', email);
    form.set('client_reference_id', nominee.id);
    form.set('payment_method_types[0]', 'card');
    form.set('line_items[0][price_data][currency]', 'eur');
    form.set('line_items[0][price_data][unit_amount]', String(amountCents));
    form.set('line_items[0][price_data][product_data][name]', votes + ' voto(s) — ' + nominee.name);
    form.set('line_items[0][price_data][product_data][description]', reference);
    form.set('line_items[0][quantity]', '1');
    form.set('metadata[category_id]', category.id);
    form.set('metadata[category_title]', category.title);
    form.set('metadata[nominee_id]', nominee.id);
    form.set('metadata[nominee_name]', nominee.name);
    form.set('metadata[quantity]', String(votes));
    form.set('metadata[voter_email]', email);
    form.set('metadata[payment_reference]', reference);
    form.set('payment_intent_data[metadata][category_id]', category.id);
    form.set('payment_intent_data[metadata][nominee_id]', nominee.id);
    form.set('payment_intent_data[metadata][quantity]', String(votes));

    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + stripeKey, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form
    });
    const session = await stripeResponse.json();
    if (!stripeResponse.ok) {
      console.error('Stripe Checkout creation failed:', session.error && session.error.message);
      return res.status(502).json({ error: 'O Stripe não conseguiu iniciar o pagamento. Tenta novamente.' });
    }
    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Stripe checkout endpoint error:', error);
    return res.status(500).json({ error: error.message || 'Erro interno ao iniciar o pagamento.' });
  }
};
