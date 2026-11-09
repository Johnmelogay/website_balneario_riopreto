-- Registro de todas as mensagens de reserva enviadas para a IA (inclusive as que falharam).
-- Tabela nova; não altera nada que já existe. Só a função do servidor (service role) grava e lê:
-- RLS ligado e sem política pública, então o site e o anon não acessam.
create table if not exists public.booking_attempts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  madeby text,
  text text,
  success boolean,
  message text,
  result jsonb
);

alter table public.booking_attempts enable row level security;

comment on table public.booking_attempts is 'Cada texto de reserva enviado para a IA (smooth-handler), com o resultado e os avisos.';
