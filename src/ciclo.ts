// Cycle OBSERVE → MEASURE → LEARN → PROPOSE. It never runs external actions: it proposes and waits for your approval.
import type { SupabaseClient } from "@supabase/supabase-js";
import { NEGOCIO, METRICAS } from "./maxi.config.ts";
import { DIAS_CADUCA, DIAS_MEDIR, hashAccion, parsePropuesta, promptMaxi, puedeEjecutar, toca, veredicto, type Accion } from "./nucleo.ts";

/** Calls any OpenAI-compatible API (Groq, OpenRouter, Ollama, OpenAI…). Variables: LLM_BASE_URL, LLM_API_KEY, LLM_MODEL. */
export async function llm(system: string, user: string): Promise<string | null> {
  const base = process.env.LLM_BASE_URL, key = process.env.LLM_API_KEY, model = process.env.LLM_MODEL;
  if (!base || !model) return null;
  try {
    const r = await fetch(base.replace(/\/$/, "") + "/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify({ model, max_tokens: 700, messages: [{ role: "system", content: system }, { role: "user", content: user }] }) });
    const j: any = await r.json();
    return j?.choices?.[0]?.message?.content ?? null;
  } catch { return null; }
}

export async function observar(sb: SupabaseClient): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {};
  for (const m of METRICAS) {
    try {
      let q: any = sb.from(m.tabla).select("*", { count: "exact", head: true });
      if (m.filtro) q = q.gte(m.filtro.columna, new Date(Date.now() - m.filtro.ultimosDias * 86400000).toISOString());
      const { count, error } = await q; out[m.id] = error ? null : (count ?? 0);
    } catch { out[m.id] = null; }
  }
  return out;
}

export async function correrMaxi(sb: SupabaseClient, via: "cron" | "manual") {
  const ids = METRICAS.map((m) => m.id);
  const obs = await observar(sb);
  const { data: ciclo } = await sb.from("maxi_ciclos").insert({ via, observacion: obs, estado: "en_curso" }).select("id").maybeSingle();
  if (!ciclo?.id) return { ok: false as const, status: 500, error: "Could not record the cycle. Did you run supabase/maxi.sql?" };
  const out = { medidas: 0, caducadas: 0, propuesta: null as string | null, aviso: "" };

  const { data: ejec } = await sb.from("maxi_decisiones").select("id,titulo,metrica,base,objetivo,ejecutada_at").eq("estado", "ejecutada").limit(20);
  for (const d of ejec || []) {
    if (!d.ejecutada_at || !toca(d.ejecutada_at, DIAS_MEDIR)) continue;
    const despues = obs[d.metrica] ?? null;
    const v = veredicto(d.base ?? null, despues, Number(d.objetivo));
    await sb.from("maxi_resultados").insert({ decision_id: d.id, metrica: d.metrica, antes: d.base, despues, veredicto: v });
    await sb.from("maxi_decisiones").update({ estado: "medida" }).eq("id", d.id).eq("estado", "ejecutada");
    await sb.from("maxi_memoria").insert({ tipo: v === "sin_datos" ? "hipotesis" : "hecho", fuente: `decision:${d.id}`, confianza: v === "sin_datos" ? 0 : 0.5, texto: `"${d.titulo}": ${d.metrica} went from ${d.base ?? "?"} to ${despues ?? "?"} (${v}). Observed correlation, not proven cause.` });
    out.medidas++;
  }
  const { data: pend } = await sb.from("maxi_decisiones").select("id,created_at").eq("estado", "propuesta");
  for (const p of pend || []) if (toca(p.created_at, DIAS_CADUCA)) { await sb.from("maxi_decisiones").update({ estado: "caducada" }).eq("id", p.id).eq("estado", "propuesta"); out.caducadas++; }

  const { count: abiertas } = await sb.from("maxi_decisiones").select("id", { count: "exact", head: true }).eq("estado", "propuesta");
  const hoy = new Date().toISOString().slice(0, 10) + "T00:00:00Z";
  const { count: hoyN } = await sb.from("maxi_decisiones").select("id", { count: "exact", head: true }).gte("created_at", hoy);
  if ((abiertas || 0) === 0 && (hoyN || 0) === 0) {
    const { data: mem } = await sb.from("maxi_memoria").select("tipo,texto").order("created_at", { ascending: false }).limit(15);
    const { data: res } = await sb.from("maxi_resultados").select("metrica,antes,despues,veredicto").order("at", { ascending: false }).limit(5);
    const p = promptMaxi(NEGOCIO, ids, obs, (mem || []).map((m: any) => `[${m.tipo}] ${m.texto}`), (res || []).map((r: any) => `${r.metrica}: ${r.antes}→${r.despues} (${r.veredicto})`));
    const prop = parsePropuesta(await llm(p.sistema, p.usuario), ids);
    if (prop) {
      const { data: nueva } = await sb.from("maxi_decisiones").insert({ ciclo_id: ciclo.id, titulo: prop.titulo, razon: prop.razon, accion: prop.accion, accion_hash: hashAccion(prop.accion), metrica: prop.metrica, base: obs[prop.metrica], objetivo: prop.objetivo, estado: "propuesta" }).select("id").maybeSingle();
      out.propuesta = nueva?.id ?? null;
    } else out.aviso = "No valid proposal (did you set LLM_BASE_URL and LLM_MODEL?).";
  }
  await sb.from("maxi_ciclos").update({ estado: "ok", resumen: `measured ${out.medidas}, expired ${out.caducadas}, proposal ${out.propuesta ? "yes" : "no"}. ${out.aviso}`.trim() }).eq("id", ciclo.id);
  return { ok: true as const, status: 200, ...out };
}

/** Approve/reject with the exact hash you saw. `ejecutar` is YOUR hook: connect what should happen on approval (e.g. create a task). */
export async function decidir(sb: SupabaseClient, id: string, accion: "aprobar" | "rechazar", hashVisto: string, nota: string, ejecutar?: (a: Accion) => Promise<void>) {
  const { data: d } = await sb.from("maxi_decisiones").select("*").eq("id", id).maybeSingle();
  if (!d || d.estado !== "propuesta") return { ok: false as const, status: 409, error: "This proposal is no longer open." };
  if (d.accion_hash !== hashVisto || hashAccion(d.accion as Accion) !== hashVisto) return { ok: false as const, status: 409, error: "The proposal changed since you saw it." };
  const ahora = new Date().toISOString();
  if (accion === "rechazar") {
    await sb.from("maxi_decisiones").update({ estado: "rechazada", decidida_at: ahora, nota }).eq("id", id).eq("estado", "propuesta");
    await sb.from("maxi_memoria").insert({ tipo: "criterio", fuente: `decision:${id}`, confianza: 1, texto: `You rejected "${d.titulo}"${nota ? ": " + nota : ""}.` });
    return { ok: true as const, status: 200, estado: "rechazada" };
  }
  await sb.from("maxi_decisiones").update({ estado: "aprobada", aprobada_hash: hashVisto, decidida_at: ahora, nota }).eq("id", id).eq("estado", "propuesta");
  await sb.from("maxi_memoria").insert({ tipo: "criterio", fuente: `decision:${id}`, confianza: 1, texto: `You approved "${d.titulo}"${nota ? ": " + nota : ""}.` });
  const { data: a } = await sb.from("maxi_decisiones").select("*").eq("id", id).maybeSingle();
  if (!a || !puedeEjecutar({ estado: a.estado, accion: a.accion, aprobada_hash: a.aprobada_hash })) return { ok: false as const, status: 409, error: "The approval does not match the stored action." };
  if (ejecutar) await ejecutar(a.accion as Accion);
  await sb.from("maxi_decisiones").update({ estado: "ejecutada", ejecutada_at: new Date().toISOString() }).eq("id", id).eq("estado", "aprobada");
  return { ok: true as const, status: 200, estado: "ejecutada" };
}
