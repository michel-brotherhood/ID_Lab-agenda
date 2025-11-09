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

async function deleteCalendarEvent(accessToken: string, eventId: string) {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
    {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok && response.status !== 404) {
    const error = await response.text();
    throw new Error(`Failed to delete calendar event: ${error}`);
  }

  return response.status === 204 || response.status === 404;
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

    console.log('Deleting calendar event for appointment:', appointmentId);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get appointment with event ID
    const { data: appointment, error: appointmentError } = await supabase
      .from('appointments')
      .select('google_calendar_event_id')
      .eq('id', appointmentId)
      .single();

    if (appointmentError || !appointment) {
      throw new Error('Appointment not found');
    }

    if (!appointment.google_calendar_event_id) {
      console.log('No calendar event to delete');
      return new Response(
        JSON.stringify({ success: true, message: 'No calendar event to delete' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get admin config with tokens
    const { data: config, error: configError } = await supabase
      .from('admin_config')
      .select('access_token, google_calendar_refresh_token')
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

    // Delete calendar event
    await deleteCalendarEvent(accessToken, appointment.google_calendar_event_id);
    console.log('Calendar event deleted:', appointment.google_calendar_event_id);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in delete-calendar-event:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
