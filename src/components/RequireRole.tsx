import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";

interface RequireRoleProps {
  children: ReactNode;
  /** User must have at least one of these roles */
  roles: ("admin" | "tester")[];
}

const RequireRole = ({ children, roles }: RequireRoleProps) => {
  const { user, loading, isAdmin, isTester } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container py-20 text-center text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  const hasRole =
    (roles.includes("admin") && isAdmin) ||
    (roles.includes("tester") && isTester);

  if (!hasRole) return <Navigate to="/" replace />;

  return <>{children}</>;
};

export default RequireRole;
