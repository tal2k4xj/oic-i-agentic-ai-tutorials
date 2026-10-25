import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { UserPublic } from "../client";
import { Oauth } from "../client";

export type AuthUser = UserPublic & { groups: string[] };

// Verify may emit groups as strings or objects ({ displayName } / { name }).
const normalizeGroups = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return raw ? [String(raw)] : [];
  return raw
    .map((g: any) =>
      typeof g === "string" ? g : g?.displayName || g?.name || g?.id || "",
    )
    .filter(Boolean);
};

// End the embedded watsonx Orchestrate session so the next user starts clean.
// Without this the previous user's WxO session lingers and the next login gets
// "Agent fetching failed" (400s) until it expires.
const teardownOrchestrate = () => {
  try {
    (window as any).wxoLoader?.chatInstance?.destroy?.();
  } catch (e) {
    console.warn("Failed to destroy WxO chat instance", e);
  }
  // Cookie WxO sets on this origin to remember the embedded user
  document.cookie = "embed_user_id=; Max-Age=0; path=/";
  for (const store of [localStorage, sessionStorage]) {
    Object.keys(store)
      .filter((k) => k.toLowerCase().includes("wxo"))
      .forEach((k) => store.removeItem(k));
  }
};

const clearSession = () => {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("id_token");
  teardownOrchestrate();
};

const isLoggedIn = () => {
  return localStorage.getItem("access_token") !== null;
};

const useAuth = () => {
  const navigate = useNavigate();

  // Get user info from IBM Verify token
  const { data: user, isLoading } = useQuery<AuthUser | null, Error>({
    queryKey: ["currentUser"],
    queryFn: async () => {
      try {
        const token = localStorage.getItem("access_token");
        if (!token) {
          return null;
        }

        // Decode JWT token to get user info (without verification - backend will verify)
        const payload = JSON.parse(atob(token.split(".")[1]));

        // Check if token is expired
        if (payload.exp && payload.exp < Date.now() / 1000) {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          localStorage.removeItem("id_token");
          navigate({ to: "/login" });
          return null;
        }

        // Return user info from token
        return {
          id: payload.sub || "",
          email: payload.unique_name || payload.email || null,
          full_name: payload.name || null,
          preferred_username: payload.preferred_username || null,
          unique_name: payload.unique_name || null,
          upn: payload.upn || null,
          groups: normalizeGroups(payload.groups),
        } as AuthUser;
      } catch (err) {
        console.error("Error decoding token:", err);
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("id_token");
        navigate({ to: "/login" });
        return null;
      }
    },
    enabled: isLoggedIn(),
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const accessToken = localStorage.getItem("access_token");
      const refreshToken = localStorage.getItem("refresh_token");

      if (!accessToken) {
        return null;
      }

      try {
        // Call backend logout endpoint to revoke tokens with IBM Verify
        await Oauth.logout({
          query: {
            access_token: accessToken,
            refresh_token: refreshToken || undefined,
          },
        });
      } catch (error) {
        // Log error but continue with local logout
        console.error("Error revoking tokens with IBM Verify:", error);
      }

      return null;
    },
    onSuccess: () => {
      clearSession();
      // Full reload so the embedded WxO chat is torn down completely.
      // The login page uses prompt=login, so IBM Verify always asks for credentials.
      window.location.href = "/login";
    },
    onError: () => {
      clearSession();
      window.location.href = "/login";
    },
  });

  const logout = () => {
    logoutMutation.mutate();
  };

  return {
    logout,
    user,
    isLoading,
  };
};

export { isLoggedIn };
export default useAuth;
