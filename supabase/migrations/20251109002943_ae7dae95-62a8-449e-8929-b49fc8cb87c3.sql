-- Adicionar coluna para armazenar o ID do calendário específico
ALTER TABLE public.admin_config 
ADD COLUMN IF NOT EXISTS google_calendar_id TEXT DEFAULT 'primary';