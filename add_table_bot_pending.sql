-- Robô do WhatsApp: reservas lidas e mostradas no grupo, esperando o "sim" de alguém da equipe.
-- Tabela nova; não altera nada existente. Só a função do servidor (service role) acessa.
create table if not exists public.bot_pending (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  chat text not null,
  sender text,
  sender_name text,
  text text,
  rows jsonb not null
);

alter table public.bot_pending enable row level security;

comment on table public.bot_pending is 'Prévia de reserva mostrada pelo robô no grupo, aguardando confirmação (sim/não). Expira em 30 minutos.';
