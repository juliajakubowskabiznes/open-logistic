import { enabledModules } from '../modules'

type PageOverride = {
  metadata?: {
    navHidden?: boolean
  }
}

const expectedHiddenRoutes = [
  '/backend/checkout/pay-links',
  '/backend/checkout/templates',
  '/backend/checkout/transactions',
  '/backend/eudr',
  '/backend/eudr/evidence-submissions',
  '/backend/eudr/plots',
  '/backend/eudr/product-mappings',
  '/backend/eudr/risk-assessments',
  '/backend/eudr/statements',
  '/backend/example',
  '/backend/mutation-lifecycle',
  '/backend/payments',
  '/backend/phone_calls',
  '/backend/staff/time-tracking',
  '/backend/staff/time-tracking/board',
  '/backend/staff/time-tracking/entries',
  '/backend/staff/time-tracking/projects',
  '/backend/staff/time-tracking/reports',
  '/backend/staff/time-tracking/settings',
  '/backend/staff/time-tracking/timesheet',
  '/backend/storage/attachments',
  '/backend/todos',
  '/backend/todos/create',
  '/backend/umes-extensions',
  '/backend/umes-handlers',
  '/backend/umes-integrations',
  '/backend/umes-next-phases',
  '/backend/umes-query-extensions',
  '/backend/warranty_claims',
  '/backend/warranty_claims/create',
  '/backend/warranty_claims/registrations',
  '/backend/warranty_claims/registrations/create',
  '/backend/warranty_claims/settings',
  '/backend/warranty_claims/troubleshooting-guides',
  '/backend/warranty_claims/troubleshooting-guides/create',
  '/backend/warranty_claims/vendor-policies',
  '/backend/warranty_claims/vendor-policies/create',
  '/backend/wms',
  '/backend/wms/inventory',
  '/backend/wms/locations',
  '/backend/wms/lots',
  '/backend/wms/movements',
  '/backend/wms/reservations',
  '/backend/wms/warehouses',
  '/backend/wms/zones',
] as const

describe('hidden sidebar groups', () => {
  const hiddenRoutes = new Set(
    enabledModules.flatMap((entry) => {
      const pages = entry.overrides?.routes?.pages as Record<string, PageOverride | null> | undefined
      return Object.entries(pages ?? {})
        .filter(([, override]) => override?.metadata?.navHidden === true)
        .map(([path]) => path)
    }),
  )

  test.each(expectedHiddenRoutes)('hides %s from navigation', (path) => {
    expect(hiddenRoutes).toContain(path)
  })
})
