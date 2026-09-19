import type { EntityManager } from '@mikro-orm/postgresql'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { SalesOrder } from '@open-mercato/core/modules/sales/data/entities'
import { CustomerEntity } from '@open-mercato/core/modules/customers/data/entities'
import { CustomFieldValue } from '@open-mercato/core/modules/entities/data/entities'
import type {
  CarrierStatus,
  FreeSpace,
  TransportDetail,
  TransportFields,
  TransportListResponse,
  TransportOrder,
  TransportRole,
  TransportRow,
} from '../types'

export const SALES_ORDER_ENTITY_ID = 'sales:sales_order'
export const COMPANY_PROFILE_ENTITY_ID = 'customers:customer_company_profile'
export const MAX_TRANSPORTS_PER_ORGANIZATION = 1_000

const ACTIVE_CARRIER_STATUSES = new Set(['pending_approval', 'approved'])

export type TransportScope = {
  tenantId: string
  organizationId: string
}

export type TransportListQuery = {
  page: number
  pageSize: number
  search?: string
  carrierStatus?: CarrierStatus
  sortField: 'updatedAt' | 'pickupWindowStart'
  sortDir: 'asc' | 'desc'
}

export class TooManyTransportsError extends Error {
  readonly code = 'too_many_transports'

  constructor(readonly count: number) {
    super(`Transport read model limit exceeded: ${count}`)
    this.name = 'TooManyTransportsError'
  }
}

type CompanyView = {
  id: string
  name: string
  profileId: string | null
  carrierRating: number | null
}

type ReadModel = {
  orderById: Map<string, SalesOrder>
  fieldsByOrderId: Map<string, TransportFields>
  roleByOrderId: Map<string, TransportRole>
  companyById: Map<string, CompanyView>
  clientOrderIds: string[]
}

function fieldValue(row: CustomFieldValue): string | number | boolean | null {
  if (row.valueText !== null && row.valueText !== undefined) return row.valueText
  if (row.valueMultiline !== null && row.valueMultiline !== undefined) return row.valueMultiline
  if (row.valueInt !== null && row.valueInt !== undefined) return row.valueInt
  if (row.valueFloat !== null && row.valueFloat !== undefined) return row.valueFloat
  if (row.valueBool !== null && row.valueBool !== undefined) return row.valueBool
  return null
}

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function optionalNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value
}

function isoDate(value: Date | string | null | undefined): string {
  if (value instanceof Date) return value.toISOString()
  const parsed = value ? new Date(value) : new Date(0)
  return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString()
}

function customerView(order: SalesOrder, companyById: Map<string, CompanyView>): CompanyView {
  if (order.customerEntityId) {
    const company = companyById.get(order.customerEntityId)
    if (company) return company
  }
  const snapshot = order.customerSnapshot
  const snapshotCustomer = snapshot && typeof snapshot.customer === 'object' && snapshot.customer !== null
    ? snapshot.customer as Record<string, unknown>
    : null
  return {
    id: order.customerEntityId ?? '',
    name: optionalText(snapshotCustomer?.displayName) ?? order.customerEntityId ?? '—',
    profileId: null,
    carrierRating: null,
  }
}

function toTransportOrder(
  order: SalesOrder,
  fieldsByOrderId: Map<string, TransportFields>,
  companyById: Map<string, CompanyView>,
): TransportOrder {
  const company = customerView(order, companyById)
  const fields = { ...(fieldsByOrderId.get(order.id) ?? {}) }
  if (company.carrierRating !== null) fields.carrier_rating = company.carrierRating
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status ?? '',
    customerId: order.customerEntityId ?? null,
    customerName: company.name,
    updatedAt: isoDate(order.updatedAt),
    fields,
  }
}

function capacityRemaining(capacity: number | null, primaryCargo: number | null, approvedCargo: number[]): number | null {
  if (capacity === null) return null
  const used = (primaryCargo ?? 0) + approvedCargo.reduce((sum, value) => sum + value, 0)
  return capacity - used
}

function relativeRemaining(remaining: number | null, capacity: number | null): number | null {
  if (remaining === null || capacity === null) return null
  if (capacity === 0) return remaining <= 0 ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY
  return remaining / capacity
}

export function computeFreeSpace(
  order1Fields: TransportFields,
  carrierFields: TransportFields | null,
  approvedAdditionalLoadFields: TransportFields[],
): FreeSpace | null {
  if (!carrierFields) return null

  const capacityPallets = optionalNumber(carrierFields.vehicle_capacity_pallets)
  const capacityKg = optionalNumber(carrierFields.vehicle_capacity_kg)
  if (capacityPallets === null && capacityKg === null) return null

  const pallets = capacityRemaining(
    capacityPallets,
    optionalNumber(order1Fields.cargo_pallets),
    approvedAdditionalLoadFields
      .map((fields) => optionalNumber(fields.cargo_pallets))
      .filter((value): value is number => value !== null),
  )
  const kg = capacityRemaining(
    capacityKg,
    optionalNumber(order1Fields.cargo_weight_kg),
    approvedAdditionalLoadFields
      .map((fields) => optionalNumber(fields.cargo_weight_kg))
      .filter((value): value is number => value !== null),
  )
  const palletRatio = relativeRemaining(pallets, capacityPallets)
  const kgRatio = relativeRemaining(kg, capacityKg)
  const limiting = palletRatio === null
    ? kgRatio === null ? null : 'kg'
    : kgRatio === null || palletRatio <= kgRatio ? 'pallets' : 'kg'

  return { pallets, kg, limiting }
}

function activeCarrierOrders(children: TransportOrder[]): TransportOrder[] {
  return children
    .filter((order) => order.fields.transport_role === 'carrier' && ACTIVE_CARRIER_STATUSES.has(order.status))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

function buildTransportDetail(model: ReadModel, clientOrder: SalesOrder): TransportDetail {
  const order1 = toTransportOrder(clientOrder, model.fieldsByOrderId, model.companyById)
  const children = [...model.orderById.values()]
    .filter((order) => model.fieldsByOrderId.get(order.id)?.transport_parent_id === clientOrder.id)
    .map((order) => toTransportOrder(order, model.fieldsByOrderId, model.companyById))
  const carriers = children.filter((order) => order.fields.transport_role === 'carrier')
  const order2 = activeCarrierOrders(carriers)[0] ?? null
  const carrierHistory = carriers
    .filter((order) => order.status === 'rejected')
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  const additionalLoads = children
    .filter((order) => order.fields.transport_role === 'additional_load')
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  const approvedLoadFields = additionalLoads
    .filter((order) => order.status === 'approved')
    .map((order) => order.fields)
  const freeSpace = computeFreeSpace(order1.fields, order2?.fields ?? null, approvedLoadFields)

  return { order1, order2, carrierHistory, additionalLoads, freeSpace }
}

function detailToRow(detail: TransportDetail): TransportRow {
  const order1Fields = detail.order1.fields
  const pendingLoads = detail.additionalLoads.filter((order) => order.status === 'pending_approval')
  const approvedLoads = detail.additionalLoads.filter((order) => order.status === 'approved')
  const carrierStatus = detail.order2?.status
  const carrier: TransportRow['carrier'] = detail.order2 && (carrierStatus === 'pending_approval' || carrierStatus === 'approved')
    ? {
        orderId: detail.order2.id,
        name: detail.order2.customerName,
        status: carrierStatus,
        cost: optionalNumber(detail.order2.fields.carrier_cost),
        vehicleType: optionalText(detail.order2.fields.vehicle_type),
        updatedAt: detail.order2.updatedAt,
      }
    : null

  return {
    id: detail.order1.id,
    orderNumber: detail.order1.orderNumber,
    customerName: detail.order1.customerName,
    pickupAddress: optionalText(order1Fields.pickup_address),
    deliveryAddress: optionalText(order1Fields.delivery_address),
    pickupWindowStart: optionalText(order1Fields.pickup_window_start),
    pickupWindowEnd: optionalText(order1Fields.pickup_window_end),
    cargoPallets: optionalNumber(order1Fields.cargo_pallets),
    cargoWeightKg: optionalNumber(order1Fields.cargo_weight_kg),
    clientPrice: optionalNumber(order1Fields.client_price),
    carrier,
    additionalLoads: {
      pending: pendingLoads.length,
      approved: approvedLoads.length,
      pendingOrderId: pendingLoads.length === 1 ? pendingLoads[0]?.id ?? null : null,
      pendingUpdatedAt: pendingLoads.length === 1 ? pendingLoads[0]?.updatedAt ?? null : null,
    },
    freeSpace: detail.freeSpace,
    updatedAt: detail.order1.updatedAt,
  }
}

async function loadReadModel(em: EntityManager, scope: TransportScope): Promise<ReadModel> {
  const roleRows = await em.find(CustomFieldValue, {
    entityId: SALES_ORDER_ENTITY_ID,
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    fieldKey: 'transport_role',
    deletedAt: null,
  })
  const roleByOrderId = new Map<string, TransportRole>()
  for (const row of roleRows) {
    const value = fieldValue(row)
    if (value === 'client' || value === 'carrier' || value === 'additional_load') {
      roleByOrderId.set(row.recordId, value)
    }
  }
  const clientOrderIds = [...roleByOrderId.entries()]
    .filter(([, role]) => role === 'client')
    .map(([orderId]) => orderId)
  if (clientOrderIds.length > MAX_TRANSPORTS_PER_ORGANIZATION) {
    throw new TooManyTransportsError(clientOrderIds.length)
  }

  const transportOrderIds = [...roleByOrderId.keys()]
  const orders = transportOrderIds.length > 0
    ? await em.find(SalesOrder, {
        id: { $in: transportOrderIds },
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        deletedAt: null,
      })
    : []
  const orderById = new Map(orders.map((order) => [order.id, order]))
  const liveClientOrderIds = clientOrderIds.filter((orderId) => orderById.has(orderId))
  const customerIds = Array.from(new Set(
    orders
      .map((order) => order.customerEntityId)
      .filter((customerId): customerId is string => typeof customerId === 'string' && customerId.length > 0),
  ))
  const companies = customerIds.length > 0
    ? await findWithDecryption(
        em,
        CustomerEntity,
        {
          id: { $in: customerIds },
          kind: 'company',
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          deletedAt: null,
        },
        { populate: ['companyProfile'] },
        scope,
      )
    : []
  const profileIds = companies
    .map((company) => company.companyProfile?.id)
    .filter((profileId): profileId is string => typeof profileId === 'string' && profileId.length > 0)
  const customFieldRows = transportOrderIds.length > 0 || profileIds.length > 0
    ? await em.find(CustomFieldValue, {
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        deletedAt: null,
        $or: [
          ...(transportOrderIds.length > 0
            ? [{ entityId: SALES_ORDER_ENTITY_ID, recordId: { $in: transportOrderIds } }]
            : []),
          ...(profileIds.length > 0
            ? [{ entityId: COMPANY_PROFILE_ENTITY_ID, recordId: { $in: profileIds } }]
            : []),
        ],
      })
    : []
  const fieldsByOrderId = new Map<string, TransportFields>()
  const companyFieldsByProfileId = new Map<string, TransportFields>()
  for (const row of customFieldRows) {
    const target = row.entityId === SALES_ORDER_ENTITY_ID ? fieldsByOrderId : companyFieldsByProfileId
    const fields = target.get(row.recordId) ?? {}
    fields[row.fieldKey] = fieldValue(row)
    target.set(row.recordId, fields)
  }
  for (const [orderId, role] of roleByOrderId) {
    const fields = fieldsByOrderId.get(orderId) ?? {}
    fields.transport_role = role
    fieldsByOrderId.set(orderId, fields)
  }
  const companyById = new Map<string, CompanyView>()
  for (const company of companies) {
    const profileId = company.companyProfile?.id ?? null
    const rating = profileId
      ? optionalNumber(companyFieldsByProfileId.get(profileId)?.carrier_rating)
      : null
    companyById.set(company.id, {
      id: company.id,
      name: company.displayName,
      profileId,
      carrierRating: rating,
    })
  }

  return {
    orderById,
    fieldsByOrderId,
    roleByOrderId,
    companyById,
    clientOrderIds: liveClientOrderIds,
  }
}

export async function loadTransportDetail(
  em: EntityManager,
  scope: TransportScope,
  transportId: string,
): Promise<TransportDetail | null> {
  const model = await loadReadModel(em, scope)
  if (model.roleByOrderId.get(transportId) !== 'client') return null
  const order = model.orderById.get(transportId)
  if (!order) return null
  return buildTransportDetail(model, order)
}

function matchesCarrierStatus(row: TransportRow, status: CarrierStatus): boolean {
  if (status === 'none') return row.carrier === null
  return row.carrier?.status === status
}

function searchText(row: TransportRow): string {
  return [row.orderNumber, row.customerName, row.pickupAddress, row.deliveryAddress]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLocaleLowerCase()
}

export async function loadTransportList(
  em: EntityManager,
  scope: TransportScope,
  query: TransportListQuery,
): Promise<TransportListResponse> {
  const model = await loadReadModel(em, scope)
  const normalizedSearch = query.search?.trim().toLocaleLowerCase() ?? ''
  const rows = model.clientOrderIds
    .map((orderId) => model.orderById.get(orderId))
    .filter((order): order is SalesOrder => order !== undefined)
    .map((order) => detailToRow(buildTransportDetail(model, order)))
    .filter((row) => normalizedSearch.length === 0 || searchText(row).includes(normalizedSearch))
    .filter((row) => !query.carrierStatus || matchesCarrierStatus(row, query.carrierStatus))

  const direction = query.sortDir === 'asc' ? 1 : -1
  rows.sort((left, right) => {
    const leftValue = query.sortField === 'pickupWindowStart'
      ? left.pickupWindowStart ?? ''
      : left.updatedAt
    const rightValue = query.sortField === 'pickupWindowStart'
      ? right.pickupWindowStart ?? ''
      : right.updatedAt
    const compared = leftValue.localeCompare(rightValue)
    return compared === 0
      ? left.orderNumber.localeCompare(right.orderNumber) * direction
      : compared * direction
  })

  const total = rows.length
  const offset = (query.page - 1) * query.pageSize
  return {
    items: rows.slice(offset, offset + query.pageSize),
    total,
    page: query.page,
    pageSize: query.pageSize,
  }
}
