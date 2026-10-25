import { Button, Stack, Tag } from "@carbon/react";
import { Login as LoginIcon } from "@carbon/icons-react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Logo } from "@/components/common/Logo";
import { isLoggedIn } from "../hooks/useAuth";

export const Route = createFileRoute("/login")({
  component: Login,
  beforeLoad: async () => {
    if (isLoggedIn()) {
      throw redirect({
        to: "/",
      });
    }
  },
});

function Login() {
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingConfig, setIsFetchingConfig] = useState(true);
  const [config, setConfig] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Double-check if user is already logged in (in case beforeLoad didn't catch it)
    if (isLoggedIn()) {
      window.location.href = "/";
      return;
    }

    // Fetch OAuth configuration from backend
    const fetchConfig = async () => {
      setIsFetchingConfig(true);
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL || ""}/api/v1/oauth/config`,
        );
        if (!res.ok) {
          throw new Error(`Failed to fetch config: ${res.status}`);
        }
        const data = await res.json();
        console.log("OAuth config loaded:", data);
        setConfig(data);
        setError(null);
      } catch (err) {
        console.error("Failed to load OAuth config:", err);
        setError(
          "Failed to load authentication configuration. Please ensure the backend is running.",
        );
      } finally {
        setIsFetchingConfig(false);
      }
    };

    fetchConfig();
  }, []);

  const handleLogin = () => {
    if (!config) return;

    setIsLoading(true);

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: config.client_id,
      response_type: "code",
      redirect_uri: config.redirect_uri,
      scope: config.scope,
      state: crypto.randomUUID(), // Generate random state for CSRF protection
      // Always show the IBM Verify sign-in form, so the demo can switch between
      // Alice and Bob even if a Verify browser session is still active.
      prompt: "login",
    });

    // Redirect to IBM Verify
    window.location.href = `${config.authorize_url}?${params.toString()}`;
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-cds-background p-4">
      <div className="w-full max-w-md">
        <Stack gap={6}>
          <div className="flex flex-col items-center text-center">
            <Logo logoOnly logoSize="lg" className="mb-4" />
            <h1 className="text-3xl font-light">Secure AI Agents</h1>
            <p className="mt-2 text-sm text-cds-text-secondary">
              Mitigating the confused deputy problem with watsonx Orchestrate,
              IBM Verify and HashiCorp Vault
            </p>
          </div>

          <div className="border border-cds-border-subtle bg-cds-layer p-6">
            <h2 className="mb-1 text-xl font-semibold">Welcome</h2>
            <p className="mb-6 text-sm text-cds-text-secondary">
              Sign in with your IBM Verify account to continue
            </p>

            {error && (
              <div className="mb-4 bg-cds-notification-background-error p-3 text-sm text-cds-text-error">
                {error}
              </div>
            )}

            <Button
              onClick={handleLogin}
              disabled={!config || isLoading || isFetchingConfig}
              renderIcon={LoginIcon}
              className="w-full max-w-full"
            >
              {isFetchingConfig
                ? "Loading..."
                : isLoading
                  ? "Redirecting..."
                  : "Sign in with IBM Verify"}
            </Button>
          </div>

          <div className="border border-cds-border-subtle bg-cds-layer p-6">
            <h3 className="mb-3 text-sm font-semibold">Demo users</h3>
            <ul className="space-y-3 text-sm">
              <li className="flex items-center justify-between gap-3">
                <span>
                  <strong>Alice</strong>
                  <span className="text-cds-text-secondary"> can view and search products</span>
                </span>
                <Tag type="blue" size="sm" className="m-0 shrink-0">
                  Read-Only
                </Tag>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span>
                  <strong>Bob</strong>
                  <span className="text-cds-text-secondary"> can also create, update and delete</span>
                </span>
                <Tag type="green" size="sm" className="m-0 shrink-0">
                  Read-Write
                </Tag>
              </li>
            </ul>
          </div>

          <p className="text-center text-xs text-cds-text-secondary">
            Secure authentication powered by IBM Verify
          </p>
        </Stack>
      </div>
    </div>
  );
}
