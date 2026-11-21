-- Allow relative /catalog/ item images and any valid https URLs in products table validation
CREATE OR REPLACE FUNCTION public.products_validation() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.price < 0 THEN RAISE EXCEPTION 'السعر غير صالح'; END IF;
  IF NEW.stock_qty IS NOT NULL AND NEW.stock_qty < 0 THEN RAISE EXCEPTION 'الكمية غير صالحة'; END IF;
  IF NEW.image_url IS NOT NULL AND NEW.image_url !~ '^/catalog/' AND NEW.image_url !~ '^https://' THEN RAISE EXCEPTION 'صورة غير صالحة'; END IF;
  RETURN NEW;
END $$;
