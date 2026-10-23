// Usage: node --experimental-strip-types src/cli.ts ciclo | pendientes | aprobar <id> [note] | rechazar <id> [note]
// Variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LLM_BASE_URL, LLM_API_KEY, LLM_MODEL
import { createClient } from "@supabase/supabase-js";
import { correrMaxi, decidir } from "./ciclo.ts";
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });
const [cmd, id, ...nota] = process.argv.slice(2);
if (cmd === "ciclo") console.log(await correrMaxi(sb, "manual"));
else if (cmd === "pendientes") { const { data } = await sb.from("maxi_decisiones").select("id,titulo,razon,accion,accion_hash").eq("estado", "propuesta"); console.log(JSON.stringify(data, null, 2)); }
else if ((cmd === "aprobar" || cmd === "rechazar") && id) {
  const { data } = await sb.from("maxi_decisiones").select("accion_hash").eq("id", id).maybeSingle();
  console.log(await decidir(sb, id, cmd, data?.accion_hash ?? "", nota.join(" "), async (a) => console.log("Action approved (plug your hook in here):", a)));
} else console.log("Usage: ciclo | pendientes | aprobar <id> [note] | rechazar <id> [note]");
