// Edge Function "admin": painel de clientes. Só quem tem papel 'admin' em public.perfis pode usar.
// Ações: listar, criar, atualizar, senha, apagar.
// Não lê treinos de ninguém: só contas e acesso.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const dataOk = (v: unknown) => v === null || (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "Use POST" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const adm = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // 1) quem está chamando?
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u, error: ue } = await adm.auth.getUser(token);
  if (ue || !u?.user) return json({ erro: "Faça login de novo." }, 401);
  const { data: eu } = await adm.from("perfis").select("papel, ativo").eq("id", u.user.id).maybeSingle();
  if (!eu || eu.papel !== "admin" || !eu.ativo) return json({ erro: "Só o administrador pode fazer isso." }, 403);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ erro: "Corpo inválido" }, 400); }
  const acao = String(b.acao ?? "");
  const id = typeof b.id === "string" ? b.id : "";

  // não deixa o admin se trancar para fora
  if (["atualizar", "apagar"].includes(acao) && id === u.user.id) {
    if (acao === "apagar" || b.ativo === false) return json({ erro: "Você não pode bloquear ou apagar a sua própria conta." }, 400);
  }

  try {
    switch (acao) {
      case "listar": {
        const { data: perfis, error } = await adm.from("perfis").select("*").order("criado_em", { ascending: false });
        if (error) throw error;
        const ultimos: Record<string, string | null> = {};
        for (let page = 1; page < 50; page++) {
          const { data, error: e2 } = await adm.auth.admin.listUsers({ page, perPage: 1000 });
          if (e2) throw e2;
          data.users.forEach((x) => { ultimos[x.id] = x.last_sign_in_at ?? null; });
          if (data.users.length < 1000) break;
        }
        return json({ ok: true, clientes: perfis.map((p) => ({ ...p, ultimo_acesso: ultimos[p.id] ?? null })) });
      }
      case "criar": {
        const email = String(b.email ?? "").trim().toLowerCase();
        const senha = String(b.senha ?? "");
        const nome = String(b.nome ?? "").trim();
        const acesso_ate = b.acesso_ate ?? null;
        if (!/^\S+@\S+\.\S+$/.test(email)) return json({ erro: "E-mail inválido." }, 400);
        if (senha.length < 6) return json({ erro: "A senha precisa ter pelo menos 6 caracteres." }, 400);
        if (!dataOk(acesso_ate)) return json({ erro: "Data inválida." }, 400);
        const { data: c, error } = await adm.auth.admin.createUser({
          email, password: senha, email_confirm: true, user_metadata: { nome },
        });
        if (error) {
          if (/already|registered|exists/i.test(error.message)) return json({ erro: "Já existe uma conta com esse e-mail." }, 409);
          throw error;
        }
        const { error: e2 } = await adm.from("perfis").upsert({ id: c.user.id, email, nome, papel: "cliente", ativo: true, acesso_ate });
        if (e2) throw e2;
        return json({ ok: true, id: c.user.id });
      }
      case "atualizar": {
        if (!id) return json({ erro: "Falta o cliente." }, 400);
        const upd: Record<string, unknown> = {};
        if (typeof b.nome === "string") upd.nome = b.nome.trim();
        if (typeof b.ativo === "boolean") upd.ativo = b.ativo;
        if ("acesso_ate" in b) { if (!dataOk(b.acesso_ate)) return json({ erro: "Data inválida." }, 400); upd.acesso_ate = b.acesso_ate; }
        if (!Object.keys(upd).length) return json({ erro: "Nada para alterar." }, 400);
        const { error } = await adm.from("perfis").update(upd).eq("id", id);
        if (error) throw error;
        // bloqueado: as regras do banco já cortam o acesso aos dados na hora
        return json({ ok: true });
      }
      case "senha": {
        const senha = String(b.senha ?? "");
        if (!id) return json({ erro: "Falta o cliente." }, 400);
        if (senha.length < 6) return json({ erro: "A senha precisa ter pelo menos 6 caracteres." }, 400);
        const { error } = await adm.auth.admin.updateUserById(id, { password: senha });
        if (error) throw error;
        return json({ ok: true });
      }
      case "apagar": {
        if (!id) return json({ erro: "Falta o cliente." }, 400);
        // apaga as fotos dele e depois a conta (os dados saem junto, em cascata)
        for (const pasta of ["equipamentos", "treinos", "prints"]) {
          const { data: arqs } = await adm.storage.from("fotos").list(`${id}/${pasta}`, { limit: 1000 });
          if (arqs?.length) await adm.storage.from("fotos").remove(arqs.map((a) => `${id}/${pasta}/${a.name}`));
        }
        const { error } = await adm.auth.admin.deleteUser(id);
        if (error) throw error;
        return json({ ok: true });
      }
      default:
        return json({ erro: "Ação desconhecida." }, 400);
    }
  } catch (e) {
    return json({ erro: (e as Error)?.message || "Erro no servidor" }, 500);
  }
});
