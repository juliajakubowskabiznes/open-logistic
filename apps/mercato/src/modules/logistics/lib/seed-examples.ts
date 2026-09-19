import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { ensureRoles } from '@open-mercato/core/modules/auth/lib/setup-app'
import { installCustomEntitiesFromModules } from '@open-mercato/core/modules/entities/lib/install-from-ce'
import { CustomerEntity } from '@open-mercato/core/modules/customers/data/entities'
import { CustomFieldValue } from '@open-mercato/core/modules/entities/data/entities'
import { SalesOrder } from '@open-mercato/core/modules/sales/data/entities'
import { resolveStatusEntryIdByValue } from '@open-mercato/core/modules/sales/lib/statusHelpers'
import { E } from '@/.mercato/generated/entities.ids.generated'
import { LOGISTICS_ENTITY_IDS } from '../ce'
import { DISPATCHER_FEATURES, LOGISTICS_DISPATCHER_ROLE } from './constants'
import {
  createAdditionalLoadProposal,
  createCarrierProposal,
  type AdditionalLoadProposalInput,
  type CarrierProposalInput,
} from './proposals'
import type { TransportScope } from './transports'

export type LogisticsSeedScope = TransportScope
export type LogisticsSeedOptions = { logger?: (message: string) => void }

type CompanySeed = {
  key: string
  displayName: string
  carrierRating?: number
}

type PrimaryTransportSeed = {
  key: string
  customerKey: string
  pickupAddress: string
  deliveryAddress: string
  pickupWindowStart: string
  pickupWindowEnd: string
  cargoPallets: number
  cargoWeightKg: number
  clientPrice: number
  maxCarrierCost: number
}

const COMPANIES: CompanySeed[] = [
  { key: 'client-furniture', displayName: 'Meble Wrocław Demo' },
  { key: 'client-food', displayName: 'AgroPak Demo' },
  { key: 'carrier-north', displayName: 'TransNord Demo', carrierRating: 5 },
  { key: 'carrier-pol', displayName: 'SpedPol Demo', carrierRating: 4 },
  { key: 'carrier-euro', displayName: 'EuroTrans Demo', carrierRating: 3 },
]

const PRIMARY_TRANSPORTS: PrimaryTransportSeed[] = [
  {
    key: 'transport-a',
    customerKey: 'client-furniture',
    pickupAddress: 'Wrocław, ul. Fabryczna 12',
    deliveryAddress: 'Berlin, Warschauer Str. 70',
    pickupWindowStart: '2026-09-22T06:00:00.000Z',
    pickupWindowEnd: '2026-09-22T10:00:00.000Z',
    cargoPallets: 20,
    cargoWeightKg: 10_500,
    clientPrice: 3_200,
    maxCarrierCost: 2_700,
  },
  {
    key: 'transport-b',
    customerKey: 'client-food',
    pickupAddress: 'Wrocław, ul. Portowa 3',
    deliveryAddress: 'Hamburg, Am Sandtorkai 40',
    pickupWindowStart: '2026-09-23T05:00:00.000Z',
    pickupWindowEnd: '2026-09-23T09:00:00.000Z',
    cargoPallets: 18,
    cargoWeightKg: 12_000,
    clientPrice: 4_400,
    maxCarrierCost: 3_600,
  },
  {
    key: 'transport-c',
    customerKey: 'client-furniture',
    pickupAddress: 'Poznań, ul. Głogowska 200',
    deliveryAddress: 'Praga, Na Poříčí 26',
    pickupWindowStart: '2026-09-24T08:00:00.000Z',
    pickupWindowEnd: '2026-09-24T12:00:00.000Z',
    cargoPallets: 12,
    cargoWeightKg: 8_000,
    clientPrice: 2_600,
    maxCarrierCost: 2_100,
  },
  {
    key: 'transport-d',
    customerKey: 'client-food',
    pickupAddress: 'Wrocław, ul. Portowa 3',
    deliveryAddress: 'Gdańsk, ul. Kontenerowa 7',
    pickupWindowStart: '2026-09-25T05:00:00.000Z',
    pickupWindowEnd: '2026-09-25T09:00:00.000Z',
    cargoPallets: 16,
    cargoWeightKg: 9_500,
    clientPrice: 2_900,
    maxCarrierCost: 2_300,
  },
]

function commandContext(container: AwilixContainer, scope: LogisticsSeedScope): CommandRuntimeContext {
  return {
    container,
    auth: null,
    organizationScope: null,
    selectedOrganizationId: scope.organizationId,
    organizationIds: [scope.organizationId],
    systemActor: true,
  }
}

async function ensureCompanies(
  em: EntityManager,
  container: AwilixContainer,
  scope: LogisticsSeedScope,
  log: (message: string) => void,
): Promise<Map<string, string>> {
  const existing = await findWithDecryption(
    em,
    CustomerEntity,
    {
      kind: 'company',
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      deletedAt: null,
    },
    { populate: ['companyProfile'] },
    scope,
  )
  const existingByName = new Map(existing.map((company) => [company.displayName, company]))
  const companyIds = new Map<string, string>()
  const bus = container.resolve<CommandBus>('commandBus')
  const dataEngine = container.resolve<DataEngine>('dataEngine')

  for (const seed of COMPANIES) {
    const current = existingByName.get(seed.displayName)
    if (current) {
      companyIds.set(seed.key, current.id)
      if (current.companyProfile?.id) {
        await dataEngine.setCustomFields({
          entityId: E.customers.customer_company_profile,
          recordId: current.companyProfile.id,
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          values: {
            is_carrier: seed.carrierRating !== undefined,
            carrier_rating: seed.carrierRating ?? null,
          },
          notify: false,
        })
      }
      continue
    }
    const result = await bus.execute<Record<string, unknown>, { entityId: string }>('customers.companies.create', {
      input: {
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        displayName: seed.displayName,
        industry: seed.carrierRating === undefined ? 'Customer' : 'Transport',
        customFields: {
          is_carrier: seed.carrierRating !== undefined,
          carrier_rating: seed.carrierRating ?? null,
        },
      },
      ctx: commandContext(container, scope),
    })
    companyIds.set(seed.key, result.result.entityId)
    log(`company ${seed.displayName} created`)
  }
  return companyIds
}

async function requiredStatusEntryId(
  em: EntityManager,
  scope: LogisticsSeedScope,
  value: string,
): Promise<string> {
  const id = await resolveStatusEntryIdByValue(em, { ...scope, value })
  if (!id) throw new Error(`[internal] sales.order_status entry missing: ${value}`)
  return id
}

async function ensurePrimaryTransports(
  em: EntityManager,
  container: AwilixContainer,
  scope: LogisticsSeedScope,
  companyIds: Map<string, string>,
  log: (message: string) => void,
): Promise<Map<string, string>> {
  const refs = PRIMARY_TRANSPORTS.map((seed) => `logistics-demo:${seed.key}`)
  const existing = await em.find(SalesOrder, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    externalReference: { $in: refs },
    deletedAt: null,
  })
  const existingByRef = new Map(existing.map((order) => [order.externalReference ?? '', order.id]))
  const statusEntryId = await requiredStatusEntryId(em, scope, 'confirmed')
  const bus = container.resolve<CommandBus>('commandBus')
  const transportIds = new Map<string, string>()

  for (const seed of PRIMARY_TRANSPORTS) {
    const externalReference = `logistics-demo:${seed.key}`
    const currentId = existingByRef.get(externalReference)
    if (currentId) {
      transportIds.set(seed.key, currentId)
      continue
    }
    const customerEntityId = companyIds.get(seed.customerKey)
    if (!customerEntityId) throw new Error(`[internal] missing seeded customer: ${seed.customerKey}`)
    const result = await bus.execute<Record<string, unknown>, { orderId: string }>('sales.orders.create', {
      input: {
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        customerEntityId,
        currencyCode: 'PLN',
        statusEntryId,
        externalReference,
        lines: [
          {
            currencyCode: 'PLN',
            kind: 'service',
            name: `Transport ${seed.pickupAddress} – ${seed.deliveryAddress}`,
            quantity: 1,
            unitPriceNet: seed.clientPrice,
          },
        ],
        customFields: {
          transport_role: 'client',
          pickup_address: seed.pickupAddress,
          delivery_address: seed.deliveryAddress,
          pickup_window_start: seed.pickupWindowStart,
          pickup_window_end: seed.pickupWindowEnd,
          cargo_pallets: seed.cargoPallets,
          cargo_weight_kg: seed.cargoWeightKg,
          client_price: seed.clientPrice,
          max_carrier_cost: seed.maxCarrierCost,
          dispatch_note: 'Demo transport created by the logistics seed.',
        },
      },
      ctx: commandContext(container, scope),
    })
    transportIds.set(seed.key, result.result.orderId)
    log(`transport ${seed.key} created`)
  }
  return transportIds
}

async function orderIdByExchangeRef(
  em: EntityManager,
  scope: LogisticsSeedScope,
  exchangeRef: string,
): Promise<string | null> {
  const row = await em.findOne(CustomFieldValue, {
    entityId: E.sales.sales_order,
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    fieldKey: 'exchange_ref',
    valueText: exchangeRef,
    deletedAt: null,
  })
  if (!row) return null
  const order = await em.findOne(SalesOrder, {
    id: row.recordId,
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    deletedAt: null,
  })
  return order?.id ?? null
}

async function ensureCarrierProposal(
  em: EntityManager,
  container: AwilixContainer,
  scope: LogisticsSeedScope,
  transportId: string,
  input: CarrierProposalInput,
  status: 'pending_approval' | 'approved',
): Promise<void> {
  if (input.exchangeRef && await orderIdByExchangeRef(em, scope, input.exchangeRef)) return
  await createCarrierProposal(em, container, scope, transportId, input, { initialStatus: status })
}

async function ensureAdditionalLoad(
  em: EntityManager,
  container: AwilixContainer,
  scope: LogisticsSeedScope,
  transportId: string,
  input: AdditionalLoadProposalInput,
  allowExceedsFreeSpaceForDemo = false,
): Promise<void> {
  if (input.exchangeRef && await orderIdByExchangeRef(em, scope, input.exchangeRef)) return
  await createAdditionalLoadProposal(em, container, scope, transportId, input, { allowExceedsFreeSpaceForDemo })
}

export async function seedLogisticsExamples(
  em: EntityManager,
  container: AwilixContainer,
  scope: LogisticsSeedScope,
  options: LogisticsSeedOptions = {},
): Promise<void> {
  const log = options.logger ?? (() => undefined)
  await ensureRoles(em, { roleNames: [LOGISTICS_DISPATCHER_ROLE], tenantId: scope.tenantId })
  await installCustomEntitiesFromModules(em, null, {
    entityIds: [...LOGISTICS_ENTITY_IDS],
    tenantIds: [scope.tenantId],
    includeGlobal: false,
  })
  const companyIds = await ensureCompanies(em, container, scope, log)
  const transportIds = await ensurePrimaryTransports(em, container, scope, companyIds, log)

  const carrierNorth = companyIds.get('carrier-north')
  const carrierPol = companyIds.get('carrier-pol')
  const carrierEuro = companyIds.get('carrier-euro')
  const furnitureClient = companyIds.get('client-furniture')
  const foodClient = companyIds.get('client-food')
  const transportA = transportIds.get('transport-a')
  const transportB = transportIds.get('transport-b')
  const transportC = transportIds.get('transport-c')
  if (!carrierNorth || !carrierPol || !carrierEuro || !furnitureClient || !foodClient || !transportA || !transportB || !transportC) {
    throw new Error('[internal] logistics demo seed references are incomplete')
  }

  await ensureCarrierProposal(em, container, scope, transportA, {
    carrierCustomerId: carrierNorth,
    carrierCost: 2_450,
    vehicleType: 'Curtainsider semi-trailer',
    vehicleCapacityPallets: 33,
    vehicleCapacityKg: 24_000,
    vehiclePlate: 'DW 5DEMO',
    exchangeSource: 'seed',
    exchangeRef: 'logistics-demo:carrier-a',
    note: 'Best demo carrier proposal awaiting dispatcher approval.',
  }, 'pending_approval')

  await ensureCarrierProposal(em, container, scope, transportB, {
    carrierCustomerId: carrierPol,
    carrierCost: 3_300,
    vehicleType: 'Curtainsider semi-trailer',
    vehicleCapacityPallets: 33,
    vehicleCapacityKg: 24_000,
    vehiclePlate: 'PO 7DEMO',
    exchangeSource: 'seed',
    exchangeRef: 'logistics-demo:carrier-b',
  }, 'approved')
  await ensureAdditionalLoad(em, container, scope, transportB, {
    customerId: furnitureClient,
    pickupAddress: 'Legnica, ul. Przemysłowa 8',
    deliveryAddress: 'Magdeburg, Hafenstr. 4',
    pickupWindowStart: '2026-09-23T11:00:00.000Z',
    pickupWindowEnd: '2026-09-23T13:00:00.000Z',
    cargoPallets: 6,
    cargoWeightKg: 3_500,
    clientPrice: 1_250,
    exchangeSource: 'seed',
    exchangeRef: 'logistics-demo:load-b',
    note: 'Fits within both remaining capacity limits.',
  })

  await ensureCarrierProposal(em, container, scope, transportC, {
    carrierCustomerId: carrierEuro,
    carrierCost: 1_950,
    vehicleType: 'Rigid truck',
    vehicleCapacityPallets: 18,
    vehicleCapacityKg: 10_000,
    vehiclePlate: 'B DEMO 3',
    exchangeSource: 'seed',
    exchangeRef: 'logistics-demo:carrier-c',
  }, 'approved')
  await ensureAdditionalLoad(em, container, scope, transportC, {
    customerId: foodClient,
    pickupAddress: 'Opole, ul. Magazynowa 10',
    deliveryAddress: 'Brno, Vídeňská 15',
    pickupWindowStart: '2026-09-24T13:00:00.000Z',
    pickupWindowEnd: '2026-09-24T15:00:00.000Z',
    cargoPallets: 4,
    cargoWeightKg: 3_000,
    clientPrice: 980,
    exchangeSource: 'seed',
    exchangeRef: 'logistics-demo:load-c-overweight',
    note: 'Demo candidate intentionally exceeds the remaining weight capacity.',
  }, true)

  log(`dispatcher role uses ${DISPATCHER_FEATURES.length} feature grants`)
  log('logistics demo data ready')
}
