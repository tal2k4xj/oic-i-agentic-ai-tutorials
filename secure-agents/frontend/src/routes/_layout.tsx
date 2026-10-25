import {
  Outlet,
  createFileRoute,
  redirect,
  useRouterState,
} from "@tanstack/react-router";
import { Loading } from "@carbon/react";

import { Header } from "../components/common/Header";
import OrchestrateChat from "../components/watsonx/OrchestrateChat";
import useAuth, { isLoggedIn } from "../hooks/useAuth";

export const Route = createFileRoute("/_layout")({
  component: Layout,
  beforeLoad: async () => {
    if (!isLoggedIn()) {
      throw redirect({
        to: "/login",
      });
    }
  },
});

function Layout() {
  const { isLoading } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isChatRoute = pathname === "/";

  return (
    <div className="relative">
      <Header />
      {/* The WxO chat stays mounted for the whole session and is only hidden on
          other routes, so navigating away and back doesn't break the embed. */}
      <div
        className="fixed inset-x-0 bottom-0 top-12"
        style={{ display: isChatRoute ? "block" : "none" }}
      >
        <OrchestrateChat />
      </div>
      {isLoading ? (
        <Loading />
      ) : (
        !isChatRoute && (
          <div className="mx-auto flex max-w-7xl px-8 pb-24 pt-[47px]">
            <Outlet />
          </div>
        )
      )}
    </div>
  );
}
