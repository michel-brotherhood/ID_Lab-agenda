import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import PublicBooking from "./pages/PublicBooking";
import AdminPanel from "./pages/AdminPanel";
import CalendarSettings from "./pages/CalendarSettings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Rota Pública - Cliente */}
          <Route path="/" element={<PublicBooking />} />
          <Route path="/agendar" element={<PublicBooking />} />
          
          {/* Rota da Agência - Interno */}
          <Route path="/agencia" element={<AdminPanel />} />
          <Route path="/agencia/configuracoes" element={<CalendarSettings />} />
          
          {/* Catch-all */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
