// MyBrain · pure core (no network): action hashing, exact-version approval, proposal parsing and measurement.
import { createHash } from "node:crypto";

export type TipoAccion = "tarea_oficina" | "contenido" | "otro";
export type Accion = { tipo: TipoAccion; agente?: string; detalle: string };
export type Propuesta = { titulo: string; razon: string; metrica: string; objetivo: number; accion: Accion };
export type EstadoDecision = "propuesta" | "aprobada" | "rechazada" | "ejecutada" | "medida" | "caducada";

/** Métricas que el ciclo sabe observar. Solo datos reales de la base; si una no existe se omite, nunca se inventa. */
export type Metrica = string;

const canon = (v: unknown): string => {
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v as object).sort().map((k) => JSON.stringify(k) + ":" + canon((v as Record<string, unknown>)[k])).join(",") + "}";
  return JSON.stringify(v ?? null);
};
/** Stable fingerprint of the action: change one letter and the hash changes. */
export const hashAccion = (a: Accion): string => createHash("sha256").update(canon({ tipo: a.tipo, agente: a.agente ?? "", detalle: a.detalle })).digest("hex");

/** An approval is only valid for the EXACT version you saw: the approved hash must match the stored action's hash. */
export function puedeEjecutar(d: { estado: string; accion: Accion; aprobada_hash: string | null }): boolean {
  return d.estado === "aprobada" && !!d.aprobada_hash && d.aprobada_hash === hashAccion(d.accion);
}

const limpia = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max) : "");

/** Turns the model's reply into a valid proposal or null. Unknown action types are never accepted. */
export function parsePropuesta(raw: string | null, metricas: readonly string[]): Propuesta | null {
  if (!raw) return null;
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j: any;
  try { j = JSON.parse(m[0]); } catch { return null; }
  const titulo = limpia(j.titulo, 120), razon = limpia(j.razon, 600), detalle = limpia(j.accion?.detalle, 1200);
  const metrica = limpia(j.metrica, 40);
  const objetivo = Number(j.objetivo);
  const tipo = (["tarea_oficina", "contenido", "otro"] as const).find((t) => t === j.accion?.tipo);
  if (!titulo || !razon || !detalle || !tipo) return null;
  if (!metricas.includes(metrica) || !Number.isFinite(objetivo)) return null;
  return { titulo, razon, metrica, objetivo, accion: { tipo, agente: limpia(j.accion?.agente, 40) || undefined, detalle } };
}

export type Veredicto = "mejora" | "sin_cambio" | "empeora" | "sin_datos";
/** Compares before/after against the target. No real data → "sin_datos" (success is never assumed). */
export function veredicto(antes: number | null, despues: number | null, objetivo: number): Veredicto {
  if (antes == null || despues == null) return "sin_datos";
  if (despues >= objetivo || despues > antes) return "mejora";
  if (despues < antes) return "empeora";
  return "sin_cambio";
}

/** An executed decision is measured after N days. */
export const DIAS_MEDIR = 3;
export const DIAS_CADUCA = 7;
export const toca = (desde: string, dias: number, ahora = Date.now()): boolean => ahora - new Date(desde).getTime() >= dias * 86400000;

export function promptMaxi(contexto: string, metricas: readonly string[], obs: Record<string, number | null>, memoria: string[], resultados: string[]): { sistema: string; usuario: string } {
  return {
    sistema:
      "You are MyBrain, the founder's 'second self'. Business context: " + contexto + " " +
      "Propose ONE single concrete, small, measurable action. Do not invent data. Never propose spending money or mass messaging. " +
      "Reply ONLY with JSON: " + "{\"titulo\":\"\",\"razon\":\"\",\"metrica\":\"" + metricas.join("|") + "\",\"objetivo\":0,\"accion\":{\"tipo\":\"tarea_oficina|contenido|otro\",\"agente\":\"\",\"detalle\":\"\"}}",
    usuario:
      "REAL DATA NOW:\n" + Object.entries(obs).map(([k, v]) => `- ${k}: ${v ?? "no data"}`).join("\n") +
      "\n\nSAVED CRITERIA AND LEARNINGS:\n" + (memoria.length ? memoria.map((m) => "- " + m).join("\n") : "- (none yet)") +
      "\n\nPREVIOUS RESULTS:\n" + (resultados.length ? resultados.map((r) => "- " + r).join("\n") : "- (none yet)"),
  };
}
