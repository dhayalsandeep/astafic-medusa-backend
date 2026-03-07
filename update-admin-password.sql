-- Update the password for the existing admin user
UPDATE public.provider_identity
SET user_metadata = jsonb_build_object(
  'password', '$2b$10$PmLdJgapf1O5/CsBpabI0.aK7Uy8WQ6L8j4jHflVBx6bDzaEdeODK'
)
WHERE entity_id = 'admin@astafic.com' AND provider = 'emailpass';
