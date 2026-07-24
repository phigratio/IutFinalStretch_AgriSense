# Frontend Plan — TailAdmin-style Admin Panel

Rebuild the existing `frontend/` React app so it looks and behaves like
[TailAdmin](https://demo.tailadmin.com/) — the free Tailwind dashboard template —
while staying wired to our Express `users` API.

## Reference

- Demo: https://demo.tailadmin.com/
- HTML template repo (linked): TailAdmin/tailadmin-free-tailwind-dashboard-template
- React equivalent we model on: TailAdmin/free-react-tailwind-admin-dashboard

## Tech stack (additions to current Vite + React 19 + TS app)

| Concern        | Choice                                   |
| -------------- | ---------------------------------------- |
| Styling        | **Tailwind CSS v4** (`@tailwindcss/vite`) |
| Routing        | **react-router-dom v7**                  |
| Charts         | **ApexCharts** via `react-apexcharts`    |
| Font           | **Outfit** (TailAdmin's font)            |
| Dark mode      | class-based, persisted to localStorage   |

## Design tokens (match TailAdmin)

- Brand color `brand-500 = #465fff` (indigo/blue), full 25–950 scale.
- Cards: `rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]`.
- Font family Outfit; gray-scale text tokens; success/warning/error accents.
- Full light + dark theme support toggled by a `dark` class on `<html>`.

## Architecture

```
src/
├── main.tsx                 # Router + ThemeProvider + SidebarProvider
├── index.css                # Tailwind v4 + @theme tokens + base styles
├── context/
│   ├── ThemeContext.tsx     # light/dark, persisted
│   └── SidebarContext.tsx   # expanded / mobile-open / hovered state
├── layout/
│   ├── AppLayout.tsx        # sidebar + header + <Outlet/>
│   ├── AppSidebar.tsx       # collapsible nav, active-route highlight
│   ├── AppHeader.tsx        # search, theme toggle, notifications, user menu
│   └── Backdrop.tsx         # mobile drawer backdrop
├── components/
│   ├── common/
│   │   ├── PageMeta.tsx     # sets document title
│   │   ├── PageBreadcrumb.tsx
│   │   ├── ThemeToggleButton.tsx
│   │   └── GridShape.tsx    # auth decorative bg
│   ├── header/
│   │   ├── UserDropdown.tsx
│   │   └── NotificationDropdown.tsx
│   ├── ecommerce/
│   │   ├── EcommerceMetrics.tsx   # Customers / Orders metric cards
│   │   ├── MonthlySalesChart.tsx  # ApexCharts bar
│   │   ├── MonthlyTarget.tsx      # ApexCharts radial
│   │   ├── StatisticsChart.tsx    # ApexCharts area/line
│   │   ├── DemographicCard.tsx
│   │   └── RecentOrders.tsx
│   └── tables/
│       └── UsersTable.tsx   # wired to /api/users (create + delete)
├── icons/index.tsx          # inline SVG icon components
├── api/users.ts             # existing typed client (kept)
└── pages/
    ├── Dashboard.tsx        # ecommerce dashboard (metrics + charts + orders)
    ├── Users.tsx            # real CRUD against backend (our data)
    ├── Profile.tsx          # profile card layout
    ├── SignIn.tsx           # auth form (UI only)
    └── NotFound.tsx         # 404
```

## Layout behavior

- **Sidebar**: expanded (w-72) ↔ collapsed (w-20 icon-only) on desktop; off-canvas
  drawer on mobile with backdrop. Expands on hover when collapsed. Active route
  highlighted. Sections: Menu (Dashboard, Users, Profile, Calendar), Others.
- **Header**: hamburger toggle, search box, dark-mode toggle, notification bell
  with dropdown, user avatar with dropdown menu. Sticky, blurred border.
- **Content**: max-width container, responsive grid of cards.

## Data strategy

- **Dashboard** charts/metrics use representative demo data (like TailAdmin's
  ecommerce demo) — no backend equivalent for sales figures.
- **Users page** is fully wired to the Express backend (`GET/POST/DELETE
  /api/users`) — this is the real, functional part, styled as a TailAdmin table.
- The number in the "Customers" metric card reflects the live user count.

## Build steps

1. Add deps: `react-router-dom`, `apexcharts`, `react-apexcharts`,
   `tailwindcss`, `@tailwindcss/vite`.
2. Wire Tailwind v4 into `vite.config.ts`; rewrite `index.css` with `@theme`
   tokens + Outfit font; add font link to `index.html`.
3. Contexts: `ThemeContext`, `SidebarContext`.
4. Icons: small inline-SVG set used across the UI.
5. Layout: `AppLayout`, `AppSidebar`, `AppHeader`, `Backdrop`, header dropdowns.
6. Common components: `PageMeta`, `PageBreadcrumb`, `ThemeToggleButton`.
7. Ecommerce components (metrics, 3 charts, demographic, recent orders).
8. `UsersTable` wired to backend; `Users` page.
9. Pages: `Dashboard`, `Users`, `Profile`, `SignIn`, `NotFound`.
10. Router in `main.tsx` with `AppLayout` wrapping app routes; standalone auth/404.
11. Verify: `npm run typecheck` + `npm run build`, then run dev and sanity-check.

## Out of scope (free-template parity we intentionally skip)

- Full component gallery pages (alerts/badges/avatars/carousels catalog).
- Calendar drag-and-drop (link present, page is a simple placeholder).
- Real authentication (SignIn is UI-only, no session).
