// Edge Function "midia-exercicios"
// Recebe nomes de exercícios (em português) e devolve, para cada um, o exercício equivalente do
// free-exercise-db (fotos de domínio público: posição inicial e final) e os músculos principais.
// A escolha é feita pelo Gemini uma única vez por nome e guardada em public.exercicio_midia.
// Segredos: GEMINI_API_KEY (obrigatório), GEMINI_MODEL (opcional)
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const normal = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const CATALOGO_URL = "https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/dist/exercises.json";

type Ex = { id: string; name: string; equipment: string | null; primaryMuscles: string[] };
let catalogo: Map<string, Ex> | null = null;
async function carregarCatalogo() {
  if (catalogo) return catalogo;
  const r = await fetch(CATALOGO_URL);
  if (!r.ok) throw new Error("catálogo indisponível");
  const xs: Ex[] = await r.json();
  catalogo = new Map(xs.filter((x) => x.id).map((x) => [x.id, x]));
  return catalogo;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "Use POST" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: u, error: ue } = await sb.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (ue || !u?.user) return json({ erro: "Faça login de novo." }, 401);
  const { data: ativa } = await sb.rpc("conta_ativa");
  if (ativa !== true) return json({ erro: "Seu acesso está suspenso ou vencido." }, 403);

  let body: { nomes?: string[] };
  try { body = await req.json(); } catch { return json({ erro: "Corpo inválido" }, 400); }
  const nomes = [...new Set((body.nomes ?? []).map((n) => String(n).trim().slice(0, 80)).filter(Boolean))].slice(0, 40);
  if (!nomes.length) return json({ ok: true, resultado: {} });

  const adm = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const porChave = new Map(nomes.map((n) => [normal(n), n]));
  const { data: salvos } = await adm.from("exercicio_midia").select("chave, ref, primarios").in("chave", [...porChave.keys()]);
  const resultado: Record<string, { ref: string | null; primarios: string[] }> = {};
  for (const s of salvos ?? []) resultado[porChave.get(s.chave)!] = { ref: s.ref, primarios: s.primarios ?? [] };
  const faltam = nomes.filter((n) => !(n in resultado));

  if (faltam.length) {
    const key = (Deno.env.get("GEMINI_API_KEY") ?? "").trim();
    if (!key) return json({ ok: true, resultado, aviso: "sem GEMINI_API_KEY" });
    let cat: Map<string, Ex>;
    try { cat = await carregarCatalogo(); } catch { return json({ ok: true, resultado, aviso: "catálogo indisponível" }); }
    const model = (Deno.env.get("GEMINI_MODEL_SIMPLES") || await modeloLite(key) || Deno.env.get("GEMINI_MODEL") || "gemini-3.8-flash").trim();
    const lista = [...cat.values()].map((x) => `${x.id} (${x.equipment ?? "-"})`).join("\n");
    const prompt = `Você recebe nomes de exercícios de academia em português (como aparecem em fichas brasileiras) e um catálogo em inglês no formato "id (equipamento)".
Para cada nome, escolha o id do catálogo que mostra o MESMO movimento. Prefira o mesmo equipamento (barra, halter, polia/cabo, máquina). Se nada for parecido, use null.
Responda SOMENTE com JSON: {"<nome exatamente como recebido>": "<id>" | null}

Nomes:
${faltam.map((n) => "- " + n).join("\n")}

Catálogo:
${lista}`;
    const pedir = (pensar: boolean) => gfetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0, ...(pensar ? { thinkingConfig: { thinkingLevel: "low" } } : {}) },
      }),
    });
    let r = await pedir(true);
    if (r.status === 400) { const t = await r.text(); r = /thinking/i.test(t) ? await pedir(false) : new Response(t, { status: 400 }); }
    if (r.ok) {
      const g = await r.json();
      const texto: string = g?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
      let escolha: Record<string, string | null> = {};
      try { escolha = JSON.parse(texto.replace(/^```(json)?/i, "").replace(/```$/, "").trim()); } catch { /* resposta inválida: tenta na próxima */ }
      const linhas = [];
      for (const n of faltam) {
        if (!(n in escolha)) continue;                    // sem resposta para este: não guarda, tenta de novo depois
        const id = escolha[n];
        const ex = id ? cat.get(id) : undefined;
        const item = { ref: ex ? ex.id : null, primarios: ex?.primaryMuscles ?? [] };
        resultado[n] = item;
        linhas.push({ chave: normal(n), nome: n, ref: item.ref, primarios: item.primarios });
      }
      if (linhas.length) await adm.from("exercicio_midia").upsert(linhas);
    } else {
      console.error(`Gemini ${r.status}: ${(await r.text()).slice(0, 500)}`);
    }
  }
  return json({ ok: true, resultado });
});

// Gemini sobrecarregado (500/503) costuma passar em segundos: tenta mais duas vezes antes de desistir.
// (429 = cota acabou; esperar não adianta, quem chama troca de modelo)
function gfetch(url: string, op: RequestInit) { return comRetentativa(() => fetch(url, op)); }
// Modelo "lite" mais novo da chave: tem cota grátis própria, separada do Flash.
let liteCache: string | null | undefined;
async function modeloLite(key: string): Promise<string | null> {
  if (liteCache !== undefined) return liteCache;
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": key } });
    const j = r.ok ? await r.json() : {};
    const nomes: string[] = (j.models ?? [])
      .filter((m: { supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m: { name: string }) => m.name.replace(/^models\//, ""))
      .filter((n: string) => /^gemini-\d+(\.\d+)?-flash-lite$/.test(n));
    const ver = (n: string) => Number(n.match(/^gemini-(\d+(?:\.\d+)?)/)![1]);
    nomes.sort((a, b) => ver(b) - ver(a));
    liteCache = nomes[0] ?? null;
  } catch { liteCache = null; }
  return liteCache;
}
async function comRetentativa(f: () => Promise<Response>) {
  let r = await f();
  for (const espera of [1500, 4000]) {
    if (![500, 503].includes(r.status)) break;
    await r.body?.cancel();
    console.warn(`Gemini ${r.status}: tentando de novo em ${espera} ms`);
    await new Promise((ok) => setTimeout(ok, espera));
    r = await f();
  }
  return r;
}
