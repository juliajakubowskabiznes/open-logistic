import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { ModuleCli } from '@open-mercato/shared/modules/registry'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { seedInboxOpsExamples } from './lib/seedExamples'

function parseScope(rest: string[]) {
  const args: Record<string, string> = {}
  for (let index = 0; index < rest.length; index += 1) {
    const part = rest[index]
    if (!part?.startsWith('--')) continue
    const [key, inlineValue] = part.slice(2).split('=', 2)
    if (inlineValue !== undefined) {
      args[key] = inlineValue
    } else if (rest[index + 1] && !rest[index + 1]!.startsWith('--')) {
      args[key] = rest[++index]!
    }
  }
  return z.object({ tenantId: z.uuid(), organizationId: z.uuid() }).parse({
    tenantId: args.tenant ?? args.tenantId,
    organizationId: args.org ?? args.orgId ?? args.organizationId,
  })
}

const seedExamplesCommand: ModuleCli = {
  command: 'seed-examples',
  async run(rest) {
    const scope = parseScope(rest)
    const container = await createRequestContainer()
    try {
      const em = container.resolve<EntityManager>('em')
      const result = await em.transactional((transactionalEm) =>
        seedInboxOpsExamples(transactionalEm, container, scope),
      )
      process.stdout.write(`${JSON.stringify({ scope, ...result }, null, 2)}\n`)
    } finally {
      await container.dispose()
    }
  },
}

const commands = [seedExamplesCommand]

export default commands
