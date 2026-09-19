import type { CustomEntitySpec } from '@open-mercato/shared/modules/entities'
import { cf } from '@open-mercato/shared/modules/dsl'
import { E } from '@/.mercato/generated/entities.ids.generated'
import { VEHICLE_TYPE_NAMES } from './lib/vehicle-types'

const transportGroup = { code: 'transport', title: 'Transport' }
const carrierGroup = { code: 'carrier', title: 'Carrier' }

export const LOGISTICS_ENTITY_IDS = [
  E.sales.sales_order,
  E.customers.customer_company_profile,
] as const

export const TRANSPORT_ROLES = ['client', 'carrier', 'additional_load'] as const
export const EXCHANGE_SOURCES = ['seed', 'manual', 'trans', 'timocom'] as const

export const entities: CustomEntitySpec[] = [
  {
    id: E.sales.sales_order,
    fields: [
      cf.select('transport_role', [...TRANSPORT_ROLES], {
        label: 'Transport role',
        group: transportGroup,
        formEditable: true,
        listVisible: true,
        filterable: true,
        indexed: true,
      }),
      cf.text('transport_parent_id', {
        label: 'Parent transport order',
        group: transportGroup,
        formEditable: true,
        filterable: true,
        indexed: true,
      }),
      cf.text('pickup_address', {
        label: 'Pickup address',
        group: transportGroup,
        formEditable: true,
        listVisible: true,
        filterable: true,
        indexed: true,
      }),
      cf.text('delivery_address', {
        label: 'Delivery address',
        group: transportGroup,
        formEditable: true,
        listVisible: true,
        filterable: true,
        indexed: true,
      }),
      cf.datetime('pickup_window_start', {
        label: 'Pickup window start',
        group: transportGroup,
        formEditable: true,
        listVisible: true,
        filterable: true,
      }),
      cf.datetime('pickup_window_end', {
        label: 'Pickup window end',
        group: transportGroup,
        formEditable: true,
        filterable: true,
      }),
      cf.integer('cargo_pallets', {
        label: 'Cargo (pallets)',
        group: transportGroup,
        formEditable: true,
        listVisible: true,
        filterable: true,
      }),
      cf.integer('cargo_weight_kg', {
        label: 'Cargo weight (kg)',
        group: transportGroup,
        formEditable: true,
      }),
      cf.float('client_price', {
        label: 'Client price (PLN)',
        group: transportGroup,
        formEditable: true,
        listVisible: true,
      }),
      cf.float('max_carrier_cost', {
        label: 'Maximum carrier cost (PLN)',
        group: transportGroup,
        formEditable: true,
      }),
      cf.select('vehicle_type', [...VEHICLE_TYPE_NAMES], {
        label: 'Vehicle type',
        group: carrierGroup,
        formEditable: true,
      }),
      cf.integer('vehicle_capacity_pallets', {
        label: 'Vehicle capacity (pallets)',
        group: carrierGroup,
        formEditable: true,
      }),
      cf.integer('vehicle_capacity_kg', {
        label: 'Vehicle capacity (kg)',
        group: carrierGroup,
        formEditable: true,
      }),
      cf.text('vehicle_plate', {
        label: 'Vehicle registration',
        group: carrierGroup,
        formEditable: true,
      }),
      cf.float('carrier_cost', {
        label: 'Carrier cost (PLN)',
        group: carrierGroup,
        formEditable: true,
      }),
      cf.select('exchange_source', [...EXCHANGE_SOURCES], {
        label: 'Exchange source',
        group: transportGroup,
        formEditable: true,
        filterable: true,
      }),
      cf.text('exchange_ref', {
        label: 'Exchange reference',
        group: transportGroup,
        formEditable: true,
        filterable: true,
        indexed: true,
      }),
      cf.multiline('dispatch_note', {
        label: 'Dispatch note',
        group: transportGroup,
        formEditable: true,
        editor: 'plain',
      }),
    ],
  },
  {
    id: E.customers.customer_company_profile,
    fields: [
      cf.boolean('is_carrier', {
        label: 'Carrier',
        defaultValue: false,
        formEditable: true,
        listVisible: true,
        filterable: true,
        indexed: true,
      }),
      cf.integer('carrier_rating', {
        label: 'Carrier rating (1-5)',
        formEditable: true,
        listVisible: true,
        filterable: true,
        validation: [
          { rule: 'integer', message: 'Carrier rating must be an integer' },
          { rule: 'gte', param: 1, message: 'Carrier rating must be at least 1' },
          { rule: 'lte', param: 5, message: 'Carrier rating must be at most 5' },
        ],
      }),
    ],
  },
]

export default entities
