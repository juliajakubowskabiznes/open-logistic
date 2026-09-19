import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { TransportDetailView } from '../../../../components/TransportDetail'

export default function LogisticsTransportDetailPage({ params }: { params?: { id?: string } }) {
  return (
    <Page>
      <PageBody>
        <TransportDetailView transportId={params?.id ?? null} />
      </PageBody>
    </Page>
  )
}
