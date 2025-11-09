
-- Migration: 20251108074304

-- Migration: 20251108070858
-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  company TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Create appointments table
CREATE TABLE public.appointments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  service_type TEXT NOT NULL CHECK (service_type IN ('video', 'photo', 'both')),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- Appointments policies
CREATE POLICY "Users can view their own appointments"
  ON public.appointments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own appointments"
  ON public.appointments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own appointments"
  ON public.appointments FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own appointments"
  ON public.appointments FOR DELETE
  USING (auth.uid() = user_id);

-- Admin policies (for admin dashboard)
CREATE POLICY "Admins can view all appointments"
  ON public.appointments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.email = 'admin@idlab.com'
    )
  );

-- Function to validate business rules
CREATE OR REPLACE FUNCTION validate_appointment()
RETURNS TRIGGER AS $$
DECLARE
  day_of_week INTEGER;
  appointment_count INTEGER;
  appointment_datetime TIMESTAMP;
BEGIN
  -- Get day of week (0 = Sunday, 4 = Thursday, 6 = Saturday)
  day_of_week := EXTRACT(DOW FROM NEW.appointment_date);
  
  -- Rule 1: No appointments on Thursdays
  IF day_of_week = 4 THEN
    RAISE EXCEPTION 'Quintas-feiras não estão disponíveis para agendamento';
  END IF;
  
  -- Rule 2: No appointments on weekends
  IF day_of_week = 0 OR day_of_week = 6 THEN
    RAISE EXCEPTION 'Fins de semana não estão disponíveis para agendamento';
  END IF;
  
  -- Rule 3: Check business hours (8h-18h)
  IF NEW.appointment_time < '08:00:00' OR NEW.appointment_time >= '18:00:00' THEN
    RAISE EXCEPTION 'Horário fora do expediente. Funcionamento: Segunda a Sexta, 8h às 18h';
  END IF;
  
  -- Rule 4: Minimum 24 hours in advance
  appointment_datetime := NEW.appointment_date + NEW.appointment_time;
  IF appointment_datetime <= (now() + INTERVAL '24 hours') THEN
    RAISE EXCEPTION 'Agendamentos devem ser feitos com pelo menos 24 horas de antecedência';
  END IF;
  
  -- Rule 5: Maximum 2 appointments per day
  SELECT COUNT(*)
  INTO appointment_count
  FROM public.appointments
  WHERE appointment_date = NEW.appointment_date
    AND status = 'scheduled'
    AND (TG_OP = 'INSERT' OR id != NEW.id);
    
  IF appointment_count >= 2 THEN
    RAISE EXCEPTION 'Limite de 2 captações por dia atingido';
  END IF;
  
  -- Rule 6: No double booking (same date and time)
  IF EXISTS (
    SELECT 1 FROM public.appointments
    WHERE appointment_date = NEW.appointment_date
      AND appointment_time = NEW.appointment_time
      AND status = 'scheduled'
      AND (TG_OP = 'INSERT' OR id != NEW.id)
  ) THEN
    RAISE EXCEPTION 'Este horário já está reservado';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for validation
CREATE TRIGGER validate_appointment_trigger
  BEFORE INSERT OR UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION validate_appointment();

-- Function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', 'Usuário')
  );
  RETURN NEW;
END;
$$;

-- Trigger to create profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Migration: 20251108071815
-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'client');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Add client information fields to appointments table
ALTER TABLE public.appointments
  ADD COLUMN client_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN client_email TEXT NOT NULL DEFAULT '',
  ADD COLUMN client_phone TEXT,
  ADD COLUMN client_company TEXT;

-- Drop old RLS policies
DROP POLICY IF EXISTS "Users can view their own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Users can create their own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Users can update their own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Users can delete their own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Admins can view all appointments" ON public.appointments;

-- Create new RLS policies for appointments
-- Allow anyone to insert appointments (public booking)
CREATE POLICY "Anyone can create appointments"
  ON public.appointments
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Allow anyone to view scheduled appointments (for checking availability)
CREATE POLICY "Anyone can view scheduled appointments"
  ON public.appointments
  FOR SELECT
  TO anon, authenticated
  USING (status = 'scheduled');

-- Allow admins to view all appointments
CREATE POLICY "Admins can view all appointments"
  ON public.appointments
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
  );

-- Allow admins to update appointments
CREATE POLICY "Admins can update appointments"
  ON public.appointments
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to delete appointments
CREATE POLICY "Admins can delete appointments"
  ON public.appointments
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Policy for user_roles table
CREATE POLICY "Users can view their own roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Update the trigger function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert profile
  INSERT INTO public.profiles (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', 'Usuário')
  );
  
  -- Check if this is the admin email
  IF NEW.email = 'admin@idlab.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::app_role);
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'client'::app_role);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Migration: 20251108071902
-- Fix search_path for existing functions
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_appointment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  day_of_week INTEGER;
  appointment_count INTEGER;
  appointment_datetime TIMESTAMP;
BEGIN
  -- Get day of week (0 = Sunday, 4 = Thursday, 6 = Saturday)
  day_of_week := EXTRACT(DOW FROM NEW.appointment_date);
  
  -- Rule 1: No appointments on Thursdays
  IF day_of_week = 4 THEN
    RAISE EXCEPTION 'Quintas-feiras não estão disponíveis para agendamento';
  END IF;
  
  -- Rule 2: No appointments on weekends
  IF day_of_week = 0 OR day_of_week = 6 THEN
    RAISE EXCEPTION 'Fins de semana não estão disponíveis para agendamento';
  END IF;
  
  -- Rule 3: Check business hours (8h-18h)
  IF NEW.appointment_time < '08:00:00' OR NEW.appointment_time >= '18:00:00' THEN
    RAISE EXCEPTION 'Horário fora do expediente. Funcionamento: Segunda a Sexta, 8h às 18h';
  END IF;
  
  -- Rule 4: Minimum 24 hours in advance
  appointment_datetime := NEW.appointment_date + NEW.appointment_time;
  IF appointment_datetime <= (now() + INTERVAL '24 hours') THEN
    RAISE EXCEPTION 'Agendamentos devem ser feitos com pelo menos 24 horas de antecedência';
  END IF;
  
  -- Rule 5: Maximum 2 appointments per day
  SELECT COUNT(*)
  INTO appointment_count
  FROM public.appointments
  WHERE appointment_date = NEW.appointment_date
    AND status = 'scheduled'
    AND (TG_OP = 'INSERT' OR id != NEW.id);
    
  IF appointment_count >= 2 THEN
    RAISE EXCEPTION 'Limite de 2 captações por dia atingido';
  END IF;
  
  -- Rule 6: No double booking (same date and time)
  IF EXISTS (
    SELECT 1 FROM public.appointments
    WHERE appointment_date = NEW.appointment_date
      AND appointment_time = NEW.appointment_time
      AND status = 'scheduled'
      AND (TG_OP = 'INSERT' OR id != NEW.id)
  ) THEN
    RAISE EXCEPTION 'Este horário já está reservado';
  END IF;
  
  RETURN NEW;
END;
$$;


-- Migration: 20251108235922
-- Remover políticas RLS antigas e criar novas sem autenticação
DROP POLICY IF EXISTS "Admins can view all appointments" ON public.appointments;
DROP POLICY IF EXISTS "Admins can update appointments" ON public.appointments;
DROP POLICY IF EXISTS "Admins can delete appointments" ON public.appointments;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;

-- Desabilitar RLS nas tabelas que não precisam mais
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles DISABLE ROW LEVEL SECURITY;

-- Manter RLS na appointments apenas para separar leitura pública
DROP POLICY IF EXISTS "Anyone can view scheduled appointments" ON public.appointments;
DROP POLICY IF EXISTS "Anyone can create appointments" ON public.appointments;

-- Novas políticas simplificadas
CREATE POLICY "Public can create appointments"
  ON public.appointments FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Public can view scheduled appointments"
  ON public.appointments FOR SELECT
  USING (true);

CREATE POLICY "Public can update appointments"
  ON public.appointments FOR UPDATE
  USING (true);

CREATE POLICY "Public can delete appointments"
  ON public.appointments FOR DELETE
  USING (true);

-- Criar tabela para configuração do admin (token secreto)
CREATE TABLE IF NOT EXISTS public.admin_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token TEXT NOT NULL UNIQUE,
  google_calendar_refresh_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Inserir token inicial (você pode mudar depois)
INSERT INTO public.admin_config (access_token) 
VALUES ('idlab-admin-2024')
ON CONFLICT (access_token) DO NOTHING;

-- Desabilitar RLS na config
ALTER TABLE public.admin_config DISABLE ROW LEVEL SECURITY;

-- Migration: 20251109001244
-- Add column to store Google Calendar event ID
ALTER TABLE public.appointments 
ADD COLUMN google_calendar_event_id TEXT;

-- Add index for faster lookups
CREATE INDEX idx_appointments_calendar_event_id 
ON public.appointments(google_calendar_event_id) 
WHERE google_calendar_event_id IS NOT NULL;

-- Migration: 20251109002942
-- Adicionar coluna para armazenar o ID do calendário específico
ALTER TABLE public.admin_config 
ADD COLUMN IF NOT EXISTS google_calendar_id TEXT DEFAULT 'primary';

-- Migration: 20251109004106
-- Tornar user_id nullable na tabela appointments (agendamentos públicos)
ALTER TABLE public.appointments 
ALTER COLUMN user_id DROP NOT NULL;

-- Atualizar registros existentes com user_id inválido
UPDATE public.appointments 
SET user_id = NULL 
WHERE user_id = '00000000-0000-0000-0000-000000000000';

-- Migration: 20251109030032
-- Add admin_token column to admin_config
ALTER TABLE admin_config ADD COLUMN IF NOT EXISTS admin_token TEXT;

-- Set the admin token
UPDATE admin_config 
SET admin_token = 'idlab-admin-2025'
WHERE id = 'ba13854a-fb8a-4b3b-978b-43cabaa4398b';
