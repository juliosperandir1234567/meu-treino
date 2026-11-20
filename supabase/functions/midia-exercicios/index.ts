// Edge Function "midia-exercicios"
// Recebe nomes de exercícios (em português) e devolve, para cada um, o exercício equivalente do
// free-exercise-db (fotos de domínio público: posição inicial e final) e os músculos principais.
// 1º tenta a lista fixa de nomes de academia (sem IA, sem custo); só o que ela não conhece vai para o Gemini.
// O resultado fica guardado em public.exercicio_midia.
// Segredos: GEMINI_API_KEY (obrigatório para nomes fora da lista), GEMINI_MODEL / GEMINI_MODEL_SIMPLES (opcionais)
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

// Nomes de academia (português, sem acento) → foto do catálogo. Do mais específico para o mais geral.
const REGRAS: [RegExp, string][] = [
  [/extensora/, "Leg_Extensions"],
  [/mesa flexora|flexora.*deitad/, "Lying_Leg_Curls"],
  [/flexora.*em pe/, "Standing_Leg_Curl"],
  [/flexora/, "Seated_Leg_Curl"],
  [/abdutor/, "Thigh_Abductor"],
  [/adutor/, "Thigh_Adductor"],
  [/hack/, "Hack_Squat"],
  [/panturrilha.*sentad/, "Seated_Calf_Raise"],
  [/panturrilha.*leg/, "Calf_Press_On_The_Leg_Press_Machine"],
  [/panturrilha|gemeos/, "Standing_Calf_Raises"],
  [/leg ?press/, "Leg_Press"],
  [/glute press|gluteo.*maquina|coice|kickback/, "Glute_Kickback"],
  [/elevacao pelvica|hip thrust/, "Barbell_Hip_Thrust"],
  [/pec ?deck inverso|crucifixo inverso|voador inverso/, "Reverse_Machine_Flyes"],
  [/crucifixo.*(polia|cabo)|cross ?over/, "Cable_Crossover"],
  [/pec ?deck|peck deck|voador|\bfl[ae]y\b|crucifixo.*maquina/, "Butterfly"],
  [/crucifixo/, "Dumbbell_Flyes"],
  [/supino inclinado.*(articulad|maquina)/, "Leverage_Incline_Chest_Press"],
  [/supino declinado.*(articulad|maquina)/, "Leverage_Decline_Chest_Press"],
  [/supino.*(articulad|maquina)/, "Leverage_Chest_Press"],
  [/supino inclinado.*halter/, "Incline_Dumbbell_Press"],
  [/supino inclinado/, "Barbell_Incline_Bench_Press_-_Medium_Grip"],
  [/supino declinado/, "Decline_Barbell_Bench_Press"],
  [/supino.*halter/, "Dumbbell_Bench_Press"],
  [/supino/, "Barbell_Bench_Press_-_Medium_Grip"],
  [/desenvolvimento.*(maquina|articulad)/, "Machine_Shoulder_Military_Press"],
  [/desenvolvimento.*halter/, "Dumbbell_Shoulder_Press"],
  [/desenvolvimento/, "Barbell_Shoulder_Press"],
  [/elevacao lateral.*(maquina|polia|cabo)/, "Cable_Seated_Lateral_Raise"],
  [/elevacao lateral/, "Side_Lateral_Raise"],
  [/elevacao frontal/, "Front_Dumbbell_Raise"],
  [/triceps.*testa/, "EZ-Bar_Skullcrusher"],
  [/triceps.*frances.*(polia|cabo|corda)/, "Cable_Rope_Overhead_Triceps_Extension"],
  [/triceps.*frances/, "Standing_Dumbbell_Triceps_Extension"],
  [/triceps.*corda/, "Triceps_Pushdown_-_Rope_Attachment"],
  [/triceps.*(maquina|articulad)/, "Machine_Triceps_Extension"],
  [/triceps/, "Triceps_Pushdown"],
  [/mergulho|paralela/, "Dips_-_Triceps_Version"],
  [/puxada.*(neutra|triangulo)/, "V-Bar_Pulldown"],
  [/puxada.*(fechada|supinada)/, "Close-Grip_Front_Lat_Pulldown"],
  [/puxada|pulldown|pull down/, "Wide-Grip_Lat_Pulldown"],
  [/remada.*(articulad|maquina|convergente)/, "Leverage_Iso_Row"],
  [/remada baixa|remada sentad/, "Seated_Cable_Rows"],
  [/remada curvada.*(guiad|smith)/, "Smith_Machine_Bent_Over_Row"],
  [/remada curvada/, "Bent_Over_Barbell_Row"],
  [/remada unilateral|serrote/, "One-Arm_Dumbbell_Row"],
  [/remada alta/, "Upright_Barbell_Row"],
  [/face ?pull/, "Face_Pull"],
  [/rosca martelo.*(corda|polia)/, "Cable_Hammer_Curls_-_Rope_Attachment"],
  [/rosca martelo/, "Hammer_Curls"],
  [/rosca scott/, "Preacher_Curl"],
  [/rosca concentrada/, "Concentration_Curls"],
  [/rosca.*(polia|cabo)/, "Standing_Biceps_Cable_Curl"],
  [/rosca.*alternad/, "Dumbbell_Alternate_Bicep_Curl"],
  [/rosca.*\bw\b/, "EZ-Bar_Curl"],
  [/rosca/, "Barbell_Curl"],
  [/agachamento.*(smith|guiado)/, "Smith_Machine_Squat"],
  [/agachamento.*bulgaro/, "Split_Squat_with_Dumbbells"],
  [/agachamento.*sumo/, "Plie_Dumbbell_Squat"],
  [/agachamento|agacho/, "Barbell_Squat"],
  [/afundo|avanco|passada/, "Dumbbell_Lunges"],
  [/stiff/, "Stiff-Legged_Barbell_Deadlift"],
  [/levantamento terra|\bterra\b/, "Barbell_Deadlift"],
  [/encolhimento/, "Barbell_Shrug"],
  [/abdominal.*maquina/, "Ab_Crunch_Machine"],
  [/prancha/, "Plank"],
  [/abdominal.*infra|elevacao de pernas/, "Hanging_Leg_Raise"],
  [/abdominal/, "Crunches"],
];
function regraLocal(nome: string, cat: Map<string, Ex>): Ex | null {
  const n = normal(nome);
  for (const [re, id] of REGRAS) if (re.test(n) && cat.has(id)) return cat.get(id)!;
  return null;
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
  const semFoto: string[] = [];   // guardados antes como "sem foto": a lista fixa pode ter a resposta agora
  for (const s of salvos ?? []) {
    const n = porChave.get(s.chave)!;
    resultado[n] = { ref: s.ref, primarios: s.primarios ?? [] };
    if (!s.ref) semFoto.push(n);
  }
  const faltam = nomes.filter((n) => !(n in resultado));
  if (!faltam.length && !semFoto.length) return json({ ok: true, resultado });

  let cat: Map<string, Ex>;
  try { cat = await carregarCatalogo(); } catch { return json({ ok: true, resultado, aviso: "catálogo indisponível" }); }

  // 1) lista fixa (sem IA)
  const linhas: { chave: string; nome: string; ref: string | null; primarios: string[] }[] = [];
  const paraIA: string[] = [];
  for (const n of [...semFoto, ...faltam]) {
    const ex = regraLocal(n, cat);
    if (ex) {
      resultado[n] = { ref: ex.id, primarios: ex.primaryMuscles ?? [] };
      linhas.push({ chave: normal(n), nome: n, ref: ex.id, primarios: ex.primaryMuscles ?? [] });
    } else if (faltam.includes(n)) paraIA.push(n);   // "sem foto" antigo e fora da lista: não gasta IA de novo
  }

  // 2) o resto vai para o Gemini
  const key = (Deno.env.get("GEMINI_API_KEY") ?? "").trim();
  if (paraIA.length && key) {
    const model = (Deno.env.get("GEMINI_MODEL_SIMPLES") || await modeloLite(key) || Deno.env.get("GEMINI_MODEL") || "gemini-3.8-flash").trim();
    const lista = [...cat.values()].map((x) => `${x.id} (${x.equipment ?? "-"})`).join("\n");
    const prompt = `Você recebe nomes de exercícios de academia em português (como aparecem em fichas brasileiras) e um catálogo em inglês no formato "id (equipamento)".
Para cada nome, escolha o id do catálogo que mostra o MESMO movimento ou o mais parecido. Prefira o mesmo equipamento (barra, halter, polia/cabo, máquina).
Exemplos: "Cadeira extensora" → Leg_Extensions; "Puxada frontal" → Wide-Grip_Lat_Pulldown; "Supino reto" → Barbell_Bench_Press_-_Medium_Grip.
Use null só se o nome não for um exercício de musculação.
Responda SOMENTE com JSON: {"<nome exatamente como recebido>": "<id>" | null}

Nomes:
${paraIA.map((n) => "- " + n).join("\n")}

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
      for (const n of paraIA) {
        if (!(n in escolha)) continue;                    // sem resposta para este: não guarda, tenta de novo depois
        const id = escolha[n];
        const ex = id ? cat.get(id) : undefined;
        const item = { ref: ex ? ex.id : null, primarios: ex?.primaryMuscles ?? [] };
        resultado[n] = item;
        linhas.push({ chave: normal(n), nome: n, ref: item.ref, primarios: item.primarios });
      }
    } else {
      console.error(`Gemini ${r.status}: ${(await r.text()).slice(0, 500)}`);
    }
  }
  if (linhas.length) await adm.from("exercicio_midia").upsert(linhas);
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
