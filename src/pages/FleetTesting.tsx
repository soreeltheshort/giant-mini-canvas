import Header from "@/components/Header";
import Footer from "@/components/Footer";

const FleetTesting = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container py-16">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-heading text-2xl font-bold text-foreground">
            Fleet Testing
          </h1>
        </div>
        <p className="text-muted-foreground">
          Isolated fleet simulation workspace. Configuration coming soon.
        </p>
      </div>
      <Footer />
    </div>
  );
};

export default FleetTesting;
