-- Tornar user_id nullable na tabela appointments (agendamentos públicos)
ALTER TABLE public.appointments 
ALTER COLUMN user_id DROP NOT NULL;

-- Atualizar registros existentes com user_id inválido
UPDATE public.appointments 
SET user_id = NULL 
WHERE user_id = '00000000-0000-0000-0000-000000000000';