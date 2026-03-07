-- Create admin user directly in Medusa database
-- This creates a user with email/password authentication

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
) ON CONFLICT (email) DO NOTHING;

-- Create auth identity for email/password login
INSERT INTO public.auth_identity (
  id,
  provider_id,
  provider,
  entity_id,
  user_metadata,
  created_at,
  updated_at
) VALUES (
  'authid_admin_astafic',
  'admin@astafic.com',
  'emailpass',
  'user_admin_astafic',
  jsonb_build_object(
    'password', '$2b$10$YourHashedPasswordHere'  -- This needs to be a bcrypt hash
  ),
  NOW(),
  NOW()
) ON CONFLICT (provider, provider_id) DO NOTHING;
