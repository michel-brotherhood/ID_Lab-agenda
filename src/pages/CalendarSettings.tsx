import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { Calendar as CalendarIcon, ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';

export default function CalendarSettings() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [validToken, setValidToken] = useState(false);
  const [calendarId, setCalendarId] = useState('primary');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    verifyToken();
  }, [token]);

  useEffect(() => {
    if (validToken) {
      fetchCalendarId();
    }
  }, [validToken]);

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

  const fetchCalendarId = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('admin_config')
        .select('google_calendar_id')
        .eq('id', '00000000-0000-0000-0000-000000000001')
        .single();

      if (error) throw error;

      setCalendarId(data?.google_calendar_id || 'primary');
    } catch (error) {
      console.error('Error fetching calendar ID:', error);
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const { error } = await supabase
        .from('admin_config')
        .update({ google_calendar_id: calendarId })
        .eq('id', '00000000-0000-0000-0000-000000000001');

      if (error) throw error;

      toast.success('Configurações salvas com sucesso!');
      navigate(`/agencia/${token}`);
    } catch (error) {
      console.error('Error saving calendar ID:', error);
      toast.error('Erro ao salvar configurações');
    } finally {
      setSaving(false);
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

  return (
    <div className="min-h-screen bg-gradient-soft">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(`/agencia/${token}`)}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="w-10 h-10 rounded-lg bg-gradient-primary flex items-center justify-center">
              <CalendarIcon className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Configurações do Calendário</h1>
              <p className="text-sm text-muted-foreground">Escolha qual agenda usar</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>ID do Calendário Google</CardTitle>
              <CardDescription>
                Configure qual calendário do Google Calendar será usado para os agendamentos
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="calendar-id">ID do Calendário</Label>
                <Input
                  id="calendar-id"
                  value={calendarId}
                  onChange={(e) => setCalendarId(e.target.value)}
                  placeholder="primary ou email@exemplo.com"
                />
                <p className="text-sm text-muted-foreground">
                  Use "primary" para sua agenda principal ou o email da agenda específica (exemplo: empresa@gmail.com)
                </p>
              </div>

              <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                <h3 className="font-semibold text-sm">Como encontrar o ID da agenda:</h3>
                <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Abra o Google Calendar no computador</li>
                  <li>Na lista de calendários à esquerda, clique nos três pontos ao lado da agenda desejada</li>
                  <li>Clique em "Configurações e compartilhamento"</li>
                  <li>Role até "Integrar agenda" e copie o "ID do calendário"</li>
                </ol>
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  onClick={handleSave}
                  disabled={saving || !calendarId}
                  className="gap-2"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Salvando...' : 'Salvar Configurações'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate(`/agencia/${token}`)}
                >
                  Cancelar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}