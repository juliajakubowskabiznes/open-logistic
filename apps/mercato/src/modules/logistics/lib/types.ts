export type LatLng = { lat: number; lng: number; name?: string }

export type LogisticsStop = {
  role: 'pickup' | 'delivery'
  name: string
  country: string
  locality: string
  postalCode: string
  street?: string
  number?: string
  lat: number
  lng: number
}

export type LogisticsRoute = {
  provider: 'graphhopper'
  source: 'live' | 'fixture'
  profile: string
  distanceM: number
  timeMs: number
  points: { type: 'LineString'; coordinates: [number, number][] }
  instructions: Array<{
    text: string
    distanceM: number
    timeMs: number
    sign?: number
    streetName?: string
  }>
  from: LatLng
  to: LatLng
}

export type LogisticsOrder = {
  id: string
  createdAt: string
  updatedAt: string
  referenceNumber: string
  status: 'new' | 'routed' | 'imported'
  source: 'manual' | 'inbox' | 'demo'
  inboxRequestId?: string
  notes?: string
  stops: LogisticsStop[]
  route: LogisticsRoute | null
  rawPayload?: unknown
}

export const WAW_POZ = {
  pickup: {
    role: 'pickup' as const,
    name: 'Warszawa',
    country: 'PL',
    locality: 'Warszawa',
    postalCode: '00-001',
    street: 'Marszałkowska',
    number: '1',
    lat: 52.2297,
    lng: 21.0122,
  },
  delivery: {
    role: 'delivery' as const,
    name: 'Poznań',
    country: 'PL',
    locality: 'Poznań',
    postalCode: '60-001',
    street: 'Święty Marcin',
    number: '1',
    lat: 52.4064,
    lng: 16.9252,
  },
}
