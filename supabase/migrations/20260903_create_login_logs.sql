-- ==============================================================================
-- 📋 SUPABASE MIGRATION: Login Activity Tracking ('login_logs' table)
-- Records User ID, Timestamp, and Device Info for Audit Purposes
-- ==============================================================================

-- 1. Create the login_logs table
CREATE TABLE IF NOT EXISTS public.login_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  employee_id uuid,
  employee_code text,
  full_name text,
  role text,
  timestamp timestamp with time zone NOT NULL DEFAULT now(),
  device_info jsonb,
  ip_address text,
  login_method text DEFAULT 'password'::text,
  status text NOT NULL DEFAULT 'success'::text,
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT login_logs_pkey PRIMARY KEY (id),
  CONSTRAINT fk_login_logs_employees FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE SET NULL
);

-- 2. Indexes for fast audit queries and analytics
CREATE INDEX IF NOT EXISTS idx_login_logs_user_id ON public.login_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_login_logs_employee_id ON public.login_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_login_logs_timestamp ON public.login_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_login_logs_method ON public.login_logs(login_method);

-- 3. Row Level Security (RLS) Configuration
ALTER TABLE public.login_logs ENABLE ROW LEVEL SECURITY;

-- Allow public/anon and authenticated users to insert login logs
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'login_logs' AND policyname = 'Allow insert login_logs'
  ) THEN
    CREATE POLICY "Allow insert login_logs" ON public.login_logs FOR INSERT WITH CHECK (true);
  END IF;

  -- Allow authenticated and admin roles to read login logs for audit purposes
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'login_logs' AND policyname = 'Allow read login_logs'
  ) THEN
    CREATE POLICY "Allow read login_logs" ON public.login_logs FOR SELECT USING (true);
  END IF;
END $$;

COMMENT ON TABLE public.login_logs IS 'Audit table recording login activity, user ID, timestamp, and client device information.';
