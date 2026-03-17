-- ==============================================================================
-- 1. ADICIONAR NOVAS COLUNAS NA TABELA DE ENTRADAS (gate_entries)
-- ==============================================================================
ALTER TABLE public.gate_entries 
    ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'pending', -- 'pending', 'verified', 'cancelled', 'refunded'
    ADD COLUMN IF NOT EXISTS idempotency_key uuid UNIQUE,
    ADD COLUMN IF NOT EXISTS pricing_snapshot jsonb,
    ADD COLUMN IF NOT EXISTS cancel_reason text,
    ADD COLUMN IF NOT EXISTS cancelled_at timestamp with time zone,
    ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES public.staff_users(id),
    ADD COLUMN IF NOT EXISTS refunded_at timestamp with time zone,
    ADD COLUMN IF NOT EXISTS refunded_by uuid REFERENCES public.staff_users(id),
    ADD COLUMN IF NOT EXISTS refund_reason text;

-- ==============================================================================
-- 2. CRIAR TABELA DE PAGAMENTOS DIGITAIS OBRIGATÓRIOS (gate_payments)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.gate_payments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    gate_entry_id uuid NOT NULL REFERENCES public.gate_entries(id) ON DELETE CASCADE,
    payment_method text NOT NULL, -- 'pix', 'cartao_deb', 'cartao_cred'
    amount numeric(10,2) NOT NULL,
    nsu text,
    auth_code text,
    card_brand text,
    card_last4 text,
    proof_path text, -- path/to/image.jpg no bucket 'gate-payment-proofs'
    verified_at timestamp with time zone,
    verified_by uuid REFERENCES public.staff_users(id),
    created_at timestamp with time zone DEFAULT now()
);

-- ==============================================================================
-- 3. CRIAR TABELA DE EVENTOS DE AUDITORIA IMUTÁVEIS (gate_entry_events)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.gate_entry_events (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    gate_entry_id uuid NOT NULL REFERENCES public.gate_entries(id) ON DELETE CASCADE,
    event_type text NOT NULL, -- e.g., 'created', 'cancelled', 'refunded', 'payment_verified'
    actor_staff_id uuid REFERENCES public.staff_users(id),
    details jsonb, -- e.g., before/after states, cancel reason
    created_at timestamp with time zone DEFAULT now()
);

-- Forçar imutabilidade na tabela de auditoria via trigger (opcional/avançado)
-- Criaremos apenas a policy RLS de insert-only para simplificar.

-- ==============================================================================
-- 4. ÍNDICES DE PERFORMANCE E BUSCA
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_gate_entries_created_at ON public.gate_entries(created_at);
CREATE INDEX IF NOT EXISTS idx_gate_entries_payment_status ON public.gate_entries(payment_status);
CREATE INDEX IF NOT EXISTS idx_gate_payments_entry_id ON public.gate_payments(gate_entry_id);
CREATE INDEX IF NOT EXISTS idx_gate_events_entry_id ON public.gate_entry_events(gate_entry_id, created_at);

-- ==============================================================================
-- 5. RLS E SEGURANÇA (Row Level Security)
-- ==============================================================================
ALTER TABLE public.gate_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gate_entry_events ENABLE ROW LEVEL SECURITY;

-- gate_payments policies
CREATE POLICY "Enable read access for authenticated staff" ON public.gate_payments
    FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated staff" ON public.gate_payments
    FOR INSERT WITH CHECK (true);
-- Ninguém pode apagar pagamentos, apenas estornar via gate_entries ou evento.

-- gate_entry_events policies
CREATE POLICY "Enable read access for authenticated staff" ON public.gate_entry_events
    FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated staff" ON public.gate_entry_events
    FOR INSERT WITH CHECK (true);
-- Eventos jamais podem ser editados ou deletados.

-- ==============================================================================
-- 6. CRIAR BUCKET PRIVADO DE COMPROVANTES
-- Executar esta etapa manualmente na UI do Supabase (Storage -> Criar novo bucket)
-- Nome: gate-payment-proofs (Público desativado)
-- Mas podemos inserir o registro na tabela storage.buckets:
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public) 
VALUES ('gate-payment-proofs', 'gate-payment-proofs', false) 
ON CONFLICT (id) DO NOTHING;

-- Policy para permitir acesso ao bucket (apenas staff auhorizado pode ler/inserir)
-- (Note: Storage policies precisam da extensão/configuração da interface ou do SQL auth.uid())
CREATE POLICY "Staff can upload proofs"
ON storage.objects FOR INSERT
TO authenticated 
WITH CHECK (bucket_id = 'gate-payment-proofs');

CREATE POLICY "Staff can view proofs"
ON storage.objects FOR SELECT
TO authenticated 
USING (bucket_id = 'gate-payment-proofs');
