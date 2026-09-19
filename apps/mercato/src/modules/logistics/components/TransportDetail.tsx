"use client"

import * as React from 'react'
import Link from 'next/link'
import { PackageOpen, Truck } from 'lucide-react'
import { FormHeader } from '@open-mercato/ui/backend/forms'
import { SectionHeader, CollapsibleSection } from '@open-mercato/ui/backend/SectionHeader'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { Badge, type BadgeVariant } from '@open-mercato/ui/primitives/badge'
import { Button } from '@open-mercato/ui/primitives/button'
import { ErrorMessage, LoadingMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import type { TransportDetail, TransportOrder } from '../types'

function statusVariant(status: string): BadgeVariant {
  if (status === 'approved' || status === 'confirmed') return 'success'
  if (status === 'pending_approval') return 'warning'
  if (status === 'rejected' || status === 'cancelled') return 'error'
  return 'neutral'
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function formatMoney(value: unknown): string {
  const amount = asNumber(value)
  return amount == null
    ? '—'
    : new Intl.NumberFormat(undefined, { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 }).format(amount)
}

function formatNumber(value: unknown, suffix: string): string {
  const amount = asNumber(value)
  return amount == null ? '—' : `${new Intl.NumberFormat().format(amount)} ${suffix}`
}

function route(order: TransportOrder): string {
  return `${asString(order.fields.pickup_address) ?? '—'} → ${asString(order.fields.delivery_address) ?? '—'}`
}

function dateTime(value: unknown): string {
  const raw = asString(value)
  return raw ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(raw)) : '—'
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  return <Badge variant={statusVariant(status)} dot>{label}</Badge>
}

function DetailValue({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0 space-y-1', className)}>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm">{value}</dd>
    </div>
  )
}

function capacityTone(remaining: number | null, capacity: number | null): string {
  if (remaining == null || capacity == null || capacity <= 0) return ''
  if (remaining < 0) return 'font-semibold text-status-error-text'
  if (remaining / capacity < 0.1) return 'font-semibold text-status-warning-text'
  return 'font-semibold'
}

export function TransportDetailView({ transportId }: { transportId: string | null }) {
  const t = useT()
  const scopeVersion = useOrganizationScopeVersion()
  const [data, setData] = React.useState<TransportDetail | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [notFound, setNotFound] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [reloadToken, setReloadToken] = React.useState(0)

  React.useEffect(() => {
    const controller = new AbortController()
    async function load() {
      if (!transportId) {
        setNotFound(true)
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)
      setNotFound(false)
      try {
        const call = await apiCall<TransportDetail>(`/api/logistics/transports/${transportId}`, { signal: controller.signal })
        if (call.status === 404) {
          setNotFound(true)
          setData(null)
          return
        }
        if (!call.ok || !call.result) throw new Error(t('logistics.transport.errors.load'))
        setData(call.result)
      } catch (loadError) {
        if (loadError instanceof Error && loadError.name === 'AbortError') return
        setError(loadError instanceof Error ? loadError.message : t('logistics.transport.errors.load'))
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [reloadToken, scopeVersion, t, transportId])

  if (loading) return <LoadingMessage label={t('logistics.transport.loading')} />

  if (notFound) {
    return (
      <RecordNotFoundState
        label={t('logistics.transport.notFound')}
        backHref="/backend/logistics/transports"
        backLabel={t('logistics.actions.backToTransports')}
      />
    )
  }

  if (error || !data) {
    return (
      <ErrorMessage
        label={error ?? t('logistics.transport.errors.load')}
        action={(
          <Button size="sm" variant="outline" onClick={() => setReloadToken((value) => value + 1)}>
            {t('logistics.actions.retry')}
          </Button>
        )}
      />
    )
  }

  const order1 = data.order1
  const order2 = data.order2
  const capacityPallets = order2 ? asNumber(order2.fields.vehicle_capacity_pallets) : null
  const capacityKg = order2 ? asNumber(order2.fields.vehicle_capacity_kg) : null

  return (
    <div className="space-y-6">
      <FormHeader
        mode="detail"
        backHref="/backend/logistics/transports"
        backLabel={t('logistics.actions.backToTransports')}
        entityTypeLabel={t('logistics.transport.entityLabel')}
        title={order1.orderNumber}
        subtitle={route(order1)}
        statusBadge={<StatusBadge status={order1.status} label={t(`logistics.status.${order1.status}`)} />}
      />

      <section className="space-y-4 rounded-lg border bg-card p-4 md:p-6">
        <SectionHeader title={t('logistics.transport.order1.title')} />
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DetailValue label={t('logistics.fields.customer')} value={order1.customerName} />
          <DetailValue label={t('logistics.fields.route')} value={route(order1)} />
          <DetailValue label={t('logistics.fields.pickup')} value={dateTime(order1.fields.pickup_window_start)} />
          <DetailValue label={t('logistics.fields.delivery')} value={dateTime(order1.fields.delivery_window_start)} />
          <DetailValue label={t('logistics.fields.pallets')} value={formatNumber(order1.fields.cargo_pallets, 'EP')} />
          <DetailValue label={t('logistics.fields.weight')} value={formatNumber(order1.fields.cargo_weight_kg, 'kg')} />
          <DetailValue label={t('logistics.fields.clientPrice')} value={formatMoney(order1.fields.client_price)} />
          <DetailValue label={t('logistics.fields.maxCarrierCost')} value={formatMoney(order1.fields.max_carrier_cost)} />
        </dl>
      </section>

      <section className="space-y-4 rounded-lg border bg-card p-4 md:p-6">
        <SectionHeader title={t('logistics.transport.order2.title')} />
        {order2 ? (
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <DetailValue label={t('logistics.fields.carrier')} value={order2.customerName} />
            <DetailValue label={t('logistics.fields.rating')} value={formatNumber(order2.fields.carrier_rating, '/ 5')} />
            <DetailValue label={t('logistics.fields.carrierCost')} value={formatMoney(order2.fields.carrier_cost)} />
            <DetailValue label={t('logistics.fields.status')} value={<StatusBadge status={order2.status} label={t(`logistics.status.${order2.status}`)} />} />
            <DetailValue label={t('logistics.fields.vehicleType')} value={asString(order2.fields.vehicle_type) ?? '—'} />
            <DetailValue label={t('logistics.fields.vehiclePlate')} value={asString(order2.fields.vehicle_plate) ?? '—'} />
            <DetailValue label={t('logistics.fields.capacityPallets')} value={formatNumber(capacityPallets, 'EP')} />
            <DetailValue label={t('logistics.fields.capacityWeight')} value={formatNumber(capacityKg, 'kg')} />
          </dl>
        ) : (
          <EmptyState
            size="sm"
            title={t('logistics.transport.order2.empty.title')}
            description={t('logistics.transport.order2.empty.description')}
            icon={<Truck className="size-5" />}
          />
        )}
      </section>

      <section className="space-y-4 rounded-lg border bg-card p-4 md:p-6">
        <SectionHeader title={t('logistics.transport.freeSpace.title')} />
        {data.freeSpace ? (
          <dl className="grid gap-4 sm:grid-cols-2">
            <DetailValue
              label={t('logistics.fields.remainingPallets')}
              value={formatNumber(data.freeSpace.pallets, 'EP')}
              className={capacityTone(data.freeSpace.pallets, capacityPallets)}
            />
            <DetailValue
              label={t('logistics.fields.remainingWeight')}
              value={formatNumber(data.freeSpace.kg, 'kg')}
              className={capacityTone(data.freeSpace.kg, capacityKg)}
            />
          </dl>
        ) : (
          <EmptyState size="sm" title={t('logistics.transport.freeSpace.unknown')} icon={<Truck className="size-5" />} />
        )}
      </section>

      <section className="space-y-4 rounded-lg border bg-card p-4 md:p-6">
        <SectionHeader title={t('logistics.transport.additionalLoads.title')} count={data.additionalLoads.length} />
        {data.additionalLoads.length > 0 ? (
          <div className="divide-y rounded-md border">
            {data.additionalLoads.map((order) => (
              <div key={order.id} className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
                <DetailValue label={t('logistics.fields.order')} value={order.orderNumber} />
                <DetailValue label={t('logistics.fields.route')} value={route(order)} />
                <DetailValue label={t('logistics.fields.pallets')} value={formatNumber(order.fields.cargo_pallets, 'EP')} />
                <DetailValue label={t('logistics.fields.weight')} value={formatNumber(order.fields.cargo_weight_kg, 'kg')} />
                <DetailValue label={t('logistics.fields.status')} value={<StatusBadge status={order.status} label={t(`logistics.status.${order.status}`)} />} />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState size="sm" title={t('logistics.transport.additionalLoads.empty')} icon={<PackageOpen className="size-5" />} />
        )}
      </section>

      {data.carrierHistory.length > 0 ? (
        <section className="rounded-lg border bg-card p-4 md:p-6">
          <CollapsibleSection
            title={t('logistics.transport.carrierHistory.title')}
            count={data.carrierHistory.length}
            defaultCollapsed
          >
            <div className="divide-y rounded-md border">
              {data.carrierHistory.map((order) => (
                <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                  <div>
                    <p className="font-medium">{order.customerName}</p>
                    <p className="text-muted-foreground">{order.orderNumber}</p>
                  </div>
                  <StatusBadge status={order.status} label={t(`logistics.status.${order.status}`)} />
                </div>
              ))}
            </div>
          </CollapsibleSection>
        </section>
      ) : null}

      <div className="flex justify-start">
        <Button asChild variant="outline">
          <Link href="/backend/logistics/transports">{t('logistics.actions.backToTransports')}</Link>
        </Button>
      </div>
    </div>
  )
}
