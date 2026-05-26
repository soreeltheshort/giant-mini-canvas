import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import NamingConventionsSection from "@/components/map-config/NamingConventionsSection";
import MapPlanetNamingSection from "@/components/map-config/MapPlanetNamingSection";

const AdminMapConfig = () => {
  const { isAdmin } = useAuth();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <div className="container max-w-2xl py-8 space-y-10">
        <h1 className="text-xl font-semibold text-accent">Map Config</h1>
        <p className="text-xs text-muted-foreground">
          Manage reusable naming convention lists for planets, fleets and ships, and pick the planet naming convention for the map.
        </p>
        <MapPlanetNamingSection isAdmin={isAdmin} />
        <NamingConventionsSection isAdmin={isAdmin} />
      </div>
    </div>
  );
};

export default AdminMapConfig;
