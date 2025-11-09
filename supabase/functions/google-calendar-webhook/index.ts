import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-goog-channel-id, x-goog-channel-token, x-goog-resource-id, x-goog-resource-state, x-goog-resource-uri',
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

async function syncFromGoogleCalendar(accessToken: string, supabase: any, calendarId: string = 'primary') {
  const now = new Date();
  const timeMin = now.toISOString();
  
  // Buscar eventos futuros do Google Calendar
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${timeMin}&orderBy=startTime&singleEvents=true`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch Google Calendar events');
  }

  const data = await response.json();
  const events = data.items || [];

  console.log(`Found ${events.length} events in Google Calendar`);

  // Buscar agendamentos existentes
  const { data: existingAppointments } = await supabase
    .from('appointments')
    .select('*');

  const existingEventIds = new Set(
    existingAppointments
      ?.filter((a: any) => a.google_calendar_event_id)
      .map((a: any) => a.google_calendar_event_id) || []
  );

  // Processar eventos do Google Calendar
  for (const event of events) {
    // Ignorar eventos que não são da nossa aplicação (verificar pelo prefixo "Captação")
    if (!event.summary?.startsWith('Captação -')) {
      continue;
    }

    const eventId = event.id;
    
    // Se o evento já existe no banco, pular
    if (existingEventIds.has(eventId)) {
      continue;
    }

    // Extrair informações do evento
    const startDateTime = new Date(event.start.dateTime || event.start.date);
    const appointmentDate = startDateTime.toISOString().split('T')[0];
    const appointmentTime = startDateTime.toTimeString().split(' ')[0];

    // Extrair informações da descrição
    const description = event.description || '';
    const emailMatch = description.match(/Email: (.+)/);
    const phoneMatch = description.match(/Telefone: (.+)/);
    const companyMatch = description.match(/Empresa: (.+)/);
    const serviceMatch = description.match(/Serviço: (.+)/);
    
    const clientEmail = emailMatch?.[1] || 'email@exemplo.com';
    const clientPhone = phoneMatch?.[1]?.replace('N/A', null);
    const clientCompany = companyMatch?.[1]?.replace('N/A', null);
    
    // Mapear texto do serviço para código do banco
    const serviceText = serviceMatch?.[1] || '';
    const serviceTypeMap: Record<string, string> = {
      'Captação de Vídeo': 'video',
      'Captação de Fotografia': 'photo',
      'Vídeo + Fotografia': 'both'
    };
    const serviceType = serviceTypeMap[serviceText] || 'video';
    const clientName = event.summary.replace('Captação - ', '');

    // Inserir novo agendamento
    const { error } = await supabase
      .from('appointments')
      .insert({
        client_name: clientName,
        client_email: clientEmail,
        client_phone: clientPhone,
        client_company: clientCompany,
        service_type: serviceType,
        appointment_date: appointmentDate,
        appointment_time: appointmentTime,
        google_calendar_event_id: eventId,
        status: 'scheduled',
        user_id: '00000000-0000-0000-0000-000000000000', // User padrão para eventos sincronizados
      });

    if (error) {
      console.error(`Failed to insert appointment for event ${eventId}:`, error);
    } else {
      console.log(`Synced event ${eventId} to database`);
    }
  }

  // Verificar eventos deletados no Google Calendar
  const existingAppointmentsWithEvents = existingAppointments?.filter(
    (a: any) => a.google_calendar_event_id && a.status === 'scheduled'
  ) || [];

  for (const appointment of existingAppointmentsWithEvents) {
    const eventExists = events.some((e: any) => e.id === appointment.google_calendar_event_id);
    
    if (!eventExists) {
      // Evento foi deletado no Google Calendar, cancelar no banco
      await supabase
        .from('appointments')
        .update({ status: 'cancelled' })
        .eq('id', appointment.id);
      
      console.log(`Cancelled appointment ${appointment.id} - event deleted from Google Calendar`);
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verificar se é uma notificação do Google Calendar
    const resourceState = req.headers.get('x-goog-resource-state');
    
    if (resourceState) {
      console.log('Received Google Calendar notification:', resourceState);
    }

    // Buscar config do admin com tokens
    const { data: config, error: configError } = await supabase
      .from('admin_config')
      .select('access_token, google_calendar_refresh_token, google_calendar_id')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .single();

    if (configError || !config?.google_calendar_refresh_token) {
      throw new Error('Google Calendar not connected');
    }

    // Atualizar access token
    const accessToken = await refreshAccessToken(config.google_calendar_refresh_token);
    
    await supabase
      .from('admin_config')
      .update({ access_token: accessToken })
      .eq('id', '00000000-0000-0000-0000-000000000001');

    // Sincronizar eventos do Google Calendar para o banco
    const calendarId = config.google_calendar_id || 'primary';
    await syncFromGoogleCalendar(accessToken, supabase, calendarId);

    return new Response(
      JSON.stringify({ success: true, message: 'Sync completed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in google-calendar-webhook:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});