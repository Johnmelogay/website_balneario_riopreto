CREATE TABLE IF NOT EXISTS public.stock_snapshots (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamp with time zone DEFAULT now(),
    snapshot_data jsonb NOT NULL,
    saved_by text,
    notes text
);

-- Give access to authenticated users and anon for now
ALTER TABLE public.stock_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all users" ON public.stock_snapshots FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users only" ON public.stock_snapshots FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users only" ON public.stock_snapshots FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Enable delete for authenticated users only" ON public.stock_snapshots FOR DELETE USING (true);

-- if we want no RLS for now (like other tables might be):
ALTER TABLE public.stock_snapshots DISABLE ROW LEVEL SECURITY;
