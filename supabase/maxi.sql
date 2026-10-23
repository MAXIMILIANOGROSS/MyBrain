-- MyBrain · memory, cycles, decisions and results. Idempotent (safe to run several times).
create extension if not exists pgcrypto;

create table if not exists public.maxi_ciclos (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  via text not null default 'cron' check (via in ('cron','manual')),
  observacion jsonb not null default '{}'::jsonb,
  resumen text,
  estado text not null default 'en_curso' check (estado in ('en_curso','ok','error'))
);

create table if not exists public.maxi_decisiones (
  id uuid primary key default gen_random_uuid(),
  ciclo_id uuid references public.maxi_ciclos(id) on delete set null,
  titulo text not null,
  razon text not null,
  accion jsonb not null,
  accion_hash text not null,
  aprobada_hash text,
  metrica text not null,
  base numeric,
  objetivo numeric not null,
  estado text not null default 'propuesta' check (estado in ('propuesta','aprobada','rechazada','ejecutada','medida','caducada')),
  nota text,
  decidida_at timestamptz,
  ejecutada_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists maxi_decisiones_estado_idx on public.maxi_decisiones(estado, created_at desc);

create table if not exists public.maxi_memoria (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('hecho','criterio','hipotesis')),
  texto text not null,
  fuente text,
  confianza numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.maxi_resultados (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid references public.maxi_decisiones(id) on delete cascade,
  metrica text not null,
  antes numeric,
  despues numeric,
  veredicto text not null check (veredicto in ('mejora','sin_cambio','empeora','sin_datos')),
  at timestamptz not null default now()
);

-- Only the server (service_role) has access. No policies = no regular user can read or write.
alter table public.maxi_ciclos enable row level security;
alter table public.maxi_decisiones enable row level security;
alter table public.maxi_memoria enable row level security;
alter table public.maxi_resultados enable row level security;
revoke all on public.maxi_ciclos, public.maxi_decisiones, public.maxi_memoria, public.maxi_resultados from anon, authenticated;
