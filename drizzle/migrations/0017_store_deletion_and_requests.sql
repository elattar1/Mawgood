-- 1. Create store_deletion_requests table
CREATE TABLE IF NOT EXISTS public.store_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_name text NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_deletion_requests TO authenticated;
GRANT ALL ON public.store_deletion_requests TO service_role;
ALTER TABLE public.store_deletion_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "store_deletion_requests_read" ON public.store_deletion_requests;
CREATE POLICY "store_deletion_requests_read" ON public.store_deletion_requests
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "store_deletion_requests_insert" ON public.store_deletion_requests;
CREATE POLICY "store_deletion_requests_insert" ON public.store_deletion_requests
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "store_deletion_requests_update" ON public.store_deletion_requests;
CREATE POLICY "store_deletion_requests_update" ON public.store_deletion_requests
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "store_deletion_requests_delete" ON public.store_deletion_requests;
CREATE POLICY "store_deletion_requests_delete" ON public.store_deletion_requests
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 2. Stored function to delete store and its dependencies cleanly
CREATE OR REPLACE FUNCTION public.admin_delete_store(_store_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'هذه العملية مخصصة للإدارة فقط';
  END IF;

  -- Delete store deletion requests
  DELETE FROM public.store_deletion_requests WHERE store_id = _store_id;

  -- Delete orders and dependent records
  DELETE FROM public.order_messages WHERE order_id IN (SELECT id FROM public.orders WHERE store_id = _store_id);
  DELETE FROM public.order_items WHERE order_id IN (SELECT id FROM public.orders WHERE store_id = _store_id);
  DELETE FROM public.orders WHERE store_id = _store_id;

  -- Delete bookings & service_requests
  DELETE FROM public.bookings WHERE store_id = _store_id;
  DELETE FROM public.service_requests WHERE store_id = _store_id;

  -- Delete reviews, products, and store_sections (with cascade redundancy)
  DELETE FROM public.reviews WHERE store_id = _store_id;
  DELETE FROM public.products WHERE store_id = _store_id;
  DELETE FROM public.store_sections WHERE store_id = _store_id;

  -- Delete the store itself
  DELETE FROM public.stores WHERE id = _store_id;

  RETURN true;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_delete_store(uuid) TO authenticated;
