import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://hihaipaslnpaqnqotrwm.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpaGFpcGFzbG5wYXFucW90cndtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDI2MTU5MiwiZXhwIjoyMDc5ODM3NTkyfQ.mJ6Rvbe8QWPesfgLdmhXLXTg1eBRao6hgr0OUXXzJPw';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);