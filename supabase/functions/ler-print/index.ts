// Edge Function "ler-print"
// Recebe 1 a 6 prints (base64) e devolve o treino ou a avaliação física em JSON.
// Usa a API gratuita do Gemini (Google AI Studio). Segredo necessário: GEMINI_API_KEY
// Opcional: GEMINI_MODEL (padrão gemini-3.8-flash; se sair do ar, usa sozinho o Flash mais novo)
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PROMPT_TREINO = `Você recebe imagens de uma ficha de treino de academia: pode ser print de um aplicativo (por exemplo o Fiti), foto de uma ficha de papel impressa ou escrita à mão, ou foto de um quadro/planilha.
Leia com atenção mesmo com letra à mão, foto torta ou pouca luz. Em fichas de papel, "3x12" significa 3 séries de 12 repetições, e "3x10-12" é 3 séries de 10 a 12.
Extraia os exercícios na ordem em que aparecem. Se houver mais de um print, junte tudo numa lista só, sem repetir exercícios.
Responda SOMENTE com JSON neste formato:
{"titulo": string|null, "exercicios": [{"nome": string, "series": number|null, "reps": string|null, "carga": number|null, "descanso_seg": number|null, "obs": string|null, "imagem": number, "miniatura": [ymin, xmin, ymax, xmax]|null}]}
Regras:
- "titulo": nome ou letra do treino se aparecer (ex.: "Treino B - Costas"), senão null.
- "nome": exatamente como está escrito, com acentos.
- "reps": texto, ex.: "12", "8-10", "falha". "carga" em kg (número). "descanso_seg" em segundos.
- Use null para o que não aparecer no print. Nunca invente valores.
- "imagem": índice (começando em 0) do print onde o exercício aparece.
- "miniatura": caixa da foto/miniatura do aparelho ao lado do exercício, em coordenadas de 0 a 1000 da imagem; null se não houver foto (quadrado vazio também é null). Em ficha de papel, sempre null.
- Se a imagem tiver vários treinos (A, B, C...) e não for dito qual ler, leia só o primeiro e coloque a letra no "titulo".`;

const PROMPT_AVALIACAO = `Você recebe prints de uma avaliação física de academia.
Responda SOMENTE com JSON neste formato:
{"data": "AAAA-MM-DD"|null, "peso": number|null, "gordura": number|null, "massa_magra": number|null, "imc": number|null, "medidas": {"<nome da medida>": number}}
Regras:
- "gordura" é o percentual de gordura (número, sem %). "peso" e "massa_magra" em kg.
- "medidas": circunferências em cm, com nomes em português como aparecem (ex.: "Braço direito", "Cintura", "Abdômen", "Coxa esquerda").
- Use null para o que não aparecer. Nunca invente valores.`;

// Lista os modelos da chave e escolhe o "gemini-X.Y-flash" de versão mais alta que gera conteúdo
async function flashMaisNovo(key: string): Promise<string | null> {
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": key } });
    if (!r.ok) return null;
    const j = await r.json();
    const nomes: string[] = (j.models ?? [])
      .filter((m: { supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m: { name: string }) => m.name.replace(/^models\//, ""))
      .filter((n: string) => /^gemini-\d+(\.\d+)?-flash$/.test(n));
    const ver = (n: string) => Number(n.match(/^gemini-(\d+(?:\.\d+)?)/)![1]);
    nomes.sort((a, b) => ver(b) - ver(a));
    return nomes[0] ?? null;
  } catch { return null; }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "Use POST" }, 405);

  // Só usuários logados no app podem usar
  const auth = req.headers.get("Authorization") ?? "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: u, error: ue } = await sb.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (ue || !u?.user) return json({ erro: "Faça login de novo." }, 401);

  // Conta bloqueada ou vencida não usa a leitura (economiza a cota do Gemini)
  const { data: ativa } = await sb.rpc("conta_ativa");
  if (ativa !== true) return json({ erro: "Seu acesso está suspenso ou vencido." }, 403);

  const key = (Deno.env.get("GEMINI_API_KEY") ?? "").trim();
  if (!key) return json({ erro: "Falta configurar o segredo GEMINI_API_KEY no Supabase." }, 500);
  let model = (Deno.env.get("GEMINI_MODEL") || "gemini-3.8-flash").trim();

  let body: { tipo?: string; qual?: string; imagens?: { mime: string; dados: string }[] };
  try { body = await req.json(); } catch { return json({ erro: "Corpo inválido" }, 400); }
  const imagens = (body.imagens ?? []).slice(0, 6);
  if (!imagens.length) return json({ erro: "Nenhuma imagem enviada" }, 400);
  const qual = String(body.qual ?? "").trim().slice(0, 20);
  const prompt = body.tipo === "avaliacao" ? PROMPT_AVALIACAO : PROMPT_TREINO + (qual ? `
Leia SOMENTE o treino "${qual}" (ignore os outros treinos da imagem).` : "");

  const parts: unknown[] = [{ text: prompt }];
  imagens.forEach((im, i) => {
    parts.push({ text: `Print ${i}:` });
    parts.push({ inline_data: { mime_type: im.mime || "image/jpeg", data: im.dados } });
  });

  // Ler uma ficha não precisa de raciocínio longo: pensar pouco deixa a resposta muito mais rápida.
  let pensarPouco = true;
  const pedir = (m: string) => gfetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseMimeType: "application/json", temperature: 0,
        ...(pensarPouco ? { thinkingConfig: { thinkingLevel: "low" } } : {}),
      },
    }),
  });
  const t0 = Date.now();
  let r = await pedir(model);
  // Modelo que não aceita o ajuste de raciocínio: tenta de novo sem ele
  if (r.status === 400) {
    const txt = await r.text();
    if (/thinking/i.test(txt)) { pensarPouco = false; r = await pedir(model); }
    else r = new Response(txt, { status: 400 });
  }
  // Modelo aposentado pelo Google: procura o Flash mais novo disponível e tenta de novo
  if (r.status === 404) {
    const novo = await flashMaisNovo(key);
    if (novo && novo !== model) {
      await r.body?.cancel();
      console.warn(`Modelo ${model} indisponível; usando ${novo}. Dica: crie o segredo GEMINI_MODEL=${novo}`);
      model = novo;
      r = await pedir(model);
    }
  }
  // Cota grátis do dia acabou neste modelo: tenta o Flash-Lite (cota separada)
  if (r.status === 429) {
    const lite = await modeloLite(key);
    if (lite && lite !== model) {
      await r.body?.cancel();
      console.warn(`Cota do ${model} acabou; usando ${lite}`);
      model = lite;
      r = await pedir(model);
      if (r.status === 400) { const txt = await r.text(); if (/thinking/i.test(txt)) { pensarPouco = false; r = await pedir(model); } else r = new Response(txt, { status: 400 }); }
    }
  }
  if (!r.ok) {
    const t = await r.text();
    console.error(`Gemini ${r.status} (modelo ${model}): ${t.slice(0, 800)}`);
    const msg = r.status === 429 ? "Acabou o limite de leituras de hoje. Tente amanhã ou monte a ficha à mão."
      : r.status === 503 ? "A leitura de prints está muito ocupada agora. Tente de novo em 1 minuto." : `Gemini respondeu ${r.status}`;
    return json({ erro: msg, detalhe: t.slice(0, 500) }, 502);
  }
  const g = await r.json();
  console.log(`Leitura ok: ${imagens.length} print(s), modelo ${model}, raciocínio ${pensarPouco ? "baixo" : "padrão"}, ${Date.now() - t0} ms`);
  const texto: string = g?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  try {
    const limpo = texto.replace(/^```(json)?/i, "").replace(/```$/, "").trim();
    return json({ ok: true, resultado: JSON.parse(limpo) });
  } catch {
    return json({ erro: "Não consegui entender o print. Tente um print mais nítido.", detalhe: texto.slice(0, 500) }, 422);
  }
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
