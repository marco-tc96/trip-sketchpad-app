import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // The "Viaggi" tab (trips list) must ALWAYS open scrolled to the very
    // top — both on a fresh app load and every single time the tab is
    // re-selected — never resuming a previously-scrolled position. The
    // route itself already does an explicit `window.scrollTo(0, 0)` on
    // mount for exactly that reason (see trips.index.tsx), but the router's
    // OWN built-in scroll restoration above (`scrollRestoration: true`,
    // needed elsewhere — e.g. coming back to a trip's timeline at the same
    // spot you left it) runs its restore in a separate pass keyed by this
    // location's history entry, and that restore consistently won the race
    // against the route's own scrollTo, snapping the page back down to
    // wherever it happened to be scrolled the last time this same tab/entry
    // was visited. Returning a fresh, never-reused key for the trips list
    // specifically means there is simply no saved position for the router
    // to ever restore for it — every visit starts with a clean slate, no
    // race, no exception logic needed on the route side. Every other route
    // keeps the router's default key (`location.state.key`), so back/
    // forward scroll memory elsewhere in the app is unaffected.
    getScrollRestorationKey: (location) =>
      location.pathname === "/trips" || location.pathname === "/trips/"
        ? `trips-list-always-top-${Math.random()}`
        : (location.state.key ?? location.href),
  });

  return router;
};
