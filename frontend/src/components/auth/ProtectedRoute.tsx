import { Navigate, useLocation } from "react-router-dom";
import { useRequireAuth, type UserRole } from "../../hooks/useAuth";
import Skeleton from "../ui/Skeleton";

type ProtectedRouteProps = {
  children: React.ReactNode;
  /** Required role to access this route */
  role?: UserRole;
  /** Custom redirect path when not authenticated (default based on role) */
  redirectTo?: string;
};

const ROLE_LOGIN_PATHS: Record<UserRole, string> = {
  member: "/login",
  org_admin: "/org-admin/login",
  super_admin: "/super-admin/login",
};

/**
 * ProtectedRoute - Route guard component that checks authentication.
 *
 * Features:
 * - Shows loading skeleton while checking auth
 * - Redirects to login if not authenticated
 * - Checks role if specified
 * - Preserves original location for post-login redirect
 */
export const ProtectedRoute = ({
  children,
  role,
  redirectTo,
}: ProtectedRouteProps) => {
  const location = useLocation();
  const { user, loading } = useRequireAuth(role);

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="w-full max-w-md space-y-4 p-8">
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-10 w-full mt-6" />
        </div>
      </div>
    );
  }

  // Not authenticated - redirect to login
  if (!user) {
    const loginPath = redirectTo || (role ? ROLE_LOGIN_PATHS[role] : "/login");
    return <Navigate to={loginPath} state={{ from: location }} replace />;
  }

  // Authenticated but wrong role - redirect to unauthorized or their dashboard
  if (role && user.role !== role) {
    // Redirect to their appropriate dashboard instead of showing error
    const dashboardPaths: Record<UserRole, string> = {
      member: "/dashboard",
      org_admin: "/org-admin",
      super_admin: "/super-admin",
    };
    return <Navigate to={dashboardPaths[user.role]} replace />;
  }

  // Authorized - render children
  return <>{children}</>;
};

export default ProtectedRoute;
