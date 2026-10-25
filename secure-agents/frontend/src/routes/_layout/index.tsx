import { createFileRoute } from "@tanstack/react-router";

// The chat itself is rendered (and kept alive) by the _layout route.
export const Route = createFileRoute("/_layout/")({
  component: () => null,
});
