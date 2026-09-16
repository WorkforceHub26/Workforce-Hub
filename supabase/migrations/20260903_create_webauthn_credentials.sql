-- ==============================================================================
-- 📋 SUPABASE MIGRATION: WebAuthn Credentials table
-- Records Biometric Credentials, public keys and metadata
-- ==============================================================================

-- 1. Create the webauthn_credentials table
CREATE TABLE IF NOT EXISTS public.webauthn_credentials (
  id text NOT NULL,
  credential_id text NOT NULL,
  employee_id uuid NOT NULL,
  employee_code text,
  device_name text,
  biometric_type text,
  transports text[],
  public_key text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_used_at timestamp with time zone,
  status text NOT NULL DEFAULT 'active'::text,
  CONSTRAINT webauthn_credentials_pkey PRIMARY KEY (id),
  CONSTRAINT fk_webauthn_credentials_employees FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE
);

-- 2. Indexes for fast credential lookups
CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_employee_id ON public.webauthn_credentials(employee_id);
CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_credential_id ON public.webauthn_credentials(credential_id);

-- 3. Row Level Security (RLS) Configuration
ALTER TABLE public.webauthn_credentials ENABLE ROW LEVEL SECURITY;

-- Allow public and authenticated insert/select/delete
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'webauthn_credentials' AND policyname = 'Allow insert webauthn_credentials'
  ) THEN
    CREATE POLICY "Allow insert webauthn_credentials" ON public.webauthn_credentials FOR INSERT WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'webauthn_credentials' AND policyname = 'Allow select webauthn_credentials'
  ) THEN
    CREATE POLICY "Allow select webauthn_credentials" ON public.webauthn_credentials FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'webauthn_credentials' AND policyname = 'Allow update webauthn_credentials'
  ) THEN
    CREATE POLICY "Allow update webauthn_credentials" ON public.webauthn_credentials FOR UPDATE USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'webauthn_credentials' AND policyname = 'Allow delete webauthn_credentials'
  ) THEN
    CREATE POLICY "Allow delete webauthn_credentials" ON public.webauthn_credentials FOR DELETE USING (true);
  END IF;
END $$;

COMMENT ON TABLE public.webauthn_credentials IS 'Stores FIDO2 WebAuthn credentials for passwordless biometric sign-in.';
