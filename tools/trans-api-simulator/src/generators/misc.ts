import { externalId, floatBetween, GenCtx, intBetween, pick, rng, CITIES } from './common'

const WAW = CITIES.find((c) => c.name === 'Warszawa')!
const POZ = CITIES.find((c) => c.name === 'Poznań')!

function stopFromCity(
  city: (typeof CITIES)[number],
  role: 'pickup' | 'delivery',
  rand: () => number,
) {
  return {
    role,
    name: city.name,
    country: 'PL',
    locality: city.name,
    postal_code: city.postal,
    street: pick(rand, ['Industrialna', 'Logistyczna', 'Spedycyjna', 'Magazynowa']),
    number: String(intBetween(rand, 1, 120)),
    coordinates: {
      latitude: city.lat,
      longitude: city.lon,
    },
  }
}

/** Transport-shaped order with two PL stops (default Warszawa → Poznań). */
export function orderCreate(ctx: GenCtx) {
  const rand = rng(ctx)
  const price = floatBetween(rand, 600, 2500, 2)
  const pickupName = String(ctx.vars?.pickupCity ?? 'Warszawa')
  const deliveryName = String(ctx.vars?.deliveryCity ?? 'Poznań')
  const pickup =
    CITIES.find((c) => c.name === pickupName) ??
    (pickupName.toLowerCase().includes('war') ? WAW : WAW)
  const delivery =
    CITIES.find((c) => c.name === deliveryName) ??
    (deliveryName.toLowerCase().includes('poz') ? POZ : POZ)

  return {
    external_id: externalId(ctx, 'ORD'),
    reference_number: `ORD/${new Date().getFullYear()}/${String(ctx.index + 1).padStart(6, '0')}`,
    freight_id: Number(ctx.vars?.freightId ?? intBetween(rand, 1_000_000, 9_999_999)),
    status: pick(rand, ['new', 'accepted', 'in_progress']),
    price: { currency: String(ctx.vars?.currency ?? 'eur'), value: price },
    carrier_company_id: Number(ctx.vars?.carrierCompanyId ?? 1028504),
    shipper_company_id: Number(ctx.vars?.shipperCompanyId ?? 1002003),
    created_at: new Date().toISOString(),
    notes: String(
      ctx.vars?.notes ??
        `Zlecenie ${pickup.name} → ${delivery.name} (trans-api-simulator)`,
    ),
    /** Two Poland stops — consumed by logistics transport-jobs / GraphHopper */
    stops: [stopFromCity(pickup, 'pickup', rand), stopFromCity(delivery, 'delivery', rand)],
    route_hint: {
      from: { name: pickup.name, lat: pickup.lat, lng: pickup.lon },
      to: { name: delivery.name, lat: delivery.lat, lng: delivery.lon },
      profile: 'car',
    },
  }
}

export function orderEvent(ctx: GenCtx) {
  return {
    event: 'order.created',
    occurred_at: new Date().toISOString(),
    source: 'trans.eu',
    payload: orderCreate(ctx),
  }
}

export function partnerAdd(ctx: GenCtx) {
  const rand = rng(ctx)
  return {
    office_id: Number(ctx.vars?.officeId ?? intBetween(rand, 1_000_000, 2_000_000)),
  }
}

export function vehicleCreate(ctx: GenCtx) {
  const rand = rng(ctx)
  return {
    registration_number: `W${intBetween(rand, 10000, 99999)}`,
    type: pick(rand, ['curtainsider', 'box', 'refrigerator', 'tanker']),
    capacity_tons: floatBetween(rand, 10, 24, 1),
    loading_meters: floatBetween(rand, 6, 13.6, 1),
    axles: pick(rand, [2, 3, 4]),
    external_id: externalId(ctx, 'VEH'),
  }
}

export function dockAnnouncement(ctx: GenCtx) {
  const rand = rng(ctx)
  const start = new Date(Date.now() + intBetween(rand, 2, 48) * 3_600_000)
  const end = new Date(start.getTime() + intBetween(rand, 30, 120) * 60_000)
  return {
    warehouse_id: String(ctx.vars?.warehouseId ?? externalId(ctx, 'WH')),
    vehicle_registration: `W${intBetween(rand, 10000, 99999)}`,
    slot_from: start.toISOString(),
    slot_to: end.toISOString(),
    status: pick(rand, ['planned', 'announced', 'arrived']),
    external_id: externalId(ctx, 'DOCK'),
  }
}
