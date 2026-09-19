jest.mock('@open-mercato/shared/lib/encryption/find', () => ({
  findOneWithDecryption: (
    em: { findOne: (entityName: unknown, where: Record<string, unknown>) => Promise<unknown> },
    entityName: unknown,
    where: Record<string, unknown>,
  ) => em.findOne(entityName, where),
  findWithDecryption: (
    em: { find: (entityName: unknown, where: Record<string, unknown>) => Promise<unknown[]> },
    entityName: unknown,
    where: Record<string, unknown>,
  ) => em.find(entityName, where),
}))

import type { EntityManager } from '@mikro-orm/postgresql'
import {
  InboxDiscrepancy,
  InboxEmail,
  InboxProposal,
  InboxProposalAction,
  InboxSettings,
} from '../data/entities'
import { buildInboxOpsExampleSeeds, seedInboxOpsExamples } from '../lib/seedExamples'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222'
const NOW = new Date('2026-09-19T12:00:00.000Z')

type StoredRecord = Record<string, unknown> & { __entityName: unknown }

function matches(record: StoredRecord, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => {
    const recordValue = record[key]
    if (value === null) return recordValue == null
    return recordValue === value
  })
}

function createEntityManager() {
  const records: StoredRecord[] = []
  const em = {
    create: (entityName: unknown, data: Record<string, unknown>) => ({ ...data, __entityName: entityName }),
    persist: (record: StoredRecord) => {
      if (!records.includes(record)) records.push(record)
      return em
    },
    findOne: async (entityName: unknown, where: Record<string, unknown>) =>
      records.find((record) => record.__entityName === entityName && matches(record, where)) ?? null,
    find: async (entityName: unknown, where: Record<string, unknown>) =>
      records.filter((record) => record.__entityName === entityName && matches(record, where)),
    flush: jest.fn(async () => undefined),
  }
  records.push({
    __entityName: InboxSettings,
    id: '33333333-3333-4333-8333-333333333333',
    tenantId: TENANT_ID,
    organizationId: ORGANIZATION_ID,
    inboxAddress: 'ops-demo@example.test',
    isActive: true,
    deletedAt: null,
  })
  return { em: em as unknown as EntityManager, records }
}

const container = {
  resolve: () => {
    throw new Error('cache is not configured')
  },
}

describe('seedInboxOpsExamples', () => {
  it('builds realistic examples across the inbox states and categories', () => {
    const examples = buildInboxOpsExampleSeeds(NOW)

    expect(examples).toHaveLength(5)
    expect(new Set(examples.map((example) => example.status))).toEqual(
      new Set(['pending', 'partial', 'accepted']),
    )
    expect(new Set(examples.map((example) => example.category))).toEqual(
      new Set(['rfq', 'order', 'shipping_update', 'complaint', 'payment']),
    )
    expect(examples.flatMap((example) => example.actions).map((action) => action.actionType)).toEqual(
      expect.arrayContaining(['create_quote', 'create_order', 'update_shipment', 'log_activity', 'draft_reply']),
    )
  })

  it('persists scoped emails, proposals, actions, and discrepancies idempotently', async () => {
    const { em, records } = createEntityManager()

    const first = await seedInboxOpsExamples(em, container, {
      tenantId: TENANT_ID,
      organizationId: ORGANIZATION_ID,
    }, NOW)
    const second = await seedInboxOpsExamples(em, container, {
      tenantId: TENANT_ID,
      organizationId: ORGANIZATION_ID,
    }, NOW)

    expect(first).toEqual({ emails: 5, proposals: 5, actions: 9, discrepancies: 1 })
    expect(second).toEqual({ emails: 0, proposals: 0, actions: 0, discrepancies: 0 })
    expect(records.filter((record) => record.__entityName === InboxEmail)).toHaveLength(5)
    expect(records.filter((record) => record.__entityName === InboxProposal)).toHaveLength(5)
    expect(records.filter((record) => record.__entityName === InboxProposalAction)).toHaveLength(9)
    expect(records.filter((record) => record.__entityName === InboxDiscrepancy)).toHaveLength(1)
    expect(records.filter((record) => record.__entityName !== InboxSettings)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tenantId: TENANT_ID, organizationId: ORGANIZATION_ID }),
      ]),
    )
  })
})
