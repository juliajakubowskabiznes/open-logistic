import { features } from '../acl'
import { setup } from '../setup'
import { entities, TRANSPORT_ROLES } from '../ce'
import { metadata as inboxMetadata } from '../backend/logistics/ai-inbox/page.meta'
import { metadata as transportsMetadata } from '../backend/logistics/transports/page.meta'
import { metadata as detailMetadata } from '../backend/logistics/transports/[id]/page.meta'
import en from '../i18n/en.json'
import pl from '../i18n/pl.json'
import { VEHICLE_TYPES } from '../lib/vehicle-types'

describe('logistics dispatcher foundation', () => {
  test('exposes read and manage features with dispatcher defaults', () => {
    expect(features.map((feature) => feature.id)).toEqual(['logistics.view', 'logistics.manage'])
    expect(setup.defaultRoleFeatures).toMatchObject({
      admin: ['logistics.view', 'logistics.manage'],
      dyspozytor: expect.arrayContaining(['logistics.view', 'logistics.manage', 'sales.orders.view']),
    })
  })

  test('defines transport fields on sales orders and carrier fields on company profiles', () => {
    expect(entities).toHaveLength(2)
    expect(TRANSPORT_ROLES).toEqual(['client', 'carrier', 'additional_load'])
    const fieldKeys = entities.flatMap((entity) => entity.fields.map((field) => field.key))
    expect(fieldKeys).toEqual(expect.arrayContaining([
      'transport_role',
      'transport_parent_id',
      'cargo_pallets',
      'cargo_weight_kg',
      'vehicle_capacity_pallets',
      'vehicle_capacity_kg',
      'is_carrier',
      'carrier_rating',
    ]))
  })

  test('publishes two visible pages and hides transport details from navigation', () => {
    expect(inboxMetadata).toMatchObject({ requireAuth: true, requireFeatures: ['logistics.view'], pageOrder: 10 })
    expect(transportsMetadata).toMatchObject({ requireAuth: true, requireFeatures: ['logistics.view'], pageOrder: 20 })
    expect(detailMetadata).toMatchObject({ requireAuth: true, requireFeatures: ['logistics.view'], navHidden: true })
    expect(inboxMetadata.pageGroupKey).toBe('logistics.nav.group')
    expect(transportsMetadata.pageGroupKey).toBe('logistics.nav.group')
  })

  test('ships the navigation and ACL labels in the primary locales', () => {
    for (const dict of [en, pl]) {
      expect(dict['logistics.nav.aiInbox']).toBeTruthy()
      expect(dict['logistics.nav.aiTransports']).toBeTruthy()
      expect(dict['auth.acl.features.logistics.manage']).toBeTruthy()
    }
  })

  test('uses the dispatcher vehicle and pricing catalogue', () => {
    expect(VEHICLE_TYPES.map((vehicle) => vehicle.name)).toEqual([
      'FTL',
      'Solo 18t DMC',
      'Solo 12t DMC',
      'Solo 7,5t DMC',
      'Bus 4,2×2,0×2,0',
      'Bus blaszak',
    ])
    expect(VEHICLE_TYPES.find((vehicle) => vehicle.name === 'Bus blaszak')).toMatchObject({
      payloadKg: 1_000,
      palletSpaces: 4,
      curtainsider: { eurPerKm: 0.6, minimumEur: 300 },
      refrigerated: { eurPerKm: 0.9, minimumEur: 400 },
      tailLiftSurchargeEur: 250,
    })
  })
})
