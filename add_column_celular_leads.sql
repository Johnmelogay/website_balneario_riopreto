-- Leads: nova coluna para o celular (WhatsApp) da pessoa.
-- Só acrescenta; não altera nem apaga nada que já existe.
-- Linhas antigas ficam com celular vazio (null). Quem não manda celular continua funcionando.
alter table public.leads add column if not exists celular text;

comment on column public.leads.celular is 'Celular/WhatsApp informado no formulário do site, ex.: (69) 99999-9999';
