// Supabase Edge Function: username-login
// Deploy: supabase functions deploy username-login
// Required function secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { username, password } = await req.json();
    const normalized = String(username ?? "").trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,24}$/.test(normalized) || typeof password !== "string" || password.length < 8) {
      return json({ error: "Username ou palavra-passe inválidos." }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: record, error: lookupError } = await admin
      .from("awards_usernames")
      .select("user_id")
      .eq("username_normalized", normalized)
      .maybeSingle();

    if (lookupError || !record) return json({ error: "Credenciais inválidas." }, 401);

    const { data: userData, error: userError } = await admin.auth.admin.getUserById(record.user_id);
    const email = userData?.user?.email;
    if (userError || !email) return json({ error: "Não foi possível iniciar sessão." }, 401);

    const authClient = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await authClient.auth.signInWithPassword({ email, password });
    if (error || !data.session) return json({ error: "Credenciais inválidas." }, 401);

    return json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      token_type: data.session.token_type,
      expires_in: data.session.expires_in,
    });
  } catch {
    return json({ error: "Pedido inválido." }, 400);
  }
});
