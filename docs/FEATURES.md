# Features & entitlements

Capabilities are driven by database entitlements (`subscription_plans` +
`plan_features`), resolved server-side via `app.tenant_has_feature()`. The
front end never decides entitlement. The marketing defaults live in
`app/modules/marketing/data/plans.ts` and are mirrored by `db/migrations/0010`.

## Plans (launch defaults — editable by superadmin)

|                               | Starter | Growth | Marketplace |
| ----------------------------- | ------- | ------ | ----------- |
| Price/mo (INR)                | 1,499   | 3,499  | 7,999       |
| Products                      | 500     | 5,000  | Unlimited*  |
| Staff                         | 2       | 15     | 50          |
| Vendors                       | —       | —      | 100         |
| Storefront + dashboard        | ✓       | ✓      | ✓           |
| Online payments + COD         | ✓       | ✓      | ✓           |
| Coupons, zones, reports       | ✓       | ✓      | ✓           |
| Delivery team + live tracking | —       | ✓      | ✓           |
| Operational analytics         | —       | ✓      | ✓           |
| Multi-vendor marketplace      | —       | —      | ✓           |
| Commissions + settlements     | —       | —      | ✓           |
| Advanced reporting            | —       | —      | ✓           |

\* subject to fair-use / tier caps. Prices are indicative launch pricing and are
configurable; gateway and third-party charges are billed separately by those
providers. An Enterprise/Custom tier is available on request.

## Critical business rules (enforced as features ship)

A Starter merchant cannot unlock Growth-only tracking by changing a URL or API
payload (server-side entitlement). Suspension blocks new orders but preserves
financial history. Stock cannot go negative unless overselling is enabled. Order
totals are computed server-side. Duplicate webhooks cannot create duplicate paid
orders. Plan upgrades preserve catalog and orders. See master spec §18 — each
rule maps to a schema constraint and/or server check, tracked in `PHASES.md`.
