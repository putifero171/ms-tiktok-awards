// Supabase Edge Function: username-signup
// Public registration endpoint. Deploy with JWT verification disabled.
// Uses Supabase Auth email confirmation and stores the unique username in user metadata.
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
    const { username, email, password } = await req.json();
    const cleanUsername = String(username ?? "").trim();
    const normalized = cleanUsername.toLowerCase();
    const cleanEmail = String(email ?? "").trim().toLowerCase();

    if (!/^[a-z0-9._-]{3,24}$/.test(normalized)) {
      return json({ error: "O username deve ter 3 a 24 caracteres: letras, números, ponto, hífen ou underscore." }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return json({ error: "Introduz um endereço de email válido." }, 400);
    }
    if (typeof password !== "string" || password.length < 8) {
      return json({ error: "A palavra-passe deve ter pelo menos 8 caracteres." }, 400);
    }

    const url = Deno.env.get("PROJECT_URL")!;
    const publicKey = Deno.env.get("PUBLIC_KEY")!;
    if (!url || !publicKey) return json({ error: "A configuração de autenticação está incompleta." }, 500);

    const authClient = createClient(url, publicKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await authClient.auth.signUp({
      email: cleanEmail,
      password,
      options: { data: { username: cleanUsername } },
    });

    if (error) {
      const message = error.message.toLowerCase().includes("duplicate key") || error.message.toLowerCase().includes("unique")
        ? "Este username já está a ser utilizado."
        : error.message;
      return json({ error: message }, 400);
    }

    return json({
      message: "Conta criada. Confirma o email através do link que enviámos antes de iniciar sessão.",
      needs_email_confirmation: !data.session,
    }, 200);
  } catch {
    return json({ error: "Pedido inválido." }, 400);
  }
});
