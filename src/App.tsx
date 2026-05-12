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
import BattleReplay from "./pages/BattleReplay";
import Manual from "./pages/Manual";
import AdminBattleDebug from "./pages/AdminBattleDebug";
import AdminWeapons from "./pages/AdminWeapons";
import AdminBattleConfig from "./pages/AdminBattleConfig";
import AdminUsers from "./pages/AdminUsers";
import AdminShips from "./pages/AdminShips";
import AdminFacilities from "./pages/AdminFacilities";
import AdminGames from "./pages/AdminGames";
import MyGames from "./pages/MyGames";
import TesterDashboard from "./pages/TesterDashboard";
import PlayerGame from "./pages/PlayerGame";
import UIShowcase from "./pages/UIShowcase";
import MapTesting from "./pages/MapTesting";
import MapTestingConfig from "./pages/MapTestingConfig";
import PlanetTesting from "./pages/PlanetTesting";
import FleetTesting from "./pages/FleetTesting";
import RequireRole from "@/components/RequireRole";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import AdminBlog from "./pages/AdminBlog";
import NotFound from "./pages/NotFound";
import NewGameMenu from "./pages/NewGameMenu";
import AdminCutscenes from "./pages/AdminCutscenes";
import AdminCutsceneEditor from "./pages/AdminCutsceneEditor";
import CutscenePlayer from "./pages/CutscenePlayer";
import AdminImages from "./pages/AdminImages";
import AdminSounds from "./pages/AdminSounds";

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
            <Route path="/battle-replay/:runId" element={<BattleReplay />} />
            <Route path="/manual" element={<Manual />} />
            <Route path="/map-testing" element={<RequireRole roles={["admin", "tester"]}><MapTesting /></RequireRole>} />
            <Route path="/map-testing/config" element={<RequireRole roles={["admin", "tester"]}><MapTestingConfig /></RequireRole>} />
            <Route path="/planet-testing" element={<RequireRole roles={["admin", "tester"]}><PlanetTesting /></RequireRole>} />
            <Route path="/fleet-testing" element={<RequireRole roles={["admin", "tester"]}><FleetTesting /></RequireRole>} />
            <Route path="/admin/battle-debug" element={<AdminBattleDebug />} />
            <Route path="/admin/weapons" element={<AdminWeapons />} />
            <Route path="/admin/battle-config" element={<AdminBattleConfig />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/ships" element={<AdminShips />} />
            <Route path="/admin/facilities" element={<RequireRole roles={["admin", "tester"]}><AdminFacilities /></RequireRole>} />
            <Route path="/admin/games" element={<RequireRole roles={["admin"]}><AdminGames /></RequireRole>} />
            <Route path="/my-games" element={<MyGames />} />
            <Route path="/tester" element={<RequireRole roles={["admin","tester"]}><TesterDashboard /></RequireRole>} />
            <Route path="/play/:gameId" element={<PlayerGame />} />
            <Route path="/ui-showcase" element={<UIShowcase />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogPost />} />
            <Route path="/admin/blog" element={<RequireRole roles={["admin"]}><AdminBlog /></RequireRole>} />
            <Route path="/new-game" element={<NewGameMenu />} />
            <Route path="/admin/cutscenes" element={<RequireRole roles={["admin"]}><AdminCutscenes /></RequireRole>} />
            <Route path="/admin/cutscenes/:id" element={<RequireRole roles={["admin"]}><AdminCutsceneEditor /></RequireRole>} />
            <Route path="/cutscenes/:id/play" element={<CutscenePlayer />} />
            <Route path="/admin/images" element={<RequireRole roles={["admin"]}><AdminImages /></RequireRole>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
