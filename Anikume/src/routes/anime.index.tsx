import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/anime/")({
  beforeLoad: () => {
    throw redirect({
      to: "/",
    });
  },
  component: () => null,
});
