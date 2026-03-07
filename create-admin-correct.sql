-- Create admin user in Medusa v2 database
-- Step 1: Create the user
INSERT INTO public.user (
  id,
  email,
  first_name,
  last_name,
  created_at,
  updated_at
) VALUES (
  'user_admin_astafic',
  'admin@astafic.com',
  'Admin',
  'Astafic',
  NOW(),
  NOW()
) ON CONFLICT DO NOTHING;

-- Step 2: Create auth identity
INSERT INTO public.auth_identity (
  id,
  app_metadata,
  created_at,
  updated_at
) VALUES (
  'authid_admin_astafic',
  '{}',
  NOW(),
  NOW()
) ON CONFLICT DO NOTHING;

-- Step 3: Create provider identity for email/password authentication
INSERT INTO public.provider_identity (
  id,
  entity_id,
  provider,
  auth_identity_id,
  user_metadata,
  created_at,
  updated_at
) VALUES (
  'provid_admin_astafic',
  'admin@astafic.com',
  'emailpass',
  'authid_admin_astafic',
  jsonb_build_object(
    'password', '$2b$10$PmLdJgapf1O5/CsBpabI0.aK7Uy8WQ6L8j4jHflVBx6bDzaEdeODK'
  ),
  NOW(),
  NOW()
) ON CONFLICT (entity_id, provider) DO NOTHING;
