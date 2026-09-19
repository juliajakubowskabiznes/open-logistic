import { z } from 'zod'
import { NextResponse } from 'next/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { reportError } from '@open-mercato/telemetry'
import { loadTransportDetail, TooManyTransportsError } from '../../../lib/transports'
import {
  LogisticsRequestContextError,
  resolveLogisticsRequestContext,
} from '../../../lib/request-context'

const logger = createLogger('logistics').child({ component: 'transport-detail' })
const paramsSchema = z.object({ id: z.string().uuid() })
const errorSchema = z.object({ error: z.string(), code: z.string() })
const detailResponseSchema = z.object({
  order1: z.object({
    id: z.string().uuid(),
    orderNumber: z.string(),
    status: z.string(),
    customerId: z.string().uuid().nullable(),
    customerName: z.string(),
    updatedAt: z.string(),
    fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  }),
  order2: z.object({}).passthrough().nullable(),
  carrierHistory: z.array(z.object({}).passthrough()),
  additionalLoads: z.array(z.object({}).passthrough()),
  freeSpace: z.object({
    pallets: z.number().nullable(),
    kg: z.number().nullable(),
    limiting: z.enum(['pallets', 'kg']).nullable(),
  }).nullable(),
})

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['logistics.view'] },
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { translate } = await resolveTranslations()
  try {
    const { id } = paramsSchema.parse(params)
    const { em, scope } = await resolveLogisticsRequestContext(request)
    const detail = await loadTransportDetail(em, scope, id)
    if (!detail) {
      return NextResponse.json({
        error: translate('logistics.errors.notFound', 'Transport was not found.'),
        code: 'not_found',
      }, { status: 404 })
    }
    return NextResponse.json(detail)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        error: translate('logistics.errors.invalidId', 'Invalid transport identifier.'),
        code: 'invalid_id',
      }, { status: 400 })
    }
    if (error instanceof LogisticsRequestContextError) {
      const message = error.code === 'unauthorized'
        ? translate('logistics.errors.unauthorized', 'Authentication is required.')
        : error.code === 'forbidden'
          ? translate('logistics.errors.forbidden', 'This organization is not available.')
          : translate('logistics.errors.organizationRequired', 'Select an organization to view transports.')
      return NextResponse.json({ error: message, code: error.code }, { status: error.status })
    }
    if (error instanceof TooManyTransportsError) {
      return NextResponse.json({
        error: translate('logistics.errors.tooManyTransports', 'Too many transports to display.'),
        code: error.code,
      }, { status: 400 })
    }
    logger.error('Failed to load transport detail', { err: error })
    reportError(error, { module: 'logistics', code: 'logistics.transport_detail_failed' })
    return NextResponse.json({
      error: translate('logistics.errors.loadFailed', 'Could not load transport details.'),
      code: 'load_failed',
    }, { status: 500 })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Logistics',
  summary: 'Dispatcher transport details',
  pathParams: paramsSchema,
  methods: {
    GET: {
      summary: 'Get a dispatcher transport',
      description: 'Returns Order 1, active and rejected Order 2 records, additional loads and free capacity.',
      tags: ['Logistics'],
      responses: [{ status: 200, description: 'Transport detail.', schema: detailResponseSchema }],
      errors: [
        { status: 400, description: 'Invalid id or missing organization.', schema: errorSchema },
        { status: 401, description: 'Authentication required.', schema: errorSchema },
        { status: 403, description: 'Organization access denied.', schema: errorSchema },
        { status: 404, description: 'Transport not found.', schema: errorSchema },
        { status: 500, description: 'Unexpected server error.', schema: errorSchema },
      ],
    },
  },
}
