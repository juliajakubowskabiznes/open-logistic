import type { ModuleCli } from '@open-mercato/shared/modules/registry'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { EntityManager } from '@mikro-orm/postgresql'
import { seedLogisticsExamples } from './lib/seed-examples'

function parseArgs(rest: string[]): Record<string, string> {
  const args: Record<string, string> = {}
  for (let index = 0; index < rest.length; index += 1) {
    const part = rest[index]
    if (!part?.startsWith('--')) continue
    const [rawKey, inlineValue] = part.slice(2).split('=')
    if (!rawKey) continue
    if (inlineValue !== undefined) {
      args[rawKey] = inlineValue
      continue
    }
    const next = rest[index + 1]
    if (next && !next.startsWith('--')) {
      args[rawKey] = next
      index += 1
    }
  }
  return args
}

const seedExamplesCommand: ModuleCli = {
  command: 'seed-examples',
  async run(rest) {
    const args = parseArgs(rest)
    const tenantId = String(args.tenantId ?? args.tenant ?? '')
    const organizationId = String(args.organizationId ?? args.org ?? args.orgId ?? '')
    if (!tenantId || !organizationId) {
      console.error('Usage: mercato logistics seed-examples --tenant <tenantId> --org <organizationId>')
      return
    }

    const container = await createRequestContainer()
    try {
      const em = container.resolve<EntityManager>('em')
      await seedLogisticsExamples(em, container, { tenantId, organizationId }, {
        logger: (message) => console.log(`  · ${message}`),
      })
      console.log('Logistics demo data seeded for organization', organizationId)
    } finally {
      const disposable = container as { dispose?: () => Promise<void> }
      await disposable.dispose?.()
    }
  },
}

export default [seedExamplesCommand]
