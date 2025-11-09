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

async function createCalendarEvent(accessToken: string, appointment: any) {
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

  const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
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
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get admin config with tokens
    const { data: config, error: configError } = await supabase
      .from('admin_config')
      .select('access_token, google_calendar_refresh_token')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .single();

    if (configError || !config) {
      throw new Error('Google Calendar not connected');
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

    // Get all scheduled appointments
    const { data: appointments, error: appointmentsError } = await supabase
      .from('appointments')
      .select('*')
      .eq('status', 'scheduled')
      .order('appointment_date', { ascending: true })
      .order('appointment_time', { ascending: true });

    if (appointmentsError) {
      throw appointmentsError;
    }

    console.log(`Found ${appointments?.length || 0} scheduled appointments`);

    // Sync each appointment to Google Calendar
    const results = [];
    for (const appointment of appointments || []) {
      try {
        const event = await createCalendarEvent(accessToken, appointment);
        results.push({
          appointmentId: appointment.id,
          eventId: event.id,
          success: true,
        });
        console.log(`Synced appointment ${appointment.id}`);
      } catch (error) {
        console.error(`Failed to sync appointment ${appointment.id}:`, error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.push({
          appointmentId: appointment.id,
          success: false,
          error: errorMessage,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        synced: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in sync-google-calendar:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
