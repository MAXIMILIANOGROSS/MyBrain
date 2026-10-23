# MyBrain

A "second self" for your business. Every day it **observes real data**, **proposes one single measurable action**, **waits for your approval**, **measures the result** and **learns** from what you approve or reject.

- Your approval is tied to the **exact version** (SHA-256 hash) of the action you saw. If it changes, it cannot run.
- It never sends messages or spends money on its own. You decide what happens on approval (the `ejecutar` hook).
- No data, no conclusions: a metric without data is "no data", never a success.
- Runs for free: Supabase (free tier) + GitHub Actions + any OpenAI-compatible API (Groq, OpenRouter, Ollama…).

## Quick start
1. Create a Supabase project and run `supabase/maxi.sql` in the SQL editor.
2. Edit `src/maxi.config.ts` (your business and the tables you want to measure).
3. Copy `.env.example` to `.env` and fill it in. Then `npm install`.
4. Try it: `node --env-file=.env --experimental-strip-types src/cli.ts ciclo`, then `pendientes`, then `aprobar <id>`.
5. Automatic: in GitHub, add the secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LLM_*`) and set the variable `MAXI_ACTIVO=true`.

`npm test` runs the core tests. MIT license. Created by Maximiliano Olmos (Island Crew).

## Credits

Created by **Maximiliano Olmos** · Island Crew · https://github.com/MAXIMILIANOGROSS

If you use or adapt this project, please keep this credit and the LICENSE notice.
