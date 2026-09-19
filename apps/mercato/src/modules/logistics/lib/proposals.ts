import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { CustomerCompanyProfile } from '@open-mercato/core/modules/customers/data/entities'
import { CustomFieldValue } from '@open-mercato/core/modules/entities/data/entities'
import { resolveStatusEntryIdByValue } from '@open-mercato/core/modules/sales/lib/statusHelpers'
import type { TransportScope } from './transports'
import {
  COMPANY_PROFILE_ENTITY_ID,
  loadTransportDetail,
} from './transports'

export type ExchangeSource = 'seed' | 'manual' | 'trans' | 'timocom'
export type ProposalStatus = 'pending_approval' | 'approved'

export type CarrierProposalInput = {
  carrierCustomerId: string
  carrierCost: number
  vehicleType: string
  vehicleCapacityPallets: number
  vehicleCapacityKg: number
  vehiclePlate?: string
  exchangeSource: ExchangeSource
  exchangeRef?: string
  note?: string
}

export type AdditionalLoadProposalInput = {
  customerId: string
  pickupAddress: string
  deliveryAddress: string
  pickupWindowStart?: string
  pickupWindowEnd?: string
  cargoPallets: number
  cargoWeightKg: number
  clientPrice: number
  exchangeSource: ExchangeSource
  exchangeRef?: string
  note?: string
}

export class LogisticsProposalError extends Error {
  constructor(
    readonly code:
      | 'not_found'
      | 'not_a_carrier'
      | 'carrier_already_proposed'
      | 'no_approved_carrier'
      | 'missing_vehicle_capacity'
      | 'exceeds_free_space'
      | 'status_entry_missing',
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(code)
    this.name = 'LogisticsProposalError'
  }
}

function commandContext(container: AwilixContainer, scope: TransportScope): CommandRuntimeContext {
  return {
    container,
    auth: null,
    organizationScope: null,
    selectedOrganizationId: scope.organizationId,
    organizationIds: [scope.organizationId],
    systemActor: true,
  }
}

async function requiredStatusEntryId(
  em: EntityManager,
  scope: TransportScope,
  value: string,
): Promise<string> {
  const id = await resolveStatusEntryIdByValue(em, { ...scope, value })
  if (!id) throw new LogisticsProposalError('status_entry_missing', 500, { value })
  return id
}

async function isCarrierCompany(
  em: EntityManager,
  scope: TransportScope,
  customerEntityId: string,
): Promise<boolean> {
  const profile = await em.findOne(CustomerCompanyProfile, {
    entity: customerEntityId,
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
  })
  if (!profile) return false
  const row = await em.findOne(CustomFieldValue, {
    entityId: COMPANY_PROFILE_ENTITY_ID,
    recordId: profile.id,
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    fieldKey: 'is_carrier',
    deletedAt: null,
  })
  return row?.valueBool === true
}

export async function createCarrierProposal(
  em: EntityManager,
  container: AwilixContainer,
  scope: TransportScope,
  transportId: string,
  input: CarrierProposalInput,
  options: { initialStatus?: ProposalStatus } = {},
): Promise<{ orderId: string }> {
  const detail = await loadTransportDetail(em, scope, transportId)
  if (!detail) throw new LogisticsProposalError('not_found', 404)
  if (detail.order2) throw new LogisticsProposalError('carrier_already_proposed', 409)
  if (!(await isCarrierCompany(em, scope, input.carrierCustomerId))) {
    throw new LogisticsProposalError('not_a_carrier', 400)
  }

  const statusValue = options.initialStatus ?? 'pending_approval'
  const statusEntryId = await requiredStatusEntryId(em, scope, statusValue)
  const bus = container.resolve<CommandBus>('commandBus')
  const result = await bus.execute<Record<string, unknown>, { orderId: string }>('sales.orders.create', {
    input: {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      customerEntityId: input.carrierCustomerId,
      currencyCode: 'PLN',
      statusEntryId,
      externalReference: input.exchangeRef,
      lines: [
        {
          currencyCode: 'PLN',
          kind: 'service',
          name: `Carrier service for ${detail.order1.orderNumber}`,
          quantity: 1,
          unitPriceNet: input.carrierCost,
        },
      ],
      customFields: {
        transport_role: 'carrier',
        transport_parent_id: transportId,
        vehicle_type: input.vehicleType,
        vehicle_capacity_pallets: input.vehicleCapacityPallets,
        vehicle_capacity_kg: input.vehicleCapacityKg,
        vehicle_plate: input.vehiclePlate ?? null,
        carrier_cost: input.carrierCost,
        exchange_source: input.exchangeSource,
        exchange_ref: input.exchangeRef ?? null,
        dispatch_note: input.note ?? null,
      },
    },
    ctx: commandContext(container, scope),
  })
  return { orderId: result.result.orderId }
}

export async function createAdditionalLoadProposal(
  em: EntityManager,
  container: AwilixContainer,
  scope: TransportScope,
  transportId: string,
  input: AdditionalLoadProposalInput,
  options: { allowExceedsFreeSpaceForDemo?: boolean } = {},
): Promise<{ orderId: string }> {
  const detail = await loadTransportDetail(em, scope, transportId)
  if (!detail) throw new LogisticsProposalError('not_found', 404)
  if (detail.order2?.status !== 'approved') {
    throw new LogisticsProposalError('no_approved_carrier', 409)
  }
  const capacityPallets = detail.order2.fields.vehicle_capacity_pallets
  const capacityKg = detail.order2.fields.vehicle_capacity_kg
  if (typeof capacityPallets !== 'number' || typeof capacityKg !== 'number' || !detail.freeSpace) {
    throw new LogisticsProposalError('missing_vehicle_capacity', 409)
  }
  const exceeds = detail.freeSpace.pallets === null
    || detail.freeSpace.kg === null
    || input.cargoPallets > detail.freeSpace.pallets
    || input.cargoWeightKg > detail.freeSpace.kg
  if (exceeds && !options.allowExceedsFreeSpaceForDemo) {
    throw new LogisticsProposalError('exceeds_free_space', 409, { freeSpace: detail.freeSpace })
  }

  const statusEntryId = await requiredStatusEntryId(em, scope, 'pending_approval')
  const bus = container.resolve<CommandBus>('commandBus')
  const result = await bus.execute<Record<string, unknown>, { orderId: string }>('sales.orders.create', {
    input: {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      customerEntityId: input.customerId,
      currencyCode: 'PLN',
      statusEntryId,
      externalReference: input.exchangeRef,
      lines: [
        {
          currencyCode: 'PLN',
          kind: 'service',
          name: `Additional load for ${detail.order1.orderNumber}`,
          quantity: 1,
          unitPriceNet: input.clientPrice,
        },
      ],
      customFields: {
        transport_role: 'additional_load',
        transport_parent_id: transportId,
        pickup_address: input.pickupAddress,
        delivery_address: input.deliveryAddress,
        pickup_window_start: input.pickupWindowStart ?? null,
        pickup_window_end: input.pickupWindowEnd ?? null,
        cargo_pallets: input.cargoPallets,
        cargo_weight_kg: input.cargoWeightKg,
        client_price: input.clientPrice,
        exchange_source: input.exchangeSource,
        exchange_ref: input.exchangeRef ?? null,
        dispatch_note: input.note ?? null,
      },
    },
    ctx: commandContext(container, scope),
  })
  return { orderId: result.result.orderId }
}
