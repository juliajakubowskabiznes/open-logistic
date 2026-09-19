# Logistics — dane wejściowe pod przyszłą ocenę agenta

**Nie ma jeszcze agenta.** Ten dokument opisuje wyłącznie **jakie fakty** trzeba mu podać, żeby mógł ocenić opłacalność (accept / skip / publish).
Źródło runtime: `POST /api/logistics/exchange/search-backloads` (+ kontekst zlecenia z `GET /api/logistics/orders`).

---

## 1. Kontekst zlecenia bazowego (zawsze)

Z `GET /api/logistics/orders` → wybrany order (lub echo w odpowiedzi `search-backloads`):

| Pole | Po co |
|------|--------|
| `id`, `referenceNumber` | identyfikacja |
| `stops[]` (pickup/delivery: name, lat, lng, locality) | skąd–dokąd bazowe |
| `route.distanceM`, `route.timeMs` | długość / czas trasy GH |
| `route.source` (`live` \| `fixture`) | wiarygodność geometrii |
| `route.from` / `route.to` | snapped endpoints |
| `capacity.maxWeightT` / `maxLdm` | limit naczepy |
| `capacity.usedWeightT` / `usedLdm` | ile już zajmuje ładunek bazowy |
| `capacity.freeWeightT` / `freeLdm` | **wolna pojemność** pod doładunek |
| `commercials.baseRevenueEur` / `baseCostEur` | P&L zlecenia bazowego |
| `commercials.baseMarginEur` | **marża bazowa** (= revenue − cost) |
| `commercials.exchangeFeePct` / `exchangeFeeFlatEur` | **prowizja giełdy** (np. 5% + 15 EUR) |
| `notes`, `source` (`demo` \| `inbox` \| …) | skąd wzięte zlecenie |

Bez `route` agent **nie** ocenia doładunków — najpierw policzyć GH.

Default demo WAW→POZ: free **10 t / 5.6 LDM**, base margin **360 EUR**, fee **5% + 15 EUR**.

---

## 2. Kandydat doładunku (freight) — pola do oceny

Z `search-backloads` → `candidates[]` gdzie `kind === "freight"`:

### Geografia / operacja
| Pole | Po co |
|------|--------|
| `from`, `to` (name, lat, lng) | skąd–dokąd doładunku |
| `alongRouteKm` | gdzie na trasie bazowej leży okazja |
| `detourKmEstimate` | ile km „w bok” względem korytarza |
| `weightT` | wymagana masa vs `freeWeightT` |
| `provider` | Trans vs TIMOCOM (reguły/SLA) |
| `summary` | krótki opis pod prompt |

### Ekonomia (klucz do „czy się opłaca”)
| Pole | Po co |
|------|--------|
| `economics.revenueEur` | przychód z doładunku (brutto giełda) |
| `economics.exchangeFeeEur` | prowizja: `revenue × feePct + feeFlat` |
| `economics.detourCostEur` | koszt detouru (`detourKm × costPerKmEur`) |
| `economics.netEur` | `revenue − fee − detourCost` — **główna metryka przyrostowa** |
| `economics.eurPerExtraKm` | przychód / km detouru (null gdy detour ≈ 0) |
| `economics.costPerKmEur` | założony koszt km (input / default 1.15) |
| `economics.fitsFreeCapacity` | `weightT ≤ freeWeightT` |
| `economics.freeWeightT` / `freeLdm` | echo wolnej pojemności zlecenia |
| `economics.requiredWeightT` | masa kandydata |
| `economics.baseMarginEur` | marża zlecenia bazowego |
| `economics.combinedMarginEur` | `baseMargin + netEur` (widok całego trip’u) |
| `economics.worthConsideringHint` | **soft** próg — **nie** decyzja |
| `economics.rationale` | 1 zdanie wyjaśnienia progu |

### Top-level odpowiedzi (oprócz `candidates`)
| Pole | Po co |
|------|--------|
| `capacity` | pełny snapshot pojemności |
| `commercials` | pełny snapshot P&L + fee schedule |
| `assumptions.costPerKmEur` | jak policzono detour cost |
| `assumptions.minNetEurHint` | próg soft-hinta (default 80) |
| `assumptions.radiusKm` | szerokość korytarza search |
| `assumptions.exchangeFeePct` / `exchangeFeeFlatEur` | fee użyte w kalkulacji |
| `routeDistanceKm` | długość trasy bazowej |
| `agentHint` | instrukcja: agent decyduje sam |

Formuła:

```
exchangeFeeEur = revenueEur × exchangeFeePct + exchangeFeeFlatEur   (0 gdy revenue=0)
detourCostEur  = detourKm × costPerKmEur
netEur         = revenueEur − exchangeFeeEur − detourCostEur
combinedMargin = baseMarginEur + netEur
```

---

## 3. Czego **nie** ma jeszcze (agent i tak musi to dostać później)

| Brakujące dziś | Po co agentowi |
|----------------|----------------|
| Okna czasowe załadunku/rozładunku | czy zdąży względem ETA bazowego |
| Pojemność **per segment** (vs trip-level free) | częściowe rozładunki / multi-stop |
| Koszt postoju / kary za spóźnienie | true cost poza km |
| Ryzyko kontrahenta (np. Eurodebt) | accept vs skip |

Capacity, marża bazowa i prowizja giełdy **są już** w flow (order + `search-backloads`).

---

## 4. Inne decyzje (te same API, inne pola)

### Accept oferty giełdowej — `GET …/exchange/offers`
`id`, `provider`, `price`, `from`/`to`, `summary`, `status`
→ agent: cena vs nasz koszt trasy (osobno: GH distance); fee schedule z `order.commercials`.

### Poszukiwanie przewoźnika — response `listing`
`from`/`to`, `weightT`, `priceHint`, `reference`
→ agent: czy wystawić / za ile (brak market depth w mocku).

### Wolne auta — `search-vehicles`
`locality`, `lat`/`lng`, `radiusKm`, `capacityT`, `vehicleType`, `availableFrom`
→ agent: match do ładunku, nie ekonomia doładunku.

### `kind === "capacity"` w backloads
To **nie** jest wyceniony freight — tylko sygnał wolnego auta przy korytarzu. Agent **nie** liczy `netEur` jako przychodu (`exchangeFeeEur=0`).

---

## 5. Minimalny checklist oceny doładunku (dla przyszłego promptu)

1. Weź tylko `kind=freight`.
2. Odrzuć jeśli `fitsFreeCapacity === false`.
3. Policz / przeczytaj `netEur` (już po prowizji) i `eurPerExtraKm`.
4. Odrzuć jeśli `netEur < 0` (lub poniżej polityki firmy).
5. Preferuj wyższy `netEur` / `combinedMarginEur` przy podobnym `detourKmEstimate`.
6. `worthConsideringHint=true` = kandydat do analizy, **nie** auto-accept.
7. Brak okien czasowych → oznacz decyzję jako `uncertain`, nie `accept`.

---

## 6. Przykład (skrót)

```json
{
  "routeDistanceKm": 307.6,
  "capacity": {
    "maxWeightT": 24,
    "usedWeightT": 14,
    "freeWeightT": 10,
    "freeLdm": 5.6
  },
  "commercials": {
    "baseRevenueEur": 980,
    "baseCostEur": 620,
    "baseMarginEur": 360,
    "exchangeFeePct": 0.05,
    "exchangeFeeFlatEur": 15
  },
  "assumptions": {
    "costPerKmEur": 1.15,
    "minNetEurHint": 80,
    "radiusKm": 45,
    "exchangeFeePct": 0.05,
    "exchangeFeeFlatEur": 15
  },
  "candidates": [
    {
      "kind": "freight",
      "detourKmEstimate": 23,
      "weightT": 8,
      "price": { "amount": 541, "currency": "EUR" },
      "economics": {
        "revenueEur": 541,
        "exchangeFeeEur": 42.1,
        "detourCostEur": 26.5,
        "netEur": 472.4,
        "fitsFreeCapacity": true,
        "freeWeightT": 10,
        "requiredWeightT": 8,
        "baseMarginEur": 360,
        "combinedMarginEur": 832.4,
        "eurPerExtraKm": 23.5,
        "worthConsideringHint": true,
        "rationale": "Net ~472.4 EUR after fee+detour; combined margin ~832.4 EUR — verify time windows"
      }
    }
  ]
}
```

Endpoint: `POST /api/logistics/exchange/search-backloads`
Body: `{ "orderId": "<uuid>", "costPerKmEur": 1.15, "minNetEurHint": 80, "radiusKm": 40 }`
