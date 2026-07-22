-- sync_tambaqui_stock.sql

-- Define the function
CREATE OR REPLACE FUNCTION public.sync_tambaqui_stock()
RETURNS TRIGGER AS $$
DECLARE
    tambaqui_ids uuid[] := ARRAY[
        'fdff838e-28f3-4796-b996-d8bb36b1d6ee'::uuid, -- Tambaqui Simples
        '7d9a57b8-170a-4900-a749-e0d7c2c8a080'::uuid, -- Tambaqui Completo
        'e1612d9b-220c-4b1a-a561-da850f042bbc'::uuid, -- Caldeirada De Tambaqui
        '6eb6c90b-b2d3-414b-832d-a600458b296f'::uuid  -- 1/2 Tambaqui Completo
    ];
BEGIN
    -- Only trigger if this is the original update (prevent infinite loop)
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    -- Check if the updated product is one of the Tambaqui variants
    IF NEW.id = ANY(tambaqui_ids) THEN
        -- Only proceed if stock_qty or is_stock_controlled actually changed
        IF (OLD.stock_qty IS DISTINCT FROM NEW.stock_qty) OR 
           (OLD.is_stock_controlled IS DISTINCT FROM NEW.is_stock_controlled) THEN
            
            -- Update the OTHER Tambaqui variants to match the new values
            UPDATE public.products
            SET 
                stock_qty = NEW.stock_qty,
                is_stock_controlled = NEW.is_stock_controlled
            WHERE id = ANY(tambaqui_ids)
              AND id != NEW.id;
              
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if it already exists
DROP TRIGGER IF EXISTS trg_sync_tambaqui_stock ON public.products;

-- Create the trigger on the products table
CREATE TRIGGER trg_sync_tambaqui_stock
AFTER UPDATE OF stock_qty, is_stock_controlled ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.sync_tambaqui_stock();
