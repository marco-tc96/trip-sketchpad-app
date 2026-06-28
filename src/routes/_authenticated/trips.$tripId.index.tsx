import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/trips/$tripId/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/trips/$tripId/timeline", params });
  },
});