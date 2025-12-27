-- CRIAÇÃO DA TABELA DE LEADS
create table public.leads (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text not null,
  email text not null,
  intention text, -- Ex: 'newsletter', 'reserva_simulador', 'loja_item'
  details jsonb -- Dados extras como datas, produto, etc.
);

-- HABILITAR RLS (Segurança)
alter table public.leads enable row level security;

-- POLÍTICA 1: Permitir que qualquer pessoa (anon) insira dados (Formulários do site)
create policy "Permitir inserção pública"
on public.leads
for insert
to anon
with check (true);

-- POLÍTICA 2: Permitir que apenas admins/painel vejam os dados (Opcional, se você usar login depois)
-- Por enquanto, seus dados estarão visíveis no painel do Supabase.

-- TABELA DE RESERVAS (Novo Sistema AI)
create table public.bookings (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  chalet_id int not null,
  checkin_date date not null,
  checkout_date date not null,
  guest_name text,
  raw_message text -- Log da mensagem original do WhatsApp
);

-- RLS para Bookings (Permitir inserção via Edge Function/Anon)
alter table public.bookings enable row level security;

create policy "Permitir leitura pública"
on public.bookings for select
to anon
using (true);

create policy "Permitir inserção pública"
on public.bookings for insert
to anon
with check (true);
