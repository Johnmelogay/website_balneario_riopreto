-- Create table
CREATE TABLE IF NOT EXISTS public.blocked_chalets (
    chalet_id INTEGER PRIMARY KEY,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.blocked_chalets ENABLE ROW LEVEL SECURITY;

-- Policies
-- 1. Everyone can read (Public Map needs to know what is blocked)
CREATE POLICY "Public Read Blocks" ON public.blocked_chalets
FOR SELECT USING (true);

-- 2. Allow Insert/Delete for now (Ideally restricted to Admin, but we rely on App Logic for security in this MVP phase)
-- In a stricter app, this would be authenticated only.
CREATE POLICY "Admin All Blocks" ON public.blocked_chalets
FOR ALL USING (true);
