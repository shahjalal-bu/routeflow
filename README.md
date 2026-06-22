# RouteFlow

A direction-finding map app built with [Next.js](https://nextjs.org). Enter two
places, and RouteFlow geocodes them, draws the driving route on an interactive
map, and shows the approximate distance and duration.

## Features

- **Place autocomplete** — debounced address search powered by
  [Nominatim](https://nominatim.org) (OpenStreetMap).
- **Driving directions** — road routing via the
  [OSRM](https://project-osrm.org) public API.
- **Interactive map** — [Leaflet](https://leafletjs.com) with switchable
  Map / Satellite layers (OpenStreetMap & Esri World Imagery tiles).
- **A → B markers** with popups and a fitted route polyline.
- **Distance & duration** stats for the computed route.

## Tech Stack

- Next.js 16 (App Router) + React 19
- TypeScript
- Tailwind CSS v4
- Leaflet for mapping
- [Bun](https://bun.sh) as the package manager / runtime

## Getting Started

Install dependencies:

```bash
bun install
```

Run the development server:

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Scripts

```bash
bun dev      # start the dev server
bun run build  # production build
bun start    # serve the production build
bun run lint   # run ESLint
```

## Project Structure

```
src/app/
├── components/
│   ├── DirectionMap.tsx          # client component: map, search, routing
│   └── DirectionMap.module.css   # scoped styles
├── layout.tsx                    # root layout & metadata
└── page.tsx                      # renders the map
```

Leaflet is dynamically imported inside the component's `useEffect`, so it never
touches `window` during server-side rendering.

## External Services

This app calls public, keyless APIs directly from the browser:

- **Nominatim** — geocoding / autocomplete. Subject to its
  [usage policy](https://operations.osmfoundation.org/policies/nominatim/).
- **OSRM demo server** — routing. Intended for light/demo use.

For production traffic, consider self-hosting these services or using a
commercial provider with an API key.
