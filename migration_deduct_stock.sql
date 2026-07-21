-- Atomic Stock Deduction Function
-- Prevents race conditions when multiple waiters sell the same product simultaneously.
-- Returns TRUE if stock was successfully deducted, FALSE if insufficient stock.
-- Usage: SELECT deduct_stock('product-uuid', 2);

CREATE OR REPLACE FUNCTION public.deduct_stock(p_product_id uuid, p_qty int)
RETURNS bool
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    updated_rows int;
BEGIN
    -- Atomically deduct stock only if sufficient quantity exists
    UPDATE public.products
    SET stock_qty = stock_qty - p_qty
    WHERE id = p_product_id 
      AND is_stock_controlled = true 
      AND stock_qty >= p_qty;
    
    GET DIAGNOSTICS updated_rows = ROW_COUNT;
    
    -- Returns true if the update affected a row (stock was available)
    RETURN updated_rows > 0;
END;
$$;

-- Grant access to anon role (since the app uses anon key)
GRANT EXECUTE ON FUNCTION public.deduct_stock(uuid, int) TO anon;
GRANT EXECUTE ON FUNCTION public.deduct_stock(uuid, int) TO authenticated;
