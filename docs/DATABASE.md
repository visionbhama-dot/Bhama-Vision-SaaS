# Database

Supabase PostgreSQL. Migrations live in `db/migrations`, applied in numeric
order. All identifiers are UUIDs; timestamps are `timestamptz`; money is integer
paise in `bigint`.

## Migration files

| File                                   | Contents                                                                                                                                                                                 |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0001_extensions_and_helpers.sql`      | `pgcrypto`, `citext`, `set_updated_at()`, auth helper fns (`app.*`)                                                                                                                      |
| `0002_identity_and_tenancy.sql`        | `user_profiles`, `tenants`, `stores`, `tenant_domains`, `business_profiles`, `tenant_memberships`, `merchant_onboarding`, `reserved_slugs`, enums                                        |
| `0003_subscriptions.sql`               | `subscription_plans`, `plan_features`, `tenant_subscriptions`, `subscription_invoices`, `subscription_payments`, `app.tenant_has_feature()`                                              |
| `0004_catalog.sql`                     | `categories`, `products`, `product_variants`, `product_images`, `inventory_levels`, `inventory_movements`                                                                                |
| `0005_customers_orders.sql`            | `customers`, `customer_addresses`, `delivery_zones`, `coupons`, `carts`, `cart_items`, `orders`, `order_items`, `order_status_events`, `order_payments`, `refunds`, `coupon_redemptions` |
| `0006_delivery.sql`                    | `delivery_partners`, `delivery_assignments`, `delivery_location_updates`                                                                                                                 |
| `0007_marketplace.sql`                 | `vendors`, `vendor_commissions`, `vendor_settlements`, vendor FKs                                                                                                                        |
| `0008_support_leads_notifications.sql` | `support_tickets`, `support_messages`, `leads`, `lead_activities`, `notification_outbox`, `audit_logs`, `platform_settings`                                                              |
| `0009_rls_policies.sql`                | Enable RLS + policies on all data tables                                                                                                                                                 |
| `0010_seed_plans.sql`                  | Seed plans/entitlements + default settings                                                                                                                                               |

## Tenancy & isolation

Every tenant-scoped table carries `tenant_id`. Marketplace-scoped rows also
carry `vendor_id`. RLS (migration 0009) is **default-deny**: access is granted
only via helper functions that read `auth.uid()` from the verified JWT. A
client-supplied `tenant_id` never grants access by itself.

Guarantees proven by `db/tests/rls_isolation.sql`:

- Merchant A cannot read Merchant B's private rows.
- `leads` are invisible to everyone except platform admins (inserts happen via
  the server using the service role after validation).
- Vendor isolation, rider/customer delivery scoping, and customer-own-order
  access are expressed as policies (extend the harness as those flows ship).

## Integrity rules enforced in the schema

- `inventory_levels` cannot go negative unless `allow_oversell` is true (CHECK).
- One active subscription per tenant (partial unique index).
- One active delivery assignment per order (partial unique index).
- Duplicate payment webhooks blocked by `(provider, idempotency_key)` unique keys.
- Order monetary fields are immutable snapshots; products archive rather than
  hard-delete to preserve historical orders.
- A lead must have a phone or email (CHECK `leads_contactable`).

## Conventions

- `updated_at` maintained by the `set_updated_at()` trigger.
- Prefer logical deletion (`archived_at`, status enums) over hard deletes for
  anything referenced by financial/historical records.
