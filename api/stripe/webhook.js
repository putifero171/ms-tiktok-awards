const crypto = require('crypto');

function verifyStripeSignature(rawBody, header, secret) {
  if (!header || !secret) return false;
  const parts = header.split(',').map(part => part.trim().split('='));
  const timestamp = parts.find(part => part[0] === 't');
  const signatures = parts.filter(part => part[0] === 'v1').map(part => part[1]);
  if (!timestamp || !signatures.length) return false;
  const time = Number(timestamp[1]);
  if (!Number.isFinite(time) || Math.abs(Date.now() / 1000 - time) > 300) return false;
  const expected = crypto.createHmac('sha256', secret).update(timestamp[1] + '.' + rawBody, 'utf8').digest();
  return signatures.some(signature => {
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
    const supplied = Buffer.from(signature, 'hex');
    return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed.');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!webhookSecret || !supabaseUrl || !serviceKey) return res.status(503).send('Webhook is not configured.');

  try {
    const rawBody = typeof req.body === 'string' ? req.body : (Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '');
    if (!rawBody) return res.status(400).send('Raw Stripe request body is required.');
    if (!verifyStripeSignature(rawBody, req.headers['stripe-signature'], webhookSecret)) {
      return res.status(400).send('Invalid Stripe signature.');
    }

    const event = JSON.parse(rawBody);
    if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
      return res.status(200).json({ received: true, ignored: true });
    }
    const session = event.data && event.data.object;
    if (!session || session.mode !== 'payment' || session.payment_status !== 'paid') {
      return res.status(200).json({ received: true, ignored: true });
    }

    const meta = session.metadata || {};
    const quantity = Number(meta.quantity);
    const amountCents = quantity === 10 ? 800 : quantity * 100;
    const paymentIntentId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent && session.payment_intent.id;
    if (!session.id || !paymentIntentId || !meta.category_id || !meta.nominee_id ||
        !Number.isInteger(quantity) || quantity < 1 || quantity > 1000 ||
        session.currency !== 'eur' || session.amount_total !== amountCents ||
        !meta.voter_email || !meta.category_title || !meta.nominee_name) {
      console.error('Stripe session failed vote validation:', session && session.id);
      return res.status(400).send('Paid session does not match a valid vote.');
    }

    const payload = {
      category_id: meta.category_id,
      nominee_id: meta.nominee_id,
      quantity,
      payment_method: 'stripe',
      currency: 'EUR',
      amount: amountCents / 100,
      payment_reference: meta.payment_reference || ('Voto X ' + meta.category_title + ' X ' + meta.nominee_name + ' X ' + quantity + ' votos'),
      transaction_reference: paymentIntentId,
      voter_email: meta.voter_email,
      proof_path: null,
      status: 'approved',
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId
    };

    const response = await fetch(supabaseUrl.replace(/\/$/, '') + '/rest/v1/vote_submissions?on_conflict=stripe_checkout_session_id', {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: 'Bearer ' + serviceKey,
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates,return=minimal'
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const details = await response.text();
      console.error('Could not record Stripe payment in Supabase:', details);
      return res.status(500).send('Could not record the confirmed payment.');
    }
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Stripe webhook error:', error);
    return res.status(500).send('Webhook processing failed.');
  }
};
