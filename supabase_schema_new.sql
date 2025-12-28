-- 1. DROP EXISTING TABLE (Clean Slate for MVP upgrade)
-- Warning: This deletes existing data!
DROP TABLE IF EXISTS public.bookings;

-- 2. CREATE NEW TABLE (Robust)
CREATE TABLE public.bookings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  -- Core Reservation Info
  chalet_id int NOT NULL,
  checkin_date date NOT NULL,
  checkout_date date NOT NULL,
  
  -- Guest Info
  guest_name text NOT NULL,
  contact_info text,        -- Mandatory (Phone or Email)
  
  -- Financials
  total_price numeric DEFAULT 0,
  advance_payment numeric DEFAULT 0,
  is_late_arrival boolean DEFAULT false,
  late_fee numeric DEFAULT 0, -- 50.00 if applicable
  
  -- Logistics
  arrival_time text,        -- e.g. "15:00"
  payment_proof_url text,   -- Storage URL
  
  -- Logic
  status text DEFAULT 'pending', -- 'confirmed', 'pending', 'incomplete'
  auto_assigned boolean DEFAULT false,
  raw_message text          -- Log for debugging
);

-- 3. STORAGE BUCKET (for Receipts)
-- Insert a new bucket called 'receipts' if not exists
INSERT INTO storage.buckets (id, name, public) 
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

-- 4. STORAGE POLICIES (Allow Public Uploads for this Demo MVP)
-- Allow anyone to upload (In prod, restrict to authenticated users)
CREATE POLICY "Public Uploads" 
ON storage.objects FOR INSERT 
WITH CHECK ( bucket_id = 'receipts' );

CREATE POLICY "Public Reads" 
ON storage.objects FOR SELECT 
USING ( bucket_id = 'receipts' );

-- 5. INDEXES (Performance)
CREATE INDEX idx_bookings_dates ON public.bookings (checkin_date, checkout_date);
CREATE INDEX idx_bookings_chalet ON public.bookings (chalet_id);
