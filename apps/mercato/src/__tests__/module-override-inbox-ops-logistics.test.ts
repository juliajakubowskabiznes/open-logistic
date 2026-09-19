import { enabledModules } from '../modules'

type PageOverride = {
  metadata?: Record<string, unknown>
}

describe('Inbox Ops Logistics navigation override', () => {
  const logisticsModule = enabledModules.find((entry) => entry.id === 'logistics')
  const pages = logisticsModule?.overrides?.routes?.pages as Record<string, PageOverride | null> | undefined

  test('places the canonical proposals page in the Logistics group', () => {
    expect(pages?.['/backend/inbox-ops']?.metadata).toMatchObject({
      pageGroup: 'Logistics',
      pageGroupKey: 'logistics.nav.group',
      pageOrder: 10,
    })
  })

  test.each([
    '/backend/inbox-ops/proposals/[id]',
    '/backend/inbox-ops/settings',
    '/backend/inbox-ops/log',
  ])('keeps %s in the Logistics context', (path) => {
    expect(pages?.[path]?.metadata).toMatchObject({
      pageGroup: 'Logistics',
      pageGroupKey: 'logistics.nav.group',
    })
  })
})
