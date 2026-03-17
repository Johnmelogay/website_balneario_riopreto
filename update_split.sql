ALTER TABLE "public"."orders" 
ADD COLUMN IF NOT EXISTS "service_fee" numeric DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS "split_pix" numeric DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS "split_dinheiro" numeric DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS "split_credito" numeric DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS "split_debito" numeric DEFAULT 0.00;
