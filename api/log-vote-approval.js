export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const supabaseUrl = process.env.SUPABASE_URL || 'https://bzsdqndpemtwmftwrhjz.supabase.co';
  const anonKey = process.env.SUPABASE_ANON_KEY || 'sb_publishable_M_UFasP0lYatLFUtz9JgCg_BZ9FrxeN';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return res.status(503).json({ error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY na Vercel.' });
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Sessão não autenticada.' });
  const { submission_id } = req.body || {};
  if (!submission_id || !/^[0-9a-f-]{36}$/i.test(submission_id)) return res.status(400).json({ error: 'ID de submissão inválido.' });

  const headers = { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json' };
  try {
    const auth = await fetch(supabaseUrl + '/auth/v1/user', { headers: { apikey: anonKey, Authorization: 'Bearer ' + token } });
    if (!auth.ok) return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
    const user = await auth.json();

    const profileRes = await fetch(supabaseUrl + '/rest/v1/profiles?id=eq.' + encodeURIComponent(user.id) + '&select=role', { headers });
    if (!profileRes.ok) throw new Error('Não foi possível validar as permissões.');
    const profiles = await profileRes.json();
    if (!profiles.some(p => ['super_admin', 'admin', 'vote_approver'].includes(p.role))) return res.status(403).json({ error: 'Sem permissões para registar aprovações.' });

    const submissionRes = await fetch(supabaseUrl + '/rest/v1/vote_submissions?id=eq.' + encodeURIComponent(submission_id) + '&select=id,status', { headers });
    if (!submissionRes.ok) throw new Error('Não foi possível confirmar a submissão.');
    const submissions = await submissionRes.json();
    if (!submissions.length || submissions[0].status !== 'approved') return res.status(409).json({ error: 'A submissão ainda não está aprovada.' });

    const forwarded = req.headers['x-forwarded-for'];
    const chain = typeof forwarded === 'string' ? forwarded.split(',').map(value => value.trim()).filter(Boolean) : [];
    const ip = req.headers['x-real-ip'] || chain[chain.length - 1] || req.socket?.remoteAddress || null;
    if (!ip) throw new Error('Não foi possível obter o IP público do pedido.');

    let geo = {};
    try {
      const geoRes = await fetch('https://ipapi.co/' + encodeURIComponent(ip) + '/json/', { signal: AbortSignal.timeout(3500) });
      if (geoRes.ok) {
        const g = await geoRes.json();
        if (!g.error) geo = { city: g.city || null, region: g.region || null, country: g.country_name || g.country || null };
      }
    } catch (e) { /* IP is still recorded when approximate geolocation is unavailable. */ }

    const insertRes = await fetch(supabaseUrl + '/rest/v1/vote_approval_audit?on_conflict=submission_id', {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        submission_id, approved_by: user.id, ip_address: ip,
        city: geo.city || null, region: geo.region || null, country: geo.country || null,
        user_agent: req.headers['user-agent'] || null
      })
    });
    if (!insertRes.ok) {
      const detail = await insertRes.text();
      throw new Error('Falha ao guardar registo de aprovação: ' + detail.slice(0, 300));
    }
    return res.status(200).json({ ok: true, ip_address: ip, location: [geo.city, geo.region, geo.country].filter(Boolean).join(', ') || null });
  } catch (error) {
    console.error('Vote approval IP audit failed:', error);
    return res.status(500).json({ error: error.message || 'Erro interno.' });
  }
}
