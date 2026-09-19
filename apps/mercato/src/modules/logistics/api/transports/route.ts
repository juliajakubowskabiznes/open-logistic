import { z } from 'zod'
import { NextResponse } from 'next/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { reportError } from '@open-mercato/telemetry'
import { loadTransportList, TooManyTransportsError } from '../../lib/transports'
import {
  LogisticsRequestContextError,
  resolveLogisticsRequestContext,
} from '../../lib/request-context'

const logger = createLogger('logistics').child({ component: 'transports-list' })

export const transportListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().max(200).optional(),
  carrierStatus: z.enum(['none', 'pending_approval', 'approved']).optional(),
  sortField: z.enum(['updatedAt', 'pickupWindowStart']).default('updatedAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
})

const errorSchema = z.object({ error: z.string(), code: z.string() })
const transportRowSchema = z.object({
  id: z.string().uuid(),
  orderNumber: z.string(),
  customerName: z.string(),
  pickupAddress: z.string().nullable(),
  deliveryAddress: z.string().nullable(),
  pickupWindowStart: z.string().nullable(),
  pickupWindowEnd: z.string().nullable(),
  cargoPallets: z.number().nullable(),
  cargoWeightKg: z.number().nullable(),
  clientPrice: z.number().nullable(),
  carrier: z.object({
    orderId: z.string().uuid(),
    name: z.string(),
    status: z.enum(['pending_approval', 'approved']),
    cost: z.number().nullable(),
    vehicleType: z.string().nullable(),
    updatedAt: z.string(),
  }).nullable(),
  additionalLoads: z.object({
    pending: z.number().int(),
    approved: z.number().int(),
    pendingOrderId: z.string().uuid().nullable(),
    pendingUpdatedAt: z.string().nullable(),
  }),
  freeSpace: z.object({
    pallets: z.number().nullable(),
    kg: z.number().nullable(),
    limiting: z.enum(['pallets', 'kg']).nullable(),
  }).nullable(),
  updatedAt: z.string(),
})
const listResponseSchema = z.object({
  items: z.array(transportRowSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
})

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['logistics.view'] },
}

function contextErrorMessage(code: LogisticsRequestContextError['code'], translate: (key: string, fallback?: string) => string): string {
  if (code === 'unauthorized') return translate('logistics.errors.unauthorized', 'Authentication is required.')
  if (code === 'forbidden') return translate('logistics.errors.forbidden', 'This organization is not available.')
  return translate('logistics.errors.organizationRequired', 'Select an organization to view transports.')
}

export async function GET(request: Request) {
  const { translate } = await resolveTranslations()
  try {
    const query = transportListQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))
    const { em, scope } = await resolveLogisticsRequestContext(request)
    const result = await loadTransportList(em, scope, query)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        error: translate('logistics.errors.invalidQuery', 'Invalid transport query.'),
        code: 'invalid_query',
        details: error.issues,
      }, { status: 400 })
    }
    if (error instanceof LogisticsRequestContextError) {
      return NextResponse.json({
        error: contextErrorMessage(error.code, translate),
        code: error.code,
      }, { status: error.status })
    }
    if (error instanceof TooManyTransportsError) {
      return NextResponse.json({
        error: translate('logistics.errors.tooManyTransports', 'Too many transports to display.'),
        code: error.code,
      }, { status: 400 })
    }
    logger.error('Failed to load transport list', { err: error })
    reportError(error, { module: 'logistics', code: 'logistics.transport_list_failed' })
    return NextResponse.json({
      error: translate('logistics.errors.loadFailed', 'Could not load transports.'),
      code: 'load_failed',
    }, { status: 500 })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Logistics',
  summary: 'Dispatcher transports',
  methods: {
    GET: {
      summary: 'List dispatcher transports',
      description: 'Returns customer transport orders with active carrier and additional-load summaries.',
      tags: ['Logistics'],
      query: transportListQuerySchema,
      responses: [{ status: 200, description: 'Paginated transports.', schema: listResponseSchema }],
      errors: [
        { status: 400, description: 'Invalid query or missing organization.', schema: errorSchema },
        { status: 401, description: 'Authentication required.', schema: errorSchema },
        { status: 403, description: 'Organization access denied.', schema: errorSchema },
        { status: 500, description: 'Unexpected server error.', schema: errorSchema },
      ],
    },
  },
}
