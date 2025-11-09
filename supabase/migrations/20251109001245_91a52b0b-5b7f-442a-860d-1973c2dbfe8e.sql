-- Add column to store Google Calendar event ID
ALTER TABLE public.appointments 
ADD COLUMN google_calendar_event_id TEXT;

-- Add index for faster lookups
CREATE INDEX idx_appointments_calendar_event_id 
ON public.appointments(google_calendar_event_id) 
WHERE google_calendar_event_id IS NOT NULL;