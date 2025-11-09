import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Calendar as CalendarIcon, Trash2, User, Building, Mail, Phone, Clock, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface Appointment {
  id: string;
  appointment_date: string;
  appointment_time: string;
  service_type: string;
  notes: string | null;
  status: string;
  client_name: string;
  client_email: string;
  client_phone: string | null;
  client_company: string | null;
}

const SERVICE_TYPES = {
  video: 'Captação de Vídeo',
  foto: 'Captação de Fotografia',
  ambos: 'Vídeo + Fotografia'
};

export default function AdminPanel() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [validToken, setValidToken] = useState(false);
  const [isConnectedToGoogle, setIsConnectedToGoogle] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    verifyToken();
  }, [token]);

  useEffect(() => {
    if (validToken) {
      fetchAppointments();
      checkGoogleConnection();
    }

    // Check if just connected
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('connected') === 'true') {
      setIsConnectedToGoogle(true);
      toast.success('Conectado ao Google Calendar com sucesso!');
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname + '?token=' + token);
    }
  }, [validToken, token]);

  const verifyToken = async () => {
    if (!token) {
      navigate('/');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('admin_config')
        .select('access_token')
        .eq('access_token', token)
        .maybeSingle();

      if (error || !data) {
        toast.error('Link de acesso inválido');
        navigate('/');
        return;
      }

      setValidToken(true);
    } catch (error) {
      console.error('Error verifying token:', error);
      navigate('/');
    }
  };

  const fetchAppointments = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('status', 'scheduled')
        .order('appointment_date', { ascending: true })
        .order('appointment_time', { ascending: true });

      if (error) {
        toast.error('Erro ao carregar agendamentos');
        console.error('Error fetching appointments:', error);
      } else {
        setAppointments(data || []);
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Erro ao carregar agendamentos');
    } finally {
      setLoading(false);
    }
  };

  const checkGoogleConnection = async () => {
    const { data, error } = await supabase
      .from('admin_config')
      .select('google_calendar_refresh_token')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .single();

    if (!error && data?.google_calendar_refresh_token) {
      setIsConnectedToGoogle(true);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      // First, delete from Google Calendar
      try {
        await supabase.functions.invoke('delete-calendar-event', {
          body: { appointmentId: id },
        });
        console.log('Calendar event deleted automatically');
      } catch (calendarError) {
        console.error('Failed to delete calendar event:', calendarError);
        // Continue with appointment deletion even if calendar sync fails
      }

      // Then delete the appointment
      const { error } = await supabase
        .from('appointments')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Agendamento cancelado');
      fetchAppointments();
    } catch (error) {
      console.error('Error deleting appointment:', error);
      toast.error('Erro ao cancelar agendamento');
    }
  };

  const connectToGoogleCalendar = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('google-calendar-auth', {
        body: {},
      });

      if (error) throw error;

      if (data?.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (error) {
      console.error('Error connecting to Google Calendar:', error);
      toast.error('Erro ao conectar com Google Calendar');
    }
  };

  const syncWithGoogleCalendar = async () => {
    setIsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-google-calendar', {
        body: {},
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(`${data.synced} agendamento(s) sincronizado(s) com sucesso!`);
        if (data.failed > 0) {
          toast.error(`${data.failed} agendamento(s) falharam na sincronização`);
        }
      }
    } catch (error) {
      console.error('Error syncing with Google Calendar:', error);
      toast.error('Erro ao sincronizar com Google Calendar');
    } finally {
      setIsSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-soft flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-primary animate-pulse" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!validToken) {
    return null;
  }

  // Group appointments by date
  const appointmentsByDate = appointments.reduce((acc, apt) => {
    const date = apt.appointment_date;
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(apt);
    return acc;
  }, {} as Record<string, Appointment[]>);

  return (
    <div className="min-h-screen bg-gradient-soft">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-primary flex items-center justify-center">
                  <CalendarIcon className="w-5 h-5 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="text-xl font-bold">IDLAB - Painel da Agência</h1>
                  <p className="text-sm text-muted-foreground">Gerenciar Captações</p>
                </div>
              </div>
              <div className="flex gap-2">
                {!isConnectedToGoogle ? (
                  <Button onClick={connectToGoogleCalendar} variant="outline" className="gap-2">
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z"/>
                    </svg>
                    Conectar Google Calendar
                  </Button>
                ) : (
                  <Button 
                    onClick={syncWithGoogleCalendar} 
                    disabled={isSyncing}
                    variant="outline"
                    className="gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    {isSyncing ? 'Sincronizando...' : 'Sincronizar Google Calendar'}
                  </Button>
                )}
              </div>
            </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-5xl mx-auto">
          <div className="mb-6">
            <h2 className="text-2xl font-bold mb-2">Captações Agendadas</h2>
            <p className="text-muted-foreground">
              {appointments.length} {appointments.length === 1 ? 'agendamento' : 'agendamentos'} pendente{appointments.length !== 1 ? 's' : ''}
            </p>
          </div>

          {appointments.length === 0 ? (
            <Card className="shadow-card">
              <CardContent className="py-12 text-center">
                <CalendarIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">Nenhum agendamento encontrado</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {Object.entries(appointmentsByDate).map(([date, dateAppointments]) => (
                <div key={date}>
                  <div className="mb-3 flex items-center gap-2">
                    <CalendarIcon className="w-5 h-5 text-primary" />
                    <h3 className="text-lg font-semibold capitalize">
                      {format(new Date(date), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                    </h3>
                    <Badge variant="secondary">{dateAppointments.length}</Badge>
                  </div>
                  <div className="space-y-3">
                    {dateAppointments.map((appointment) => (
                      <Card key={appointment.id} className="shadow-card">
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div>
                              <CardTitle className="flex items-center gap-2">
                                <Clock className="w-5 h-5" />
                                {appointment.appointment_time.slice(0, 5)}h
                              </CardTitle>
                              <CardDescription>
                                {SERVICE_TYPES[appointment.service_type as keyof typeof SERVICE_TYPES]}
                              </CardDescription>
                            </div>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="destructive" size="icon">
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Cancelar agendamento?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Esta ação não pode ser desfeita. O agendamento será cancelado permanentemente.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Não</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDelete(appointment.id)}>
                                    Sim, cancelar
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="grid md:grid-cols-2 gap-4">
                            <div className="flex items-start gap-2">
                              <User className="w-4 h-4 text-muted-foreground mt-0.5" />
                              <div>
                                <p className="text-sm font-medium">{appointment.client_name}</p>
                                {appointment.client_company && (
                                  <p className="text-xs text-muted-foreground">{appointment.client_company}</p>
                                )}
                              </div>
                            </div>
                            {appointment.client_email && (
                              <div className="flex items-start gap-2">
                                <Mail className="w-4 h-4 text-muted-foreground mt-0.5" />
                                <p className="text-sm">{appointment.client_email}</p>
                              </div>
                            )}
                          </div>
                          {appointment.client_phone && (
                            <div className="flex items-center gap-2">
                              <Phone className="w-4 h-4 text-muted-foreground" />
                              <p className="text-sm">{appointment.client_phone}</p>
                            </div>
                          )}
                          {appointment.notes && (
                            <div className="pt-2 border-t">
                              <p className="text-sm text-muted-foreground">{appointment.notes}</p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
