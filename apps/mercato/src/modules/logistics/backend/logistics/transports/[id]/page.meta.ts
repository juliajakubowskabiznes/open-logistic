export const metadata = {
  requireAuth: true,
  requireFeatures: ['logistics.view'],
  pageTitle: 'Transport details',
  pageTitleKey: 'logistics.detail.title',
  pageGroup: 'Our company',
  pageGroupKey: 'logistics.nav.group',
  navHidden: true,
  breadcrumb: [
    {
      label: 'AI Transports',
      labelKey: 'logistics.nav.transports',
      href: '/backend/logistics/transports',
    },
  ],
} as const
