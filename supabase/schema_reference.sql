-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.departments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  department_code text NOT NULL DEFAULT '''DEPT-'' || floor(random()*1000)::text'::text UNIQUE,
  department_name text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  department_name_en character varying,
  approver_id uuid,
  backup_approver_id uuid,
  notify_hr_direct boolean DEFAULT false,
  CONSTRAINT departments_pkey PRIMARY KEY (id),
  CONSTRAINT departments_approver_id_fkey FOREIGN KEY (approver_id) REFERENCES public.employees(id),
  CONSTRAINT departments_backup_approver_id_fkey FOREIGN KEY (backup_approver_id) REFERENCES public.employees(id)
);
CREATE TABLE public.positions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  position_name text NOT NULL,
  department_id uuid,
  status text NOT NULL DEFAULT 'active'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  level_type text,
  duty_name text,
  CONSTRAINT positions_pkey PRIMARY KEY (id),
  CONSTRAINT positions_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id)
);
CREATE TABLE public.leave_types (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  leave_code text NOT NULL UNIQUE,
  leave_name text NOT NULL,
  yearly_quota numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'active'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  allow_after_months numeric DEFAULT 0,
  requires_attachment text DEFAULT 'NO'::text,
  require_advance_days integer DEFAULT 0,
  max_days_per_request numeric,
  paid_leave boolean DEFAULT true,
  default_days integer DEFAULT 0,
  CONSTRAINT leave_types_pkey PRIMARY KEY (id)
);
CREATE TABLE public.leave_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  leave_type_id uuid,
  start_date date NOT NULL,
  end_date date NOT NULL,
  total_days numeric NOT NULL DEFAULT 1,
  reason text,
  attachment_url text,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text, 'cancel_requested'::text])),
  approved_by uuid,
  approved_at timestamp with time zone,
  approval_comment text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  start_period text DEFAULT 'full_day'::text,
  end_period text DEFAULT 'full_day'::text,
  leave_hours numeric DEFAULT 0,
  note text,
  manager_status text DEFAULT 'pending'::text,
  director_status text DEFAULT 'pending'::text,
  is_over_quota boolean,
  cancel_reason text,
  cancel_status text,
  split_group_id text,
  social_security_rights text,
  hospital text,
  executive_status text DEFAULT 'pending'::text,
  CONSTRAINT leave_requests_pkey PRIMARY KEY (id),
  CONSTRAINT fk_leave_requests_employees FOREIGN KEY (employee_id) REFERENCES public.employees(id),
  CONSTRAINT fk_leave_requests_leave_types FOREIGN KEY (leave_type_id) REFERENCES public.leave_types(id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  employee_id uuid,
  email text,
  username text UNIQUE,
  display_name text,
  role text NOT NULL DEFAULT 'employee'::text,
  status text NOT NULL DEFAULT 'active'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.hr_admin_management_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_name text NOT NULL,
  action_category text NOT NULL,
  action_type text NOT NULL,
  target_identifier text NOT NULL,
  description text NOT NULL,
  payload_before jsonb,
  payload_after jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT hr_admin_management_logs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.holidays (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  holiday_date date NOT NULL,
  holiday_name text NOT NULL,
  category text NOT NULL DEFAULT 'official'::text,
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  description text,
  holiday_type text,
  is_paid boolean DEFAULT true,
  CONSTRAINT holidays_pkey PRIMARY KEY (id)
);
CREATE TABLE public.system_settings (
  setting_key text NOT NULL,
  setting_value jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  description text,
  employee_id uuid,
  CONSTRAINT system_settings_pkey PRIMARY KEY (setting_key),
  CONSTRAINT system_settings_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id)
);
CREATE TABLE public.employees (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_code text NOT NULL UNIQUE,
  role text DEFAULT 'user'::text,
  status text NOT NULL DEFAULT 'active'::text,
  title character varying,
  first_name character varying,
  last_name character varying,
  full_name text NOT NULL,
  nickname text,
  phone text,
  email text,
  line_id text,
  image_url text,
  department_id uuid,
  position_id uuid,
  employment_type text DEFAULT 'monthly'::text,
  hospital text,
  bank_account text,
  start_date date,
  converted_date date,
  resign_date date,
  password text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  l1_approver_id uuid,
  l2_approver_id uuid,
  l3_approver_id uuid,
  prefix text,
  CONSTRAINT employees_pkey PRIMARY KEY (id),
  CONSTRAINT fk_employees_departments FOREIGN KEY (department_id) REFERENCES public.departments(id),
  CONSTRAINT fk_employees_positions FOREIGN KEY (position_id) REFERENCES public.positions(id),
  CONSTRAINT employees_l1_approver_id_fkey FOREIGN KEY (l1_approver_id) REFERENCES public.employees(id),
  CONSTRAINT employees_l2_approver_id_fkey FOREIGN KEY (l2_approver_id) REFERENCES public.employees(id),
  CONSTRAINT employees_l3_approver_id_fkey FOREIGN KEY (l3_approver_id) REFERENCES public.employees(id)
);
CREATE TABLE public.department_approvers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL UNIQUE,
  supervisor_id uuid,
  manager_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT department_approvers_pkey PRIMARY KEY (id),
  CONSTRAINT department_approvers_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id),
  CONSTRAINT department_approvers_supervisor_id_fkey FOREIGN KEY (supervisor_id) REFERENCES public.employees(id),
  CONSTRAINT department_approvers_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES public.employees(id)
);
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  type text DEFAULT 'general'::text,
  is_read boolean DEFAULT false,
  link_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id)
);
CREATE TABLE public.line_link_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  token text NOT NULL UNIQUE,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  link_code text,
  used_at timestamp with time zone,
  CONSTRAINT line_link_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT line_link_tokens_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id)
);
CREATE TABLE public.employee_import (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_code text,
  title_name text,
  first_name text,
  last_name text,
  nickname text,
  full_name text,
  department_name text,
  level_type text,
  duty_name text,
  position_name text,
  start_date text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT employee_import_pkey PRIMARY KEY (id)
);
CREATE TABLE public.employee_leave_balances (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  year integer NOT NULL DEFAULT EXTRACT(year FROM CURRENT_DATE),
  sick_total numeric DEFAULT 30.0,
  sick_used numeric DEFAULT 0.0,
  personal_total numeric DEFAULT 6.0,
  personal_used numeric DEFAULT 0.0,
  vacation_total numeric DEFAULT 6.0,
  vacation_used numeric DEFAULT 0.0,
  maternity_total numeric DEFAULT 98.0,
  maternity_used numeric DEFAULT 0.0,
  other_total numeric DEFAULT 30.0,
  other_used numeric DEFAULT 0.0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT employee_leave_balances_pkey PRIMARY KEY (id),
  CONSTRAINT employee_leave_balances_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id)
);
CREATE TABLE public.attendance_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  work_date date NOT NULL DEFAULT CURRENT_DATE,
  check_in timestamp with time zone,
  check_out timestamp with time zone,
  check_in_method text DEFAULT 'manual'::text,
  check_out_method text DEFAULT 'manual'::text,
  status text DEFAULT 'present'::text,
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT attendance_logs_pkey PRIMARY KEY (id),
  CONSTRAINT attendance_logs_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id)
);
CREATE TABLE public.overtime_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  ot_date date NOT NULL,
  start_time time without time zone NOT NULL,
  end_time time without time zone NOT NULL,
  total_hours numeric NOT NULL DEFAULT 0,
  reason text,
  status text NOT NULL DEFAULT 'pending'::text,
  approved_by uuid,
  approved_at timestamp with time zone,
  approval_comment text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT overtime_requests_pkey PRIMARY KEY (id),
  CONSTRAINT overtime_requests_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id),
  CONSTRAINT overtime_requests_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.employees(id)
);
CREATE TABLE public.announcements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text,
  announcement_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'active'::text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT announcements_pkey PRIMARY KEY (id),
  CONSTRAINT announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.employees(id)
);
CREATE TABLE public.hr_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  document_title text NOT NULL,
  document_type text,
  file_url text,
  description text,
  status text NOT NULL DEFAULT 'active'::text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT hr_documents_pkey PRIMARY KEY (id),
  CONSTRAINT hr_documents_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.employees(id)
);
CREATE TABLE public.qr_attendance_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  scanned_at timestamp with time zone NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'success'::text,
  scanned_data text,
  scan_type text DEFAULT 'qr_scan'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT qr_attendance_logs_pkey PRIMARY KEY (id),
  CONSTRAINT qr_attendance_logs_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id)
);
CREATE TABLE public.login_logs (
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
  CONSTRAINT login_logs_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id)
);
CREATE TABLE public.company_announcements (
  id text NOT NULL,
  title text NOT NULL,
  category text DEFAULT 'announcement'::text,
  content text NOT NULL,
  date date DEFAULT CURRENT_DATE,
  author text DEFAULT 'ฝ่ายทรัพยากรบุคคล (HR)'::text,
  is_pinned boolean DEFAULT false,
  link_url text DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT company_announcements_pkey PRIMARY KEY (id)
);