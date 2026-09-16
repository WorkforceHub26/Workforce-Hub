-- =========================================================================
-- 🛡️ SQL SCRIPT: CREATE 3 SEPARATE HR ACCOUNTS (STANDARD SQL - NO DO BLOCK)
-- =========================================================================

-- 1. สร้างแผนก HR
INSERT INTO public.departments (department_code, department_name, status)
VALUES ('DEPT-HR', 'ฝ่ายทรัพยากรบุคคล (HR)', 'active')
ON CONFLICT (department_name) DO UPDATE SET status = 'active';

-- 2. สร้างตำแหน่ง HR
INSERT INTO public.positions (position_name, department_id, level_type, status)
SELECT 'ผู้จัดการฝ่ายทรัพยากรบุคคล (HR Manager)', id, 'manager', 'active'
FROM public.departments WHERE department_name = 'ฝ่ายทรัพยากรบุคคล (HR)'
ON CONFLICT DO NOTHING;

INSERT INTO public.positions (position_name, department_id, level_type, status)
SELECT 'เจ้าหน้าที่ฝ่ายทรัพยากรบุคคล (HR Officer)', id, 'staff', 'active'
FROM public.departments WHERE department_name = 'ฝ่ายทรัพยากรบุคคล (HR)'
ON CONFLICT DO NOTHING;

-- 3. สร้างบัญชี HR-001 (หัวหน้า HR)
INSERT INTO public.employees (
  employee_code,
  role,
  status,
  full_name,
  email,
  department_id,
  position_id,
  password,
  start_date
)
SELECT 
  'HR-001',
  'hr',
  'active',
  'HR-001',
  'hr001@company.com',
  d.id,
  p.id,
  '123456',
  CURRENT_DATE
FROM public.departments d
LEFT JOIN public.positions p ON p.department_id = d.id AND p.position_name LIKE '%Manager%'
WHERE d.department_name = 'ฝ่ายทรัพยากรบุคคล (HR)'
LIMIT 1
ON CONFLICT (employee_code) DO UPDATE SET
  role = 'hr',
  status = 'active',
  first_name = NULL,
  last_name = NULL,
  full_name = 'HR-001',
  updated_at = NOW();

-- ตั้งค่าให้ HR-001 เป็นหัวหน้าอนุมัติหลักของแผนก HR
UPDATE public.departments
SET approver_id = (SELECT id FROM public.employees WHERE employee_code = 'HR-001' LIMIT 1)
WHERE department_name = 'ฝ่ายทรัพยากรบุคคล (HR)';

-- 4. สร้างบัญชี HR-002 (พนักงาน HR ธรรมดา 1)
INSERT INTO public.employees (
  employee_code,
  role,
  status,
  full_name,
  email,
  department_id,
  position_id,
  l1_approver_id,
  password,
  start_date
)
SELECT 
  'HR-002',
  'hr',
  'active',
  'HR-002',
  'hr002@company.com',
  d.id,
  p.id,
  (SELECT id FROM public.employees WHERE employee_code = 'HR-001' LIMIT 1),
  '123456',
  CURRENT_DATE
FROM public.departments d
LEFT JOIN public.positions p ON p.department_id = d.id AND p.position_name LIKE '%Officer%'
WHERE d.department_name = 'ฝ่ายทรัพยากรบุคคล (HR)'
LIMIT 1
ON CONFLICT (employee_code) DO UPDATE SET
  role = 'hr',
  status = 'active',
  first_name = NULL,
  last_name = NULL,
  full_name = 'HR-002',
  l1_approver_id = (SELECT id FROM public.employees WHERE employee_code = 'HR-001' LIMIT 1),
  updated_at = NOW();

-- 5. สร้างบัญชี HR-003 (พนักงาน HR ธรรมดา 2)
INSERT INTO public.employees (
  employee_code,
  role,
  status,
  full_name,
  email,
  department_id,
  position_id,
  l1_approver_id,
  password,
  start_date
)
SELECT 
  'HR-003',
  'hr',
  'active',
  'HR-003',
  'hr003@company.com',
  d.id,
  p.id,
  (SELECT id FROM public.employees WHERE employee_code = 'HR-001' LIMIT 1),
  '123456',
  CURRENT_DATE
FROM public.departments d
LEFT JOIN public.positions p ON p.department_id = d.id AND p.position_name LIKE '%Officer%'
WHERE d.department_name = 'ฝ่ายทรัพยากรบุคคล (HR)'
LIMIT 1
ON CONFLICT (employee_code) DO UPDATE SET
  role = 'hr',
  status = 'active',
  first_name = NULL,
  last_name = NULL,
  full_name = 'HR-003',
  l1_approver_id = (SELECT id FROM public.employees WHERE employee_code = 'HR-001' LIMIT 1),
  updated_at = NOW();
