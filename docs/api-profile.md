# API Profile Contract

Status: Proposed v1 (spec agreed 2026-11-16, not built)
Profile ID: `api`
Version: `1`
Format: OpenAPI 3.1 (JSON and YAML), JSON Schema 2020-12

## Decision

Canvas gets a third profile, **API**, next to Raw and Systems. An API canvas
designs one HTTP API at endpoint level. A Systems canvas stays at architecture
level and links to the API canvas from the System card with kind `api`.

OpenAPI 3.1 is the exchange format. Import gives an accurate canvas from an
existing service. Export gives a spec that code generators, docs tools, and
gateways accept. Canvas is a design surface for OpenAPI, not a competing format.

```text
Systems canvas   [Pipeline] ──uses (POST /v1/jobs)──> [System: Engine API] ⇢ linked API canvas

API canvas       [API: Skyward Engine API 0.1.0]
                   ├─contains─> [Resource: Jobs] ─contains─> [GET /v1/jobs]       ─returns 200─> [Schema: JobList]
                   │                             ─contains─> [POST /v1/jobs]      ─accepts─────> [Schema: JobCreate]
                   │                                                              ─returns 422─> [Schema: ApiErrorResponse]
                   └─contains─> [Security: BearerAuth] <─authenticates_via─ Jobs
```

## Cards

| Card | Entity id | OpenAPI source | Responsibility |
| --- | --- | --- | --- |
| API | `api_definition` | `openapi`, `info`, `servers`, top-level `security`, `tags` order | One per canvas. Title, version, servers, global security |
| Resource | `resource` | One `tags` entry | Groups endpoints by business resource |
| Endpoint | `endpoint` | One Operation object under `paths.<path>.<method>` | One method and path |
| Schema | `schema` (reused) | One `components.schemas` entry | A named model. Same card, workbench, and Ajv validation as Systems |
| Security | `security_scheme` | One `components.securitySchemes` entry | How callers authenticate |

Annotations: Note, Decision, Risk (shared with Systems).

The ids `api` and `service` already exist as legacy entity types, so the new
cards use new ids. Labels shown to users are API, Resource, Endpoint, Schema,
and Security.

### Fields

| Card | Fields |
| --- | --- |
| API | Title, Version, Description, Servers (one URL per line), Owner, Status, Extra (JSON, read-only in v1) |
| Resource | Name, Description, Owner |
| Endpoint | Method (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, TRACE), Path, Status (planned, active, deprecated), Operation (JSON) |
| Schema | Unchanged. Contract kind defaults to `api` on API canvases |
| Security | Name, Type (http, apiKey, oauth2, openIdConnect, mutualTLS), Description, Definition (JSON) |

## One source of truth per fact

This is the main design rule. Every OpenAPI fact is stored once.

| Fact | Stored in | Notes |
| --- | --- | --- |
| Method and path | Endpoint fields | The path is the card title |
| Summary, description, operationId, parameters, request body, responses, security, deprecated, callbacks, `x-*` | Endpoint `operation` field, verbatim Operation object | Edited through the Endpoint inspector; a Raw tab shows the JSON |
| Resource membership | `operation.tags[0]` | Further tags are kept. An untagged endpoint joins an inferred Resource (see Import) |
| A named model | Schema card `source` | `$ref: "#/components/schemas/<Name>"` resolves by the Schema card name |
| Security scheme | Security card `definition` | |
| Status `deprecated` | Endpoint Status field | Export writes `deprecated: true`; import reads it |
| Anything else in the document (`webhooks`, `jsonSchemaDialect`, `externalDocs`, other `components`, `x-*` at the top level) | API card `extra`, verbatim | Shown in the inspector; re-emitted on export |

### Managed relations

The relations from an Endpoint are a view of its operation, so they cannot
disagree with it.

| Relation | Source -> target | Derived from |
| --- | --- | --- |
| `contains` | API -> Resource, Security; Resource -> Endpoint | `tags`; scheme list |
| `accepts` | Endpoint -> Schema | `requestBody.content.*.schema.$ref` |
| `returns` | Endpoint -> Schema | `responses.<status>.content.*.schema.$ref`; the edge label shows the status, for example `201` or `4XX` |
| `authenticates_via` | API, Resource, or Endpoint -> Security | Top-level, then operation `security` |
| `uses` | Schema -> Schema | `$ref` inside a schema (as in Systems) |
| `relates_to` | Annotations <-> anything | Drawn by hand |

- Managed edges carry `app.managed: true` plus `app.status` and `app.mediaType`
  where they apply. The editor regenerates them when an operation, a schema, or
  a tag changes, as one undoable edit with that change.
- Drawing a new edge from an Endpoint to a Schema opens a small chooser:
  **Request body** or **Response** with a status code. The choice edits the
  operation, and the edge follows from it. Deleting a managed edge removes the
  reference from the operation, after a confirm when the response has other
  content.
- Drawing from a Schema to a Schema adds a `$ref` property only after the user
  names the property; otherwise it stays an ordinary `uses` relation for ERD
  reading, as today.
- Inline schemas (no `$ref`) stay inside the operation and draw no edge. The
  inspector offers **Extract to model**, which creates a Schema card and
  replaces the inline schema with a `$ref`.

## Profile metadata

```json
{ "app": { "profile": "api", "profileVersion": 1 } }
```

`API_PROFILE` is added to `DEFAULT_PROFILES`. The list page profile picker
offers Raw, Systems, and API. Untyped text and unlisted types are warnings, as
in Systems.

## Design tools

Each tool is deterministic and works offline. Pure logic lives in
`packages/canvas-contract/src/openapi/` so the web app, the API, and a later MCP
server share it. UI lives in `web/src/canvas/apiDesign/`.

### Phase 1: model and import

1. **API profile and cards**, with the managed relations above.
2. **Import OpenAPI 3.1** from a pasted document or a file, JSON or YAML (adds
   the `yaml` package). Import creates a new canvas. It lays out API, then
   Resources in a column, their Endpoints in rows, Schemas to the right, and
   Security below. OpenAPI 3.0 is converted on import (`nullable`, `example`,
   `exclusiveMinimum`) with a summary of what changed. Swagger 2.0 is refused
   with a message.
   Untagged operations are grouped into an **inferred Resource** named after the
   first path segment that is not a version (`/v1/jobs/{job_id}` -> `jobs`;
   `/healthz` -> `healthz`). Inferred Resources carry `app.inferred: true` and
   add no tag on export, so the round trip stays exact. Renaming an inferred
   Resource or adding a description makes it a real tag.
3. **Endpoint inspector** in the side panel, replacing the raw field editor for
   Endpoint cards: method and path, summary and description, a parameter table
   (name, in, required, type, description), the request body model, a response
   list (status, description, model), and security. A Raw tab edits the
   operation JSON. Path parameters are detected from `{name}` in the path and
   added to the table.
4. **Reference view**: a read-only derived view that reads like API docs.
   Endpoints are grouped by Resource with method badges, parameters, request
   and response models, and status codes. It reuses the derived views
   framework.
5. **Create or open API canvas** command on a Systems card with kind `api`. It
   creates an API canvas titled after the card and adds a canvas link.

### Phase 2: design faster

6. **Export OpenAPI 3.1** as JSON or YAML, downloaded or copied. Export sorts
   paths by Resource order, then path, then method, so diffs stay small.
7. **Add resource** command: asks for a singular and a plural name, then creates
   a Resource, list, get, create, update, and delete endpoints, and the
   `<Name>`, `<Name>Create`, `<Name>Update`, and `<Name>List` schemas with
   cursor pagination. The user removes what is not needed.
8. **Standard errors**: one command adds an RFC 9457 Problem Details schema and
   attaches it to `4XX` and `5XX` responses on the selected endpoints.
9. **Examples**: generate an example from a schema (deterministic: first enum
   value, `format`-aware placeholders, minimum lengths), and validate every
   example in the document against its schema with Ajv.
10. **Request snippet**: copy a `curl` command for the selected endpoint using
    the first server, its path parameters, and an example body.

### Phase 3: review and change safety

11. **API checks** in the existing Review panel, with the same Issues, Fixes,
    and ignore-with-reason behaviour.

    | Code | Severity | Rule |
    | --- | --- | --- |
    | `operation_invalid` | Error | The operation does not validate against the OpenAPI 3.1 Operation schema |
    | `ref_unresolved` | Error | A `$ref` names no Schema card or `extra` component |
    | `operation_duplicate` | Error | Two endpoints share a method and path, or an operationId |
    | `path_parameter_mismatch` | Error | A `{name}` in the path without a path parameter, or the reverse |
    | `response_success_missing` | Warning | No `2XX` or `3XX` response |
    | `mutation_errors_missing` | Warning | POST, PUT, PATCH, or DELETE without a `4XX` response |
    | `security_missing` | Warning | No security at any level. Explicit `security: []` marks a public endpoint and passes |
    | `list_pagination_missing` | Warning | A GET whose success schema is an array or has an array `items` property, without a limit or cursor parameter |
    | `get_with_body` | Warning | GET or DELETE with a request body |
    | `naming_inconsistent` | Warning | A path segment, parameter, or property name differs from the canvas's majority case style |
    | `schema_unused` | Warning | A Schema card no endpoint or schema references |
    | `endpoint_without_resource` | Warning | No tag (inferred Resources count as a tag only for layout, so this still reports) |

    Fixes are offered where the repair is unambiguous: add the missing path
    parameter, attach standard errors, add `limit` and `cursor`, add a tag.

12. **Breaking-change check**: compare the canvas with an OpenAPI file or with
    another API canvas (version history can be a source once it exists). The
    result lists Breaking and Compatible changes per endpoint:

    | Breaking | Compatible |
    | --- | --- |
    | Endpoint removed; method or path changed | Endpoint added |
    | Response status removed; response property removed or its type changed | Response property added (flagged when the schema forbids additional properties) |
    | Request property or parameter newly required; required parameter added | Optional request property or parameter added |
    | Request enum value removed; response enum value added (warning) | Request enum value added |
    | Security added to a public endpoint | Description and example changes |

    **Copy changelog** gives a Markdown summary of the comparison.

### Phase 4: tie into Systems

13. A Systems `uses` relation to a System with kind `api` gets an optional
    **Endpoint** picker that lists the endpoints of its linked API canvas and
    stores `app.endpoint: "POST /v1/jobs"`. The edge label shows it, and the
    Sequence view uses it as the message text.
14. The Review panel warns when a stored endpoint no longer exists in the linked
    API canvas.

### Later, not in this spec

| Tool | Why later |
| --- | --- |
| Import from a URL | Fetching through the API is a server-side request risk; needs an allow list |
| Mock server from examples | New runtime surface in the API; design it with the deployment platform |
| Client and server code generation | Export plus existing generators (openapi-generator, openapi-typescript) already cover it |
| AsyncAPI events, GraphQL, gRPC | Different contracts; a separate profile each, only on demand |
| Live "try it" requests | Needs credentials handling and CORS; out of scope for a design tool |

## Proof

| Risk | Proof seam |
| --- | --- |
| Import or export loses data | Round-trip test in the contract package: import, export, and deep-equal after key sorting, for both fixtures below and one synthetic document that uses every supported feature plus `webhooks` and `x-*` extensions |
| Managed relations drift from operations | Table-driven test: operation edit -> expected managed edges |
| Checks are wrong | One table-driven test per rule family with a passing and a failing operation |
| Breaking-change check misses a break | Table-driven test with one pair of documents per row in the table above |
| UI flow breaks | One E2E test: import the Engine fixture, open an endpoint, add a response, export, and confirm the exported document contains it |

Fixtures (copy into `packages/canvas-contract/src/openapi/fixtures/` with their
source noted):

- `skyward-engine/docs/openapi/skyward-engine-v1.json`: OpenAPI 3.1.0,
  6 operations, 20 schemas, `BearerAuth`.
- `skyward-api-aws/openapi-alaska.yaml`: OpenAPI 3.1.0 in YAML.

Acceptance: importing the Engine fixture (it has no tags) gives 1 API, inferred
Resources `healthz`, `jobs`, and `products`, 6 Endpoints, 20 Schemas, and 1 Security card with zero errors in the Review
panel (warnings are expected and listed in the test), and exporting it gives a document equal to the original after
normalization.

## Contract changes

- `packages/canvas-contract`: `API_PROFILE`; entity types `api_definition`,
  `resource`, `endpoint`, `security_scheme`; relation types `accepts`,
  `returns` (`contains` and `authenticates_via` already exist); edge meta fields
  `managed`, `status`, `mediaType`, `endpoint`; node meta field `inferred`; `openapi/` module (import,
  export, managed relations, checks, diff).
- No change to stored Systems or Raw canvases. No migration.
- The API stores and serves API canvases like any other document.

## Decisions

| Decision | Choice | Strongest challenge |
| --- | --- | --- |
| Where endpoints live | A separate API canvas linked from Systems | One canvas is simpler to open; but it drowns the architecture view |
| Source of truth | Verbatim Operation object on the Endpoint; relations are derived | Editable edges feel more "canvas"; but two writable copies drift. Drawing an edge still works because it edits the operation |
| Models | Reuse the Schema card | A separate Model card could hide contract-review fields; reuse keeps one workbench and one validator |
| Resource | A card mapped to an OpenAPI tag | A group would be lighter; but groups are not graph endpoints, and tags carry order and descriptions |
| YAML | Add the `yaml` package | One more dependency; most hand-written specs are YAML |
