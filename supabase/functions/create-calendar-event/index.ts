import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to refresh access token');
  }

  const data = await response.json();
  return data.access_token;
}

async function createCalendarEvent(accessToken: string, appointment: any, calendarId: string = 'primary') {
  const startDateTime = `${appointment.appointment_date}T${appointment.appointment_time}`;
  const endTime = new Date(`${startDateTime}`);
  endTime.setHours(endTime.getHours() + 1);

  const event = {
    summary: `Captação - ${appointment.client_name}`,
    description: `
Empresa: ${appointment.client_company || 'N/A'}
Email: ${appointment.client_email}
Telefone: ${appointment.client_phone || 'N/A'}
Serviço: ${appointment.service_type}
${appointment.notes ? `\nNotas: ${appointment.notes}` : ''}
    `.trim(),
    start: {
      dateTime: startDateTime,
      timeZone: 'America/Sao_Paulo',
    },
    end: {
      dateTime: endTime.toISOString().slice(0, -5),
      timeZone: 'America/Sao_Paulo',
    },
    attendees: [
      { email: appointment.client_email },
    ],
  };

  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create calendar event: ${error}`);
  }

  return await response.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { appointmentId } = await req.json();

    if (!appointmentId) {
      throw new Error('appointmentId is required');
    }

    console.log('Creating calendar event for appointment:', appointmentId);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get appointment details
    const { data: appointment, error: appointmentError } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', appointmentId)
      .single();

    if (appointmentError || !appointment) {
      throw new Error('Appointment not found');
    }

    // Check if already synced
    if (appointment.google_calendar_event_id) {
      console.log('Event already synced:', appointment.google_calendar_event_id);
      return new Response(
        JSON.stringify({ success: true, eventId: appointment.google_calendar_event_id, alreadySynced: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get admin config with tokens
    const { data: config, error: configError } = await supabase
      .from('admin_config')
      .select('access_token, google_calendar_refresh_token, google_calendar_id')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .single();

    if (configError || !config) {
      console.log('Google Calendar not connected');
      return new Response(
        JSON.stringify({ success: false, error: 'Google Calendar not connected' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!config.google_calendar_refresh_token) {
      throw new Error('No refresh token available');
    }

    // Refresh access token
    console.log('Refreshing access token...');
    const accessToken = await refreshAccessToken(config.google_calendar_refresh_token);

    // Update access token in database
    await supabase
      .from('admin_config')
      .update({ access_token: accessToken })
      .eq('id', '00000000-0000-0000-0000-000000000001');

    // Create calendar event
    const calendarId = config.google_calendar_id || 'primary';
    const event = await createCalendarEvent(accessToken, appointment, calendarId);
    console.log('Calendar event created:', event.id);

    // Store event ID in appointment
    await supabase
      .from('appointments')
      .update({ google_calendar_event_id: event.id })
      .eq('id', appointmentId);

    return new Response(
      JSON.stringify({ success: true, eventId: event.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in create-calendar-event:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
