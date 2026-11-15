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

    const url = Deno.env.get("PROJECT_URL");
    const anonKey = Deno.env.get("PUBLIC_KEY");
    const serviceKey = Deno.env.get("SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) {
      console.error("[username-login] Missing required secrets", {
        PROJECT_URL: !!url, PUBLIC_KEY: !!anonKey, SERVICE_ROLE_KEY: !!serviceKey,
      });
      return json({ error: "Serviço de autenticação mal configurado." }, 500);
    }

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: record, error: lookupError } = await admin
      .from("awards_usernames")
      .select("user_id")
      .eq("username_normalized", normalized)
      .maybeSingle();

    if (lookupError) {
      console.error("[username-login] Username lookup failed:", lookupError.message, lookupError.code);
      return json({ error: "Não foi possível consultar o username. Tenta novamente." }, 500);
    }
    if (!record) {
      console.warn("[username-login] Username not found:", normalized);
      return json({ error: "Credenciais inválidas." }, 401);
    }

    const { data: userData, error: userError } = await admin.auth.admin.getUserById(record.user_id);
    const email = userData?.user?.email;
    if (userError || !email) {
      console.error("[username-login] Auth user lookup failed:", userError?.message || "Email missing", userError?.code);
      return json({ error: "Não foi possível localizar a conta de autenticação." }, 500);
    }

    const authClient = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await authClient.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      console.warn("[username-login] Password sign-in rejected:", error?.message || "No session returned", error?.code);
      return json({ error: "Credenciais inválidas." }, 401);
    }

    return json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      token_type: data.session.token_type,
      expires_in: data.session.expires_in,
    });
  } catch (error) {
    console.error("[username-login] Unexpected error:", error instanceof Error ? error.message : String(error));
    return json({ error: "Pedido inválido." }, 400);
  }
});
