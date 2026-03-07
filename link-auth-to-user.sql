-- Link the auth_identity to the user by setting app_metadata
UPDATE public.auth_identity
SET app_metadata = jsonb_build_object(
  'user_id', 'user_admin_astafic',
  'actor_type', 'user'
)
WHERE id = 'authid_admin_astafic';
