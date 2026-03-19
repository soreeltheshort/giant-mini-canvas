import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Games from "./pages/Games";
import GameDetail from "./pages/GameDetail";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import FleetBuilder from "./pages/FleetBuilder";
import Battle from "./pages/Battle";
import Manual from "./pages/Manual";
import AdminBattleDebug from "./pages/AdminBattleDebug";
import AdminWeapons from "./pages/AdminWeapons";
import AdminBattleConfig from "./pages/AdminBattleConfig";
import AdminUsers from "./pages/AdminUsers";
import AdminShips from "./pages/AdminShips";
import AdminGames from "./pages/AdminGames";
import MyGames from "./pages/MyGames";
import PlayerGame from "./pages/PlayerGame";
import MapTesting from "./pages/MapTesting";
import MapTestingConfig from "./pages/MapTestingConfig";
import PlanetTesting from "./pages/PlanetTesting";
import RequireRole from "@/components/RequireRole";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/games" element={<Games />} />
            <Route path="/games/:id" element={<GameDetail />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/dashboard" element={<RequireRole roles={["admin", "tester"]}><Dashboard /></RequireRole>} />
            <Route path="/fleet-builder" element={<RequireRole roles={["admin", "tester"]}><FleetBuilder /></RequireRole>} />
            <Route path="/battle" element={<RequireRole roles={["admin", "tester"]}><Battle /></RequireRole>} />
            <Route path="/manual" element={<Manual />} />
            <Route path="/map-testing" element={<RequireRole roles={["admin", "tester"]}><MapTesting /></RequireRole>} />
            <Route path="/map-testing/config" element={<RequireRole roles={["admin", "tester"]}><MapTestingConfig /></RequireRole>} />
            <Route path="/planet-testing" element={<RequireRole roles={["admin", "tester"]}><PlanetTesting /></RequireRole>} />
            <Route path="/admin/battle-debug" element={<AdminBattleDebug />} />
            <Route path="/admin/weapons" element={<AdminWeapons />} />
            <Route path="/admin/battle-config" element={<AdminBattleConfig />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/ships" element={<AdminShips />} />
            <Route path="/admin/games" element={<RequireRole roles={["admin"]}><AdminGames /></RequireRole>} />
            <Route path="/my-games" element={<MyGames />} />
            <Route path="/play/:gameId" element={<PlayerGame />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
