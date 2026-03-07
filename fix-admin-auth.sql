-- Fix admin authentication by updating provider_metadata with scrypt hash
UPDATE public.provider_identity
SET
  provider_metadata = jsonb_build_object(
    'password', 'c2NyeXB0AA8AAAAIAAAAAUU5+COscQC6AAP7F/OmIFLcXhPBeX5XHpW4gh9Y1GvKJmp8xT7B7AioREDgAGvRQiLQ99rmqErUAErMdHWq4GfWnC94ppZn2+SGgD6clnwy'
  ),
  user_metadata = NULL  -- Clear the incorrect field
WHERE entity_id = 'admin@astafic.com' AND provider = 'emailpass';
