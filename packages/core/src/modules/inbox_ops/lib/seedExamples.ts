import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { runWithCacheTenant } from '@open-mercato/cache'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import {
  InboxDiscrepancy,
  InboxEmail,
  InboxProposal,
  InboxProposalAction,
  InboxSettings,
  type ExtractedParticipant,
  type InboxActionStatus,
  type InboxActionType,
  type InboxDiscrepancyType,
  type InboxProposalCategory,
  type InboxProposalStatus,
} from '../data/entities'
import { REQUIRED_FEATURES_MAP } from './constants'
import { invalidateCountsCache, resolveCache } from './cache'

const SEED_SOURCE = 'inbox_ops.seed_examples'

export type InboxOpsSeedScope = {
  tenantId: string
  organizationId: string
}

type ExampleAction = {
  key: string
  actionType: InboxActionType
  description: string
  payload: Record<string, unknown>
  status?: InboxActionStatus
  confidence: number
}

type ExampleDiscrepancy = {
  key: string
  actionKey?: string
  type: InboxDiscrepancyType
  severity: 'warning' | 'error'
  description: string
  expectedValue?: string
  foundValue?: string
}

export type InboxOpsExampleSeed = {
  key: string
  messageId: string
  ageHours: number
  from: { name: string; email: string }
  subject: string
  body: string
  summary: string
  category: InboxProposalCategory
  status: InboxProposalStatus
  confidence: number
  detectedLanguage: string
  participants: ExtractedParticipant[]
  actions: ExampleAction[]
  discrepancies: ExampleDiscrepancy[]
}

export type InboxOpsSeedResult = {
  emails: number
  proposals: number
  actions: number
  discrepancies: number
}

function dateOnlyFrom(now: Date, days: number): string {
  const date = new Date(now)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function buildInboxOpsExampleSeeds(now = new Date()): InboxOpsExampleSeed[] {
  const pickupTomorrow = dateOnlyFrom(now, 1)
  const deliveryInTwoDays = dateOnlyFrom(now, 2)
  const pickupInThreeDays = dateOnlyFrom(now, 3)
  const deliveryInFourDays = dateOnlyFrom(now, 4)

  return [
    {
      key: 'baltic-paper-rfq',
      messageId: '<open-mercato-demo-inbox-baltic-paper-rfq@example.test>',
      ageHours: 2,
      from: { name: 'Anna Kowalska', email: 'anna.kowalska@baltic-paper.example' },
      subject: 'RFQ: Gdańsk to Berlin, 10 pallets',
      body: `Hello, please quote a curtainsider from Gdańsk to Berlin. The load is 10 pallets / 6,000 kg, pickup ${pickupTomorrow}, delivery ${deliveryInTwoDays}. Please confirm availability and your EUR price.`,
      summary: 'Baltic Paper requests a quote for 10 pallets (6,000 kg) from Gdańsk to Berlin.',
      category: 'rfq',
      status: 'pending',
      confidence: 0.96,
      detectedLanguage: 'en',
      participants: [
        { name: 'Anna Kowalska', email: 'anna.kowalska@baltic-paper.example', role: 'buyer', matchConfidence: 0.92 },
      ],
      actions: [
        {
          key: 'create-quote',
          actionType: 'create_quote',
          description: 'inbox_ops.action.desc.create_quote',
          confidence: 0.95,
          payload: {
            customerName: 'Baltic Paper Demo',
            customerEmail: 'anna.kowalska@baltic-paper.example',
            currencyCode: 'EUR',
            requestedDeliveryDate: deliveryInTwoDays,
            customerReference: 'RFQ-GDN-BER-10PLT',
            lineItems: [
              {
                productName: 'Road freight Gdańsk–Berlin',
                quantity: '1',
                unitPrice: '1200',
                kind: 'service',
                description: 'Curtainsider, 10 pallets, 6,000 kg',
              },
            ],
          },
        },
        {
          key: 'draft-reply',
          actionType: 'draft_reply',
          description: 'inbox_ops.action.desc.draft_reply',
          confidence: 0.94,
          payload: {
            to: 'anna.kowalska@baltic-paper.example',
            toName: 'Anna Kowalska',
            subject: 'Re: RFQ: Gdańsk to Berlin, 10 pallets',
            body: 'Thank you for your request. We can offer a curtainsider for EUR 1,200 and will hold the slot while you review the quotation.',
            context: 'Quote prepared from the forwarded transport request.',
          },
        },
      ],
      discrepancies: [],
    },
    {
      key: 'amber-home-order',
      messageId: '<open-mercato-demo-inbox-amber-home-order@example.test>',
      ageHours: 5,
      from: { name: 'Marek Nowak', email: 'marek.nowak@amber-home.example' },
      subject: 'Confirmed transport order PO-4821',
      body: `Please proceed with our transport order PO-4821 from Poznań to Hamburg. Cargo: 4 pallets / 2,000 kg. Pickup ${pickupInThreeDays}, delivery ${deliveryInFourDays}. Agreed price: EUR 650.`,
      summary: 'Amber Home confirms transport order PO-4821 from Poznań to Hamburg for EUR 650.',
      category: 'order',
      status: 'pending',
      confidence: 0.98,
      detectedLanguage: 'en',
      participants: [
        { name: 'Marek Nowak', email: 'marek.nowak@amber-home.example', role: 'buyer', matchConfidence: 0.89 },
      ],
      actions: [
        {
          key: 'create-order',
          actionType: 'create_order',
          description: 'inbox_ops.action.desc.create_order',
          confidence: 0.98,
          payload: {
            customerName: 'Amber Home Demo',
            customerEmail: 'marek.nowak@amber-home.example',
            currencyCode: 'EUR',
            requestedDeliveryDate: deliveryInFourDays,
            customerReference: 'PO-4821',
            lineItems: [
              {
                productName: 'Road freight Poznań–Hamburg',
                quantity: '1',
                unitPrice: '650',
                kind: 'service',
                description: '4 pallets, 2,000 kg',
              },
            ],
          },
        },
        {
          key: 'draft-reply',
          actionType: 'draft_reply',
          description: 'inbox_ops.action.desc.draft_reply',
          confidence: 0.97,
          payload: {
            to: 'marek.nowak@amber-home.example',
            toName: 'Marek Nowak',
            subject: 'Re: Confirmed transport order PO-4821',
            body: 'Thank you. We have captured PO-4821 and will confirm the assigned vehicle shortly.',
            context: 'Customer confirmed the transport order and agreed price.',
          },
        },
      ],
      discrepancies: [],
    },
    {
      key: 'north-goods-shipping-update',
      messageId: '<open-mercato-demo-inbox-north-goods-update@example.test>',
      ageHours: 11,
      from: { name: 'Julia Weber', email: 'julia.weber@north-goods.example' },
      subject: 'TR-001 vehicle assigned and ETA updated',
      body: `Vehicle DEMO-001 has been assigned to TR-001. Loading is confirmed for ${pickupTomorrow} at 08:00. Current ETA Berlin is ${deliveryInTwoDays} at 14:30.`,
      summary: 'Carrier assigned vehicle DEMO-001 to TR-001 and provided an updated Berlin ETA.',
      category: 'shipping_update',
      status: 'partial',
      confidence: 0.94,
      detectedLanguage: 'en',
      participants: [
        { name: 'Julia Weber', email: 'julia.weber@north-goods.example', role: 'logistics', matchConfidence: 0.86 },
      ],
      actions: [
        {
          key: 'update-shipment',
          actionType: 'update_shipment',
          description: 'inbox_ops.action.desc.update_shipment',
          status: 'executed',
          confidence: 0.95,
          payload: {
            orderNumber: 'TR-001',
            carrierName: 'Blue Road Demo',
            statusLabel: 'Vehicle assigned',
            estimatedDelivery: `${deliveryInTwoDays}T14:30:00.000Z`,
            notes: 'Vehicle DEMO-001; pickup confirmed for 08:00.',
          },
        },
        {
          key: 'draft-reply',
          actionType: 'draft_reply',
          description: 'inbox_ops.action.desc.draft_reply',
          confidence: 0.91,
          payload: {
            to: 'julia.weber@north-goods.example',
            toName: 'Julia Weber',
            subject: 'Re: TR-001 vehicle assigned and ETA updated',
            body: 'Vehicle and ETA details have been recorded. Thank you for the update.',
            context: 'Shipment update was recorded; acknowledgement remains pending.',
          },
        },
      ],
      discrepancies: [],
    },
    {
      key: 'green-parts-complaint',
      messageId: '<open-mercato-demo-inbox-green-parts-complaint@example.test>',
      ageHours: 20,
      from: { name: 'Petra Nováková', email: 'petra.novakova@green-parts.example' },
      subject: 'Damage reported on delivery TR-003',
      body: 'Two pallets from transport TR-003 arrived with torn wrapping and visible moisture. Please register the complaint and advise what photos and documents you require.',
      summary: 'Green Parts reports damaged packaging and moisture on two pallets delivered under TR-003.',
      category: 'complaint',
      status: 'pending',
      confidence: 0.93,
      detectedLanguage: 'en',
      participants: [
        { name: 'Petra Nováková', email: 'petra.novakova@green-parts.example', role: 'buyer', matchConfidence: 0.72 },
      ],
      actions: [
        {
          key: 'log-activity',
          actionType: 'log_activity',
          description: 'inbox_ops.action.desc.log_activity',
          confidence: 0.9,
          payload: {
            contactType: 'company',
            contactName: 'Green Parts Demo',
            activityType: 'email',
            subject: 'Damage reported on delivery TR-003',
            body: 'Two pallets arrived with torn wrapping and visible moisture.',
          },
        },
        {
          key: 'draft-reply',
          actionType: 'draft_reply',
          description: 'inbox_ops.action.desc.draft_reply',
          confidence: 0.91,
          payload: {
            to: 'petra.novakova@green-parts.example',
            toName: 'Petra Nováková',
            subject: 'Re: Damage reported on delivery TR-003',
            body: 'We have registered the report. Please send photos of each affected pallet and the signed delivery note so our claims team can review it.',
            context: 'Initial complaint acknowledgement and evidence request.',
          },
        },
      ],
      discrepancies: [
        {
          key: 'missing-evidence',
          type: 'other',
          severity: 'warning',
          description: 'The complaint does not include photos or a signed delivery note.',
          expectedValue: 'Photos and signed delivery note',
          foundValue: 'No attachments',
        },
      ],
    },
    {
      key: 'river-packaging-payment',
      messageId: '<open-mercato-demo-inbox-river-packaging-payment@example.test>',
      ageHours: 30,
      from: { name: 'Lena Fischer', email: 'lena.fischer@river-packaging.example' },
      subject: 'Payment confirmation INV-2026-184',
      body: 'Payment of EUR 2,450 for invoice INV-2026-184 was sent today. The bank reference is RF185921. Please confirm receipt when it reaches your account.',
      summary: 'River Packaging confirms a EUR 2,450 payment for invoice INV-2026-184.',
      category: 'payment',
      status: 'accepted',
      confidence: 0.99,
      detectedLanguage: 'en',
      participants: [
        { name: 'Lena Fischer', email: 'lena.fischer@river-packaging.example', role: 'finance', matchConfidence: 0.96 },
      ],
      actions: [
        {
          key: 'log-activity',
          actionType: 'log_activity',
          description: 'inbox_ops.action.desc.log_activity',
          status: 'executed',
          confidence: 0.99,
          payload: {
            contactType: 'company',
            contactName: 'River Packaging Demo',
            activityType: 'email',
            subject: 'Payment confirmation INV-2026-184',
            body: 'EUR 2,450 sent with bank reference RF185921.',
          },
        },
      ],
      discrepancies: [],
    },
  ]
}

function receivedAtFor(now: Date, ageHours: number): Date {
  return new Date(now.getTime() - ageHours * 60 * 60 * 1000)
}

function seedMetadata(seedKey: string, itemKey?: string): Record<string, unknown> {
  return { source: SEED_SOURCE, seedKey, ...(itemKey ? { itemKey } : {}) }
}

function matchesSeedItem(metadata: Record<string, unknown> | null | undefined, seedKey: string, itemKey: string): boolean {
  return metadata?.source === SEED_SOURCE && metadata.seedKey === seedKey && metadata.itemKey === itemKey
}

export async function seedInboxOpsExamples(
  em: EntityManager,
  container: Pick<AwilixContainer, 'resolve'>,
  scope: InboxOpsSeedScope,
  now = new Date(),
): Promise<InboxOpsSeedResult> {
  const result: InboxOpsSeedResult = { emails: 0, proposals: 0, actions: 0, discrepancies: 0 }
  const settings = await findOneWithDecryption(
    em,
    InboxSettings,
    { ...scope, isActive: true, deletedAt: null },
    undefined,
    scope,
  )
  const inboxAddress = settings?.inboxAddress ?? `ops-${scope.organizationId.slice(0, 8)}@inbox.mercato.local`

  for (const seed of buildInboxOpsExampleSeeds(now)) {
    let email = await findOneWithDecryption(
      em,
      InboxEmail,
      { ...scope, messageId: seed.messageId, deletedAt: null },
      undefined,
      scope,
    )
    const receivedAt = receivedAtFor(now, seed.ageHours)
    if (!email) {
      email = em.create(InboxEmail, {
        id: randomUUID(),
        ...scope,
        messageId: seed.messageId,
        forwardedByAddress: seed.from.email,
        forwardedByName: seed.from.name,
        toAddress: inboxAddress,
        subject: seed.subject,
        replyTo: seed.from.email,
        rawText: seed.body,
        cleanedText: seed.body,
        threadMessages: [
          {
            messageId: seed.messageId,
            from: seed.from,
            to: [{ name: 'AI Inbox', email: inboxAddress }],
            subject: seed.subject,
            date: receivedAt.toISOString(),
            body: seed.body,
            contentType: 'text',
            isForwarded: true,
          },
        ],
        detectedLanguage: seed.detectedLanguage,
        attachmentIds: [],
        receivedAt,
        status: seed.discrepancies.length ? 'needs_review' : 'processed',
        metadata: seedMetadata(seed.key),
        createdAt: receivedAt,
        updatedAt: receivedAt,
      })
      em.persist(email)
      result.emails += 1
    }

    let proposal = await findOneWithDecryption(
      em,
      InboxProposal,
      { ...scope, inboxEmailId: email.id, deletedAt: null },
      undefined,
      scope,
    )
    if (!proposal) {
      proposal = em.create(InboxProposal, {
        id: randomUUID(),
        ...scope,
        inboxEmailId: email.id,
        summary: seed.summary,
        participants: seed.participants,
        confidence: seed.confidence.toFixed(2),
        detectedLanguage: seed.detectedLanguage,
        category: seed.category,
        status: seed.status,
        possiblyIncomplete: seed.discrepancies.length > 0,
        llmModel: 'demo/mock-extractor',
        llmTokensUsed: 0,
        workingLanguage: 'en',
        metadata: seedMetadata(seed.key),
        createdAt: receivedAt,
        updatedAt: receivedAt,
      })
      em.persist(proposal)
      result.proposals += 1
    }

    const existingActions = await findWithDecryption(
      em,
      InboxProposalAction,
      { ...scope, proposalId: proposal.id, deletedAt: null },
      undefined,
      scope,
    )
    const actionByKey = new Map<string, InboxProposalAction>()
    for (const [sortOrder, actionSeed] of seed.actions.entries()) {
      let action = existingActions.find((candidate) => matchesSeedItem(candidate.metadata, seed.key, actionSeed.key))
      if (!action) {
        action = em.create(InboxProposalAction, {
          id: randomUUID(),
          ...scope,
          proposalId: proposal.id,
          sortOrder,
          actionType: actionSeed.actionType,
          description: actionSeed.description,
          payload: actionSeed.payload,
          status: actionSeed.status ?? 'pending',
          confidence: actionSeed.confidence.toFixed(2),
          requiredFeature: REQUIRED_FEATURES_MAP[actionSeed.actionType],
          executedAt: actionSeed.status === 'executed' ? receivedAt : null,
          metadata: seedMetadata(seed.key, actionSeed.key),
          createdAt: receivedAt,
          updatedAt: receivedAt,
        })
        em.persist(action)
        result.actions += 1
      }
      actionByKey.set(actionSeed.key, action)
    }

    const existingDiscrepancies = await findWithDecryption(
      em,
      InboxDiscrepancy,
      { ...scope, proposalId: proposal.id, deletedAt: null },
      undefined,
      scope,
    )
    for (const discrepancySeed of seed.discrepancies) {
      const exists = existingDiscrepancies.some((candidate) =>
        matchesSeedItem(candidate.metadata, seed.key, discrepancySeed.key),
      )
      if (exists) continue
      em.persist(em.create(InboxDiscrepancy, {
        id: randomUUID(),
        ...scope,
        proposalId: proposal.id,
        actionId: discrepancySeed.actionKey ? actionByKey.get(discrepancySeed.actionKey)?.id ?? null : null,
        type: discrepancySeed.type,
        severity: discrepancySeed.severity,
        description: discrepancySeed.description,
        expectedValue: discrepancySeed.expectedValue ?? null,
        foundValue: discrepancySeed.foundValue ?? null,
        resolved: false,
        metadata: seedMetadata(seed.key, discrepancySeed.key),
        createdAt: receivedAt,
        updatedAt: receivedAt,
      }))
      result.discrepancies += 1
    }
  }

  await em.flush()
  const cache = resolveCache(container)
  await runWithCacheTenant(scope.tenantId, () => invalidateCountsCache(cache, scope.tenantId))
  return result
}
