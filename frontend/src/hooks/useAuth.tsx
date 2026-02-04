import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  fetchWhoAmI,
  fetchMe,
  fetchOrgAdminMe,
  apiLogout,
  orgAdminLogout,
  type MemberProfile,
  type OrgAdminProfile,
  type WhoAmIResponse,
} from "../lib/api";

export type UserRole = "member" | "org_admin" | "super_admin";

export type AuthUser = {
  role: UserRole;
  profile: MemberProfile | OrgAdminProfile | null;
};

type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  error: Error | null;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

type AuthProviderProps = {
  children: ReactNode;
};

/**
 * AuthProvider - Centralized authentication state management.
 *
 * Features:
 * - Checks session on mount and when tab becomes visible
 * - Provides logout and refresh functions
 * - Tracks loading and error states
 */
export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const checkAuth = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const whoami: WhoAmIResponse = await fetchWhoAmI();

      if (!whoami.authenticated || !whoami.role) {
        setUser(null);
        return;
      }

      // Fetch full profile based on role
      let profile: MemberProfile | OrgAdminProfile | null = null;

      if (whoami.role === "member") {
        profile = await fetchMe();
      } else if (whoami.role === "org_admin") {
        profile = await fetchOrgAdminMe();
      }
      // super_admin profile fetching can be added if needed

      setUser({
        role: whoami.role,
        profile,
      });
    } catch (err) {
      setUser(null);
      setError(err instanceof Error ? err : new Error("Auth check failed"));
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      if (user?.role === "org_admin") {
        await orgAdminLogout();
      } else {
        await apiLogout();
      }
    } finally {
      setUser(null);
    }
  }, [user?.role]);

  const refresh = useCallback(() => checkAuth(), [checkAuth]);

  // Check auth on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Re-check when tab becomes visible (detect logout in other tabs)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkAuth();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [checkAuth]);

  return (
    <AuthContext.Provider value={{ user, loading, error, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * useAuth - Hook to access authentication state.
 * Must be used within an AuthProvider.
 */
export const useAuth = (): AuthState => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
};

/**
 * useRequireAuth - Hook that redirects if not authenticated.
 * Returns the auth state for use in components.
 */
export const useRequireAuth = (
  requiredRole?: UserRole,
): AuthState & { isAuthorized: boolean } => {
  const auth = useAuth();

  const isAuthorized =
    !auth.loading &&
    auth.user !== null &&
    (!requiredRole || auth.user.role === requiredRole);

  return { ...auth, isAuthorized };
};
