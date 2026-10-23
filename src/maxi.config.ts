// Configure YOUR business here. Everything else (cycle, hash approval, memory, measurement) is generic.
export const NEGOCIO = "Describe in one sentence what your business is and who it serves.";

/** Metrics the cycle observes. Each one is a REAL row count from a table in your Supabase (data is never invented). */
export type MetricaDef = { id: string; tabla: string; filtro?: { columna: string; ultimosDias: number } };
export const METRICAS: MetricaDef[] = [
  { id: "registros_total", tabla: "profiles" },
  { id: "registros_7d", tabla: "profiles", filtro: { columna: "created_at", ultimosDias: 7 } },
];
