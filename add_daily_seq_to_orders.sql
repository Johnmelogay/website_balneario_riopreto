-- add_daily_seq_to_orders.sql

-- 1. Add the new column
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS daily_seq INTEGER;

-- 2. Create the trigger function
CREATE OR REPLACE FUNCTION public.assign_daily_seq()
RETURNS TRIGGER AS $$
DECLARE
    next_seq INTEGER;
    today_start TIMESTAMP WITH TIME ZONE;
    today_end TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Define the start and end of the day based on the order's created_at (adjusted to Brazil timezone if needed)
    -- Using the timezone of the server (or UTC if preferred, but usually local date is better)
    -- We will truncate to DAY at the 'America/Sao_Paulo' timezone
    today_start := date_trunc('day', NEW.created_at AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
    today_end := today_start + interval '1 day';

    -- Find the highest daily_seq for today
    SELECT COALESCE(MAX(daily_seq), 0) + 1
    INTO next_seq
    FROM public.orders
    WHERE created_at >= today_start 
      AND created_at < today_end;

    -- Assign the calculated sequence
    NEW.daily_seq := next_seq;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create the trigger
DROP TRIGGER IF EXISTS trg_assign_daily_seq ON public.orders;

CREATE TRIGGER trg_assign_daily_seq
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.assign_daily_seq();

-- 4. Backfill existing orders for today (so the UI doesn't break for orders already placed today)
DO $$
DECLARE
    today_start TIMESTAMP WITH TIME ZONE := date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
    rec RECORD;
    curr_seq INTEGER := 1;
BEGIN
    FOR rec IN (SELECT id FROM public.orders WHERE created_at >= today_start ORDER BY created_at ASC)
    LOOP
        UPDATE public.orders SET daily_seq = curr_seq WHERE id = rec.id AND daily_seq IS NULL;
        curr_seq := curr_seq + 1;
    END LOOP;
END;
$$;
