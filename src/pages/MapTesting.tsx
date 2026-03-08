import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const MapTesting = () => {
  const { user, loading, isAdmin, isTester } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  if (loading) {
    return <div className="min-h-screen bg-background"><Header /><div className="container py-20 text-center text-muted-foreground">Loading...</div><Footer /></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container py-16">
        <h1 className="font-heading text-2xl font-bold text-foreground">Map & Fleet Movement Testing</h1>
        <p className="mt-4 text-muted-foreground">Map and fleet movement testing tools will appear here.</p>
      </div>
      <Footer />
    </div>
  );
};

export default MapTesting;
