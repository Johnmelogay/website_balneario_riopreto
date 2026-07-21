-- TABELA DE LOGS DE AUDITORIA ULTRA-LEVE & PERFORMANCE ALTA
-- Projetada para armazenar milhões de registros por anos com tamanho compacto e busca por dia instantânea.

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    action_type text NOT NULL,             -- Ex: 'ORDER_CREATED', 'STATUS_CHANGED', 'STOCK_UPDATED', 'STAFF_LOGIN', 'PAYMENT_CLOSED'
    staff_id uuid,                          -- Link com staff_users (opcional)
    staff_name text,                        -- Nome em cache para exibição instantânea
    staff_role text,                        -- Papel do funcionário ('admin', 'garcom', 'cozinha')
    location_type text,                     -- 'chale', 'mesa', 'balcao', 'cozinha', 'caixa'
    location_id text,                       -- '1', 'M5', 'B1'
    device_info jsonb DEFAULT '{}'::jsonb,  -- Ex: {"device": "Mobile", "os": "iOS", "browser": "Safari"}
    details jsonb DEFAULT '{}'::jsonb       -- Dados específicos da ação (order_number, total, etc.)
);

-- Habilitar RLS (Segurança)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Políticas de Acesso (Drop políticas antigas se existirem para recriação limpa)
DROP POLICY IF EXISTS "Permitir inserção de audit_logs para anon e authenticated" ON public.audit_logs;
DROP POLICY IF EXISTS "Permitir leitura de audit_logs para anon e authenticated" ON public.audit_logs;

CREATE POLICY "Permitir inserção de audit_logs para anon e authenticated"
ON public.audit_logs FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Permitir leitura de audit_logs para anon e authenticated"
ON public.audit_logs FOR SELECT
TO anon, authenticated
USING (true);

-- ÍNDICES DE ALTA PERFORMANCE (Garante buscas por dia em milissegundos mesmo com milhões de linhas)
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON public.audit_logs (action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_staff_id ON public.audit_logs (staff_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_location ON public.audit_logs (location_type, location_id);

-- Conceder permissões de execução
GRANT ALL ON TABLE public.audit_logs TO anon;
GRANT ALL ON TABLE public.audit_logs TO authenticated;
