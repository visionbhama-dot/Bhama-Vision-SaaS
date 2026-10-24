# Delivery tracking (Growth plan)

## Model

Tables: `delivery_partners` (riders), `delivery_assignments`,
`delivery_location_updates`. Phase 6 implements manual assignment first;
distance/availability-based suggestions are designed for later.

## Live location — honest limitations

A browser/PWA **cannot** guarantee uninterrupted GPS when the phone is locked,
the app is backgrounded, or the browser is terminated. We therefore:

- implement working **foreground** tracking with explicit location permission;
- show honest UI states: tracking active, **stale location**, connection lost;
- start updates only when a delivery is accepted/active, and **stop** when it
  ends, is cancelled, or the rider stops the session;
- throttle updates with sensible intervals + movement thresholds (no constant
  GPS spam).

We do **not** claim guaranteed background tracking. Delivery logic is kept
modular so a future native rider app can provide more reliable background
updates.

## Authorization & privacy

`delivery_location_updates` is protected by RLS so coordinates are readable only
by: the **assigned rider**, **tenant staff**, and the **order's customer** — for
the active delivery only. A rider's location is never exposed to unrelated
customers (master rule K). Set a retention limit and purge old pings (cron /
scheduled Worker).

## Realtime

Authorized updates stream via Supabase Realtime with channel authorization and
reconnect handling, plus a DB-query fallback when realtime is unavailable.
