import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import NamingConventionsSection from "@/components/map-config/NamingConventionsSection";

const AdminMapConfig = () => {
  const { isAdmin } = useAuth();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <div className="container max-w-2xl py-8 space-y-10">
        <h1 className="text-xl font-semibold text-accent">Map Config</h1>
        <p className="text-xs text-muted-foreground">
          Manage reusable naming conventions for planets and fleets. These lists are assigned to factions and used during map generation.
        </p>
        <NamingConventionsSection isAdmin={isAdmin} />
      </div>
    </div>
  );
};

export default AdminMapConfig;
