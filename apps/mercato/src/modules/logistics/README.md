# Dispatcher logistics module

The module exposes two guarded backend pages:

| Page | URL |
|---|---|
| AI Inbox / Offers | `/backend/logistics/ai-inbox` (redirects to `inbox_ops`) |
| AI Transports | `/backend/logistics/transports` |

Transport details are available at `/backend/logistics/transports/:id`. A transport is a read model over sales orders: Order 1 is the client order, Order 2 is the active carrier order and subsequent orders are additional loads. Remaining pallet and weight capacity are calculated independently.

## Access

- `logistics.view` protects navigation, pages and read APIs.
- `logistics.manage` is reserved for dispatcher decisions in Phase 2.
- New tenants receive an idempotent `dyspozytor` role with logistics, sales-order read and inbox access.

After deployment to an existing tenant, synchronize module metadata and ACLs:

```sh
yarn generate
yarn mercato auth sync-role-acls
yarn mercato configs cache structural --all-tenants
```

## Demo data

The idempotent seed creates four transports covering the relevant UI states:

```sh
yarn mercato logistics seed-examples --tenant <tenant-id> --org <organization-id>
```

Vehicle definitions and EUR pricing live in `lib/vehicle-types.ts`. Carrier orders store their actual vehicle capacity as a snapshot, so calculations do not depend on later catalogue changes.

## Verification

```sh
yarn workspace @open-mercato/app typecheck
yarn workspace @open-mercato/app test --runInBand src/modules/logistics
yarn i18n:check-sync
yarn template:sync
```

Source specification: `.ai/specs/2026-09-19-dispatcher-panel-skeleton.md`.
