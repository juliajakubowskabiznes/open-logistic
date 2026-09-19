import type { GenCtx } from './common'
import {
  freightOfferEvent,
  freightOfferPublish,
  freightOfferSearch,
  freightQuoteAccept,
  freightQuoteCreate,
  vehicleSpacePublish,
  vehicleSpaceSearch,
} from './offers'

export type TemplateFn = (ctx: GenCtx) => unknown

const TEMPLATES: Record<string, TemplateFn> = {
  'freight.offer.publish': freightOfferPublish,
  'freight.offer.search': freightOfferSearch,
  'freight.offer.event': freightOfferEvent,
  'vehicle.space.publish': vehicleSpacePublish,
  'vehicle.space.search': vehicleSpaceSearch,
  'freight.quote.create': freightQuoteCreate,
  'freight.quote.accept': freightQuoteAccept,
  none: () => undefined,
}

export const TEMPLATE_DEFAULT_OPS: Record<string, string> = {
  'freight.offer.publish': 'POST /freight-exchange/3/my-freight-offers',
  'freight.offer.search': 'POST /freight-exchange/3/freight-offers/search',
  'freight.offer.event': 'POST /freight-exchange/3/my-freight-offers',
  'vehicle.space.publish': 'POST /freight-exchange/3/my-vehicle-space-offers',
  'vehicle.space.search': 'POST /freight-exchange/3/vehicle-space-offers/search',
  'freight.quote.create': 'POST /freight-exchange/3/freight-quotes',
  'freight.quote.accept': 'DELETE /freight-exchange/3/my-freight-offers/{publicOfferId}',
}

export function listTemplates(): string[] {
  return Object.keys(TEMPLATES).filter((k) => k !== 'none').sort()
}

export function generateBody(template: string | undefined, ctx: GenCtx): unknown {
  if (!template || template === 'none') return undefined
  const fn = TEMPLATES[template]
  if (!fn) {
    throw new Error(
      `[internal] Unknown template "${template}". Available: ${listTemplates().join(', ')}`,
    )
  }
  return fn(ctx)
}

export function deepMerge(base: unknown, overlay: unknown): unknown {
  if (overlay === undefined) return base
  if (overlay === null || typeof overlay !== 'object' || Array.isArray(overlay)) return overlay
  if (base === null || typeof base !== 'object' || Array.isArray(base)) return overlay
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [k, v] of Object.entries(overlay as Record<string, unknown>)) {
    out[k] = deepMerge(out[k], v)
  }
  return out
}
