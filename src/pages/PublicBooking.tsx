import { useState, useEffect } from 'react';
import { Calendar } from '@/components/Calendar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
const sb = supabase as any;
import { Calendar as CalendarIcon, Clock, User, CheckCircle2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import idlabLogo from '@/assets/idlab-logo.jpg';

const CLIENTS = [
  'Onfire American BBQ',
  'Megabox Atacado',
  'Gio Pizzeria',
  'Maxi Decorações',
  'Natan Decorações',
  'Berton',
  'Nimal Tecnologia',
  'Bemdito',
  'Zoke',
  'Scintille',
  'NaBrasa',
  'Habbibs',
  'Boteco bom malandro',
  'Tiragostin'
];

const AVAILABLE_TIMES = [
  '08:00', '09:00', '10:00', '11:00', '12:00',
  '13:00', '14:00', '15:00', '16:00', '17:00'
];

const SERVICE_TYPES = [
  { value: 'video', label: 'Captação de Vídeo' },
  { value: 'photo', label: 'Captação de Fotografia' },
  { value: 'both', label: 'Vídeo + Fotografia' }
];

export default function PublicBooking() {
  const [step, setStep] = useState(1);
  const [selectedClient, setSelectedClient] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [bookedDates, setBookedDates] = useState<Date[]>([]);
  const [loading, setLoading] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);

  const [formData, setFormData] = useState({
    serviceType: '',
    time: '',
    notes: ''
  });

  useEffect(() => {
    fetchBookedDates();
  }, []);

  const fetchBookedDates = async () => {
    try {
      const { data, error } = await sb
        .from('appointments')
        .select('appointment_date')
        .eq('status', 'scheduled');

      if (error) throw error;

      const dates = (data || []).map(apt => new Date(apt.appointment_date));
      setBookedDates(dates);
    } catch (error) {
      console.error('Error fetching booked dates:', error);
    }
  };

  const filteredClients = CLIENTS.filter(client =>
    client.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleClientSelect = (client: string) => {
    setSelectedClient(client);
    setStep(2);
  };

  const handleSubmit = async () => {
    if (!selectedDate || !selectedClient || !formData.serviceType || !formData.time) {
      toast.error('Por favor, preencha todos os campos obrigatórios');
      return;
    }

    setLoading(true);

    try {
      const { data: appointment, error } = await sb
        .from('appointments')
        .insert({
          appointment_date: format(selectedDate, 'yyyy-MM-dd'),
          appointment_time: formData.time,
          service_type: formData.serviceType,
          notes: formData.notes || null,
          client_name: selectedClient,
          client_email: '',
          client_phone: null,
          client_company: selectedClient,
          status: 'scheduled',
          user_id: null
        })
        .select()
        .single();

      if (error) throw error;

      // Automatically sync with Google Calendar
      if (appointment?.id) {
        try {
          await supabase.functions.invoke('create-calendar-event', {
            body: { appointmentId: appointment.id },
          });
          console.log('Calendar event created automatically');
        } catch (calendarError) {
          console.error('Failed to create calendar event:', calendarError);
          // Don't fail the booking if calendar sync fails
        }
      }

      setBookingSuccess(true);
      toast.success('Agendamento realizado com sucesso!');
    } catch (error: any) {
      console.error('Error creating appointment:', error);
      toast.error(error.message || 'Erro ao realizar agendamento');
    } finally {
      setLoading(false);
    }
  };

  if (bookingSuccess) {
    return (
      <div className="min-h-screen bg-gradient-soft flex items-center justify-center p-4">
        <Card className="max-w-md w-full shadow-card text-center">
          <CardContent className="pt-6">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-primary flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-primary-foreground" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Agendamento Confirmado!</h2>
            <p className="text-muted-foreground mb-4">
              {selectedClient}, sua captação foi agendada para {selectedDate && format(selectedDate, "dd 'de' MMMM", { locale: ptBR })} às {formData.time}h
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              Entraremos em contato para confirmar os detalhes.
            </p>
            <Button onClick={() => window.location.reload()} className="w-full">
              Fazer Novo Agendamento
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-soft">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <img src={idlabLogo} alt="IDLAB" className="w-16 h-16 rounded-lg object-cover" />
            <div>
              <h1 className="text-2xl font-bold text-primary">Agenda Cliente</h1>
              <p className="text-sm text-muted-foreground">Agende sua captação de vídeo e fotografia</p>
            </div>
          </div>
        </div>
      </header>

      {/* Progress Steps */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto mb-8">
          <div className="flex items-center justify-center gap-4">
            <div className={`flex items-center gap-2 ${step >= 1 ? 'text-primary' : 'text-muted-foreground'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 1 ? 'bg-gradient-primary text-primary-foreground' : 'bg-muted'}`}>
                1
              </div>
              <span className="font-medium hidden sm:inline">Identificação</span>
            </div>
            <div className="w-12 h-0.5 bg-border" />
            <div className={`flex items-center gap-2 ${step >= 2 ? 'text-primary' : 'text-muted-foreground'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 2 ? 'bg-gradient-primary text-primary-foreground' : 'bg-muted'}`}>
                2
              </div>
              <span className="font-medium hidden sm:inline">Escolher Data</span>
            </div>
            <div className="w-12 h-0.5 bg-border" />
            <div className={`flex items-center gap-2 ${step >= 3 ? 'text-primary' : 'text-muted-foreground'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 3 ? 'bg-gradient-primary text-primary-foreground' : 'bg-muted'}`}>
                3
              </div>
              <span className="font-medium hidden sm:inline">Detalhes</span>
            </div>
            <div className="w-12 h-0.5 bg-border" />
            <div className={`flex items-center gap-2 ${step >= 4 ? 'text-primary' : 'text-muted-foreground'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 4 ? 'bg-gradient-primary text-primary-foreground' : 'bg-muted'}`}>
                4
              </div>
              <span className="font-medium hidden sm:inline">Confirmar</span>
            </div>
          </div>
        </div>

        {/* Step 1: Select Client */}
        {step === 1 && (
          <div className="max-w-2xl mx-auto">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Quem é você?
                </CardTitle>
                <CardDescription>
                  Digite pelo menos 3 letras para buscar sua empresa
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Digite o nome da sua empresa..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>

                {searchTerm.length >= 3 && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground mb-2">
                      {filteredClients.length} {filteredClients.length === 1 ? 'resultado encontrado' : 'resultados encontrados'}
                    </p>
                    <div className="grid gap-2 max-h-96 overflow-y-auto">
                      {filteredClients.length > 0 ? (
                        filteredClients.map((client, index) => (
                          <button
                            key={client}
                            onClick={() => handleClientSelect(client)}
                            className={cn(
                              "w-full text-left p-4 rounded-lg border-2 transition-all",
                              "hover:border-primary hover:bg-accent",
                              "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center text-primary-foreground font-semibold">
                                {index + 1}
                              </div>
                              <span className="font-medium">{client}</span>
                            </div>
                          </button>
                        ))
                      ) : (
                        <p className="text-center text-muted-foreground py-8">
                          Nenhuma empresa encontrada
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {searchTerm.length < 3 && searchTerm.length > 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Digite mais caracteres para buscar...
                  </p>
                )}

                {searchTerm.length === 0 && (
                  <div className="text-center py-8">
                    <Search className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                    <p className="text-muted-foreground">
                      Digite o nome da sua empresa para começar
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 2: Choose Date */}
        {step === 2 && (
          <div className="max-w-2xl mx-auto space-y-6">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>Cliente Selecionado</CardTitle>
                <CardDescription className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  {selectedClient}
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5" />
                  Escolha a Data da Captação
                </CardTitle>
                <CardDescription>
                  Selecione uma data disponível no calendário
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Calendar
                  selectedDate={selectedDate}
                  onSelectDate={(date) => {
                    setSelectedDate(date);
                    setStep(3);
                  }}
                  bookedDates={bookedDates}
                />
                <Button variant="outline" onClick={() => setStep(1)} className="w-full">
                  Voltar
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 3: Service Details */}
        {step === 3 && (
          <div className="max-w-2xl mx-auto space-y-6">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>Resumo</CardTitle>
                <CardDescription className="space-y-1">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4" />
                    {selectedClient}
                  </div>
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4" />
                    {selectedDate && format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                  </div>
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Detalhes da Captação
                </CardTitle>
                <CardDescription>
                  Escolha o tipo de serviço e horário
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="service">Tipo de Serviço *</Label>
                    <Select value={formData.serviceType} onValueChange={(value) => setFormData({ ...formData, serviceType: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o serviço" />
                      </SelectTrigger>
                      <SelectContent>
                        {SERVICE_TYPES.map(service => (
                          <SelectItem key={service.value} value={service.value}>
                            {service.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="time">Horário *</Label>
                    <Select value={formData.time} onValueChange={(value) => setFormData({ ...formData, time: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o horário" />
                      </SelectTrigger>
                      <SelectContent>
                        {AVAILABLE_TIMES.map(time => (
                          <SelectItem key={time} value={time}>
                            {time}h
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Observações</Label>
                  <Textarea
                    id="notes"
                    placeholder="Informações adicionais sobre a captação"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <Button variant="outline" onClick={() => setStep(2)} className="flex-1">
                    Voltar
                  </Button>
                  <Button onClick={() => setStep(4)} className="flex-1">
                    Continuar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 4: Confirmation */}
        {step === 4 && (
          <div className="max-w-2xl mx-auto">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" />
                  Confirmar Agendamento
                </CardTitle>
                <CardDescription>
                  Revise as informações antes de confirmar
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
                    <CalendarIcon className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <p className="font-medium">Data e Horário</p>
                      <p className="text-sm text-muted-foreground">
                        {selectedDate && format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })} às {formData.time}h
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
                    <User className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <p className="font-medium">Cliente</p>
                      <p className="text-sm text-muted-foreground">{selectedClient}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
                    <Clock className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <p className="font-medium">Serviço</p>
                      <p className="text-sm text-muted-foreground">
                        {SERVICE_TYPES.find(s => s.value === formData.serviceType)?.label}
                      </p>
                    </div>
                  </div>

                  {formData.notes && (
                    <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
                      <div className="w-5 h-5 text-primary mt-0.5" />
                      <div>
                        <p className="font-medium">Observações</p>
                        <p className="text-sm text-muted-foreground">{formData.notes}</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep(3)} className="flex-1">
                    Voltar
                  </Button>
                  <Button onClick={handleSubmit} disabled={loading} className="flex-1">
                    {loading ? 'Confirmando...' : 'Confirmar Agendamento'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
