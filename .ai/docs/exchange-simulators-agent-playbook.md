# Exchange simulator playbook

The tools generate **synthetic diagnostic traffic**, not production integrations or business records.

| Source | Local API snapshot | Simulator |
| --- | --- | --- |
| Trans.eu | `trans_api_doc/` | `tools/trans-api-simulator/` |
| TIMOCOM | `timocom_api_doc/` | `tools/timocom-api-simulator/` |
| Eurodebt | `eurodebt_api_doc/` | `tools/eurodebt-api-simulator/` |

## Application capture

Follow [the development inbox setup](../../apps/mercato/src/modules/trans_inbox/README.md). The server requires development mode, an explicit enable flag, a random shared token and configured tenant/organization UUIDs. Supply the same token to the simulator terminal as `TRANS_INBOX_TOKEN`, and set `TARGET_BASE_URL` to the running application.

`POST /api/integrations/{trans|timocom|eurodebt}/webhooks/{channel}` accepts JSON with the `X-Trans-Inbox-Token` header. The server fixes scope from configuration; simulator headers cannot choose an organization.

Open `/backend/trans_inbox` as an authorized administrator in that organization. This view is separate from logistics offers/transports. It displays sanitized data in process-local memory, up to 100 entries per scope and one-hour retention. There is no clear endpoint. Production capture is disabled. SSE carries a request ID only and the UI reloads the authenticated feed.

```powershell
$env:TARGET_BASE_URL = 'http://127.0.0.1:3000'
$env:TRANS_INBOX_TOKEN = '<same random token configured on the server>'
yarn sim:all:3s
```

## Offline checks

No application or credentials are needed for dry runs:

```sh
yarn sim:all:3s --smoke --dry-run
yarn trans:sim catalog
yarn timocom:sim catalog
yarn eurodebt:sim catalog
```

Provider mock servers are local synthetic response servers for developing adapters offline. They do not implement full provider authorization, schema validation or durable CRUD semantics. See each simulator README for mock-server and scenario commands.

Scenarios support batches, configurable parallelism/RPS/timeouts, periodic schedules and NDJSON reports. Reports are overwritten on every run. Do not send production credentials or personal data.

## Routing demo

[GraphHopper demo](../../tools/graphhopper-demo/README.md) is a standalone fixture/live routing demonstration. It uses a car profile, not truck constraints; it is not connected to production business routing. Bash, Docker and a large OSM import are required for live Poland routing. The fixture works without GraphHopper, but the viewer still downloads Leaflet and OSM tiles.

The logistics transport-jobs demo can create a Warszawa-to-Poznań order using the live router or the committed fallback fixture. It can also import the matching synthetic Trans order after the scenario posts it to the development inbox:

```powershell
$env:TARGET_BASE_URL = 'http://127.0.0.1:3000'
$env:TRANS_INBOX_TOKEN = '<same random token configured on the server>'
yarn trans:sim run tools/trans-api-simulator/scenarios/waw-poz-order.yaml
```

Open `/backend/logistics/transport-jobs`, or call `POST /api/logistics/orders` with `{ "action": "demo-waw-poz" }`. The demo order store is process-local and separate from the Sales-backed transport workflow.

## Prototype agent exchange surface

The logistics demo exposes a session-authenticated, `logistics.view`-guarded API for
evaluating carrier and backload workflows. These endpoints operate on the demo order
and transport-run stores; they do not replace the Sales-backed dispatcher APIs.

| Tool | HTTP endpoint | Purpose |
| --- | --- | --- |
| `logistics.orders.create_waw_poz` | `POST /api/logistics/orders` with `demo-waw-poz` | Create a routed demo order |
| `logistics.orders.import_inbox` | `POST /api/logistics/orders` with `from-inbox` | Import the synthetic Trans order |
| `logistics.orders.list` | `GET /api/logistics/orders` | List routed demo orders |
| `exchange.offers.list` | `GET /api/logistics/exchange/offers` | List exchange offers |
| `exchange.offer.accept` | `POST /api/logistics/exchange/accept` | Accept an offer |
| `exchange.publish_carrier_search` | `POST /api/logistics/exchange/publish-carrier-search` | Publish a carrier search |
| `exchange.search_free_vehicles` | `POST /api/logistics/exchange/search-vehicles` | Find vehicles near a locality |
| `exchange.search_backloads` | `POST /api/logistics/exchange/search-backloads` | Score backloads along a route |

`GET /api/logistics/exchange/catalog` returns the endpoint catalog. Backload search
samples the GraphHopper corridor and evaluates nearby synthetic freight and vehicle
offers. The score includes capacity fit and estimated economics; the accept/skip
decision remains with the agent or human reviewer. See
[`logistics-agent-evaluation-inputs.md`](logistics-agent-evaluation-inputs.md) for the
evaluation fields and production gaps.

Two optional agents are registered:

| Agent | ID | Role |
| --- | --- | --- |
| Carrier Finder | `logistics.carrier_finder` | Turn an agreed client offer into a carrier proposal |
| Load Optimizer | `logistics.load_optimizer` | Find additional loads along the active route |

The HITL view is `/backend/logistics/proposals-disruptions`; transport-run endpoints
advance background steps and expose approval cards. Configure an OpenRouter model with
`OPENROUTER_API_KEY`, `OM_AI_LOGISTICS_PROVIDER=openrouter`, and
`OM_AI_LOGISTICS_MODEL=openrouter/openrouter/free` when exercising the optional LLM
path.

Synthetic exchange inputs for this flow are available through:

```sh
yarn timocom:sim run tools/timocom-api-simulator/scenarios/agent-exchange.yaml
yarn trans:sim run tools/trans-api-simulator/scenarios/agent-accept.yaml
```
