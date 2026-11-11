-- PRÉ-RESERVA GRÁTIS (24 horas) — rodar uma vez no Supabase: SQL Editor > New query > colar > Run.
-- Só acrescenta coisas novas. Não apaga nem altera nenhuma reserva que já existe.
--
-- Como funciona:
-- * O site chama criar_pre_reserva(). O banco confere tudo (chalé livre, datas, 1 por celular/aparelho)
--   e grava uma reserva PENDENTE normal em bookings, com expires_at = agora + 24h.
--   Por ser 'pending', ela já aparece AMARELA no mapa, bloqueia o chalé no site e é vista pelo robô.
-- * Se a equipe confirmar (status vira 'confirmed'), ela vira reserva de verdade e nunca expira.
-- * Se ninguém confirmar em 24h, expirar_pre_reservas() tira a reserva de bookings (o chalé volta a ficar livre)
--   e guarda o histórico em pre_reservas, com status 'expirada'.

-- 1) Coluna de validade na tabela de reservas (vazia em todas as reservas que já existem)
alter table public.bookings add column if not exists expires_at timestamptz;
comment on column public.bookings.expires_at is 'Só para pré-reservas grátis do site: quando a pré-reserva expira. Vazio = reserva normal.';

-- 2) Histórico das pré-reservas (o site não lê nem grava direto: só pelas funções abaixo)
create table if not exists public.pre_reservas (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  booking_id uuid,
  chalet_id int not null,
  checkin_date date not null,
  checkout_date date not null,
  nome text not null,
  celular text not null,
  aparelho text,
  adultos int,
  total numeric,
  status text not null default 'ativa'   -- 'ativa', 'confirmada', 'expirada'
);
create index if not exists idx_pre_reservas_status on public.pre_reservas (status, expires_at);
alter table public.pre_reservas enable row level security;  -- sem política pública: anon não acessa a tabela

-- 3) Expira as pré-reservas vencidas. Pode ser chamada a qualquer momento (o site e o mapa chamam ao abrir).
create or replace function public.expirar_pre_reservas()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := 0;
begin
  -- Confirmadas pela equipe: viram reserva normal (sem validade)
  update public.pre_reservas p set status = 'confirmada'
   where p.status = 'ativa'
     and exists (select 1 from public.bookings b where b.id = p.booking_id and b.status = 'confirmed');
  update public.bookings b set expires_at = null
   where b.status = 'confirmed' and b.expires_at is not null;

  -- Vencidas e ainda pendentes: sai do mapa e libera o chalé
  with vencidas as (
    update public.pre_reservas p set status = 'expirada'
     where p.status = 'ativa' and p.expires_at <= now()
    returning p.booking_id
  )
  delete from public.bookings b
   using vencidas v
   where b.id = v.booking_id and b.status = 'pending' and b.expires_at is not null;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- 4) Cria a pré-reserva com todas as conferências feitas no banco (não dá para burlar pelo navegador)
create or replace function public.criar_pre_reserva(
  p_nome text,
  p_celular text,
  p_aparelho text,
  p_chalet_id int,
  p_checkin date,
  p_checkout date,
  p_adultos int default 2,
  p_criancas int default 0,
  p_total numeric default 0,
  p_horario text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text := left(btrim(coalesce(p_nome, '')), 80);
  v_cel text := regexp_replace(coalesce(p_celular, ''), '\D', '', 'g');
  v_hoje date := (now() at time zone 'America/Porto_Velho')::date;
  v_expira timestamptz := now() + interval '24 hours';
  v_booking uuid;
  v_existente record;
begin
  perform public.expirar_pre_reservas();

  -- Dados obrigatórios
  if length(v_nome) < 2 then return json_build_object('ok', false, 'erro', 'nome'); end if;
  if length(v_cel) not between 10 and 11 then return json_build_object('ok', false, 'erro', 'celular'); end if;
  if p_chalet_id is null or p_chalet_id not between 3 and 10 then return json_build_object('ok', false, 'erro', 'chale'); end if;
  if p_checkin is null or p_checkout is null or p_checkin < v_hoje or p_checkout <= p_checkin
     or p_checkout - p_checkin > 14 or p_checkin > v_hoje + 365 then
    return json_build_object('ok', false, 'erro', 'datas');
  end if;

  -- Um pedido por vez para o mesmo chalé (evita duas pessoas pegarem o mesmo no mesmo segundo)
  perform pg_advisory_xact_lock(424200 + p_chalet_id);

  -- 1 pré-reserva ativa por celular e por aparelho: devolve a que já existe
  select * into v_existente from public.pre_reservas
   where status = 'ativa' and expires_at > now()
     and (celular = v_cel or (p_aparelho is not null and p_aparelho <> '' and aparelho = p_aparelho))
   order by created_at desc limit 1;
  if found then
    return json_build_object('ok', false, 'erro', 'ja_tem', 'id', v_existente.booking_id, 'chalet_id', v_existente.chalet_id,
      'checkin', v_existente.checkin_date, 'checkout', v_existente.checkout_date, 'expires_at', v_existente.expires_at);
  end if;

  -- Chalé em manutenção
  if exists (select 1 from public.blocked_chalets where chalet_id = p_chalet_id) then
    return json_build_object('ok', false, 'erro', 'ocupado');
  end if;

  -- Chalé ocupado nas datas (mesma regra do site: saída e entrada no mesmo dia pode)
  if exists (select 1 from public.bookings
              where chalet_id = p_chalet_id and status in ('confirmed', 'pending')
                and checkin_date < p_checkout and checkout_date > p_checkin) then
    return json_build_object('ok', false, 'erro', 'ocupado');
  end if;

  -- Domingo: quem sai no domingo fica até 16h30, então não entra ninguém nesse dia
  if extract(dow from p_checkin) = 0 and exists (select 1 from public.bookings
       where chalet_id = p_chalet_id and status in ('confirmed', 'pending') and checkout_date = p_checkin) then
    return json_build_object('ok', false, 'erro', 'ocupado');
  end if;

  insert into public.bookings (chalet_id, checkin_date, checkout_date, guest_name, contact_info, adults,
                               arrival_time, total_price, advance_payment, status, madeby, expires_at, raw_message)
  values (p_chalet_id, p_checkin, p_checkout, v_nome, v_cel, greatest(coalesce(p_adultos, 2), 1),
          left(p_horario, 10), greatest(coalesce(p_total, 0), 0), 0, 'pending', 'site_pre_reserva', v_expira,
          json_build_object('pre_reserva', true, 'origem', 'site',
            'ai_parsed', json_build_object('notes', 'PRÉ-RESERVA GRÁTIS do site (24h). Confirmar com o cliente pelo WhatsApp.',
                                           'source', 'site', 'criancas', coalesce(p_criancas, 0)))::text)
  returning id into v_booking;

  insert into public.pre_reservas (expires_at, booking_id, chalet_id, checkin_date, checkout_date, nome, celular,
                                   aparelho, adultos, total)
  values (v_expira, v_booking, p_chalet_id, p_checkin, p_checkout, v_nome, v_cel, nullif(left(p_aparelho, 64), ''),
          p_adultos, p_total);

  return json_build_object('ok', true, 'id', v_booking, 'chalet_id', p_chalet_id,
    'checkin', p_checkin, 'checkout', p_checkout, 'expires_at', v_expira);
end;
$$;

-- O site (anon) só pode CHAMAR as funções; não mexe direto na tabela pre_reservas
revoke all on function public.criar_pre_reserva(text, text, text, int, date, date, int, int, numeric, text) from public;
revoke all on function public.expirar_pre_reservas() from public;
grant execute on function public.criar_pre_reserva(text, text, text, int, date, date, int, int, numeric, text) to anon, authenticated;
grant execute on function public.expirar_pre_reservas() to anon, authenticated;

-- 5) (Opcional, recomendado) Expirar sozinho a cada 10 minutos, mesmo sem ninguém abrir o site.
-- Se der erro aqui, ative a extensão "pg_cron" em Database > Extensions e rode só estas duas linhas de novo.
create extension if not exists pg_cron;
select cron.schedule('expirar-pre-reservas', '*/10 * * * *', 'select public.expirar_pre_reservas()');
