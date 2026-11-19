# Recipe: design an HTTP API by hand

Profile: API. One canvas is one OpenAPI 3.1 document. You never draw lines:
the canvas draws them from the forms (endpoint → schema, endpoint → security).

```text
Create canvas (API) → API card → Security → Resource (scaffolds endpoints + schemas)
  → edit resource, schemas, endpoints → Add endpoint → Standard errors
  → Tidy API layout → Export OpenAPI YAML → compare
```

## 1. API card

1. `Add` → `menuitem "API"`. Double-click `.react-flow__node.selected` at once.
2. `dialog "Edit API"`: `Title`, `Version`, `Description`, `Server 1`
   (`button "Add server"` for more), `Owner`, `Status`. Click `Done`.
3. The card is now `group "API <Title>"`.

## 2. Security

1. `Add` → `menuitem "Security"`. Double-click `.react-flow__node.selected`.
2. `dialog "Edit Security"`: `Name` (the OpenAPI scheme name, e.g. `BearerAuth`),
   `Type` (`http`, `apiKey`, `oauth2`, `openIdConnect`, `mutualTLS`), then the
   fields for that type (http: `Scheme`, `Bearer format`). `Done`.
3. To apply it to the whole API: open the API card, check
   `Default security <Name>`. Endpoints inherit it.

## 3. Resource

A resource is a group of endpoints and the OpenAPI tag.

1. `Add` → `menuitem "Resource"` opens `dialog "Add resource"`.
2. Fill `Singular` (e.g. `task`). `Plural`, `Path prefix`, and `Id parameter`
   fill themselves (`tasks`, `/tasks`, `task_id`). Click `button "Add resource"`.
3. You get five endpoints and four schemas:

| Endpoint card | Schemas used |
| --- | --- |
| `Endpoint GET /tasks` (list, `limit` and `cursor` parameters) | `TaskList` |
| `Endpoint POST /tasks` | `TaskCreate` in, `Task` out |
| `Endpoint GET /tasks/{task_id}` | `Task` |
| `Endpoint PATCH /tasks/{task_id}` | `TaskUpdate` in, `Task` out |
| `Endpoint DELETE /tasks/{task_id}` | none |

4. Rename the tag: double-click the lane title
   `group "Resource tasks"` → `header strong`. `dialog "Edit Resource"`: `Name`
   (e.g. `Tasks`), `Description`. `Done`.
5. Remove what you do not need: click the card, then `button "Delete"`.

## 4. Schemas

Open `group "Schema <Name>"` → `dialog "Edit schema contract"`, `Fields` tab.

| Control | Label |
| --- | --- |
| Row name | `Field name <field>` |
| Row type | combobox `Field type <field>` (`string`, `number`, `integer`, `boolean`, `object`, `array:<type>`, `enum`, `ref`) |
| Required / nullable | `Required <field>`, `Nullable <field>` (checkboxes) |
| Description | `Description <field>` |
| Row actions | `Details <field>`, `Move <field> up`, `Move <field> down`, `Delete <field>` |
| New row | `button "Add field"` adds a row named `field` |
| Details (one open at a time) | combobox `Format`, `Min length`, `Max length`, `Pattern`, `Default`, `Enum values` (one per line) |

Rules:

- **Labels follow the field name.** After you rename `field` to `status`,
  press `Tab`; the row is then `Field name status`, `Field type status`, and
  so on.
- A field is required by default. Uncheck `Required <field>` for optional.
- Enum: set `Field type <field>` to `enum`, open `Details <field>`, fill
  `Enum values`.
- `ref` points to another schema card; use it for nesting (`items: Task`).

## 5. Endpoints

Open `group "Endpoint <METHOD> <path>"` → `dialog "Edit Endpoint"`.

| Area | Labels |
| --- | --- |
| Operation | combobox `Method`, `Path`, combobox `Status`, `Summary`, `Description` |
| Parameters | `button "Add"`, `Parameter N name`, combobox `Parameter N location` (`path`, `query`, `header`, `cookie`), `Parameter N required`, combobox `Parameter N type`, combobox `Parameter N format`, `Parameter N description`, `Remove parameter N` |
| Request body | combobox `Body` (`none`, `model`, `inline`) |
| Responses | `button "Add response"`, `Response <code> status`, `Response <code> description`, combobox `Response <code> model`, `Remove response <code>` |
| Security | combobox `Requirement` (`inherit`, `public`, `schemes`); with `schemes`, one checkbox per scheme |

New endpoint in an existing resource: `Add` → `menuitem "Endpoint"` →
`dialog "Add endpoint"`: combobox `Resource`, combobox `Method`, `Path`,
`Summary`, `button "Add endpoint"`. The menu item is disabled until a resource exists.

## 6. Standard errors

Select endpoints (click one, Shift-click more), then `More canvas actions` →
`Standard errors`. It adds `400`/`404`/`422`-style responses that use a shared
`Problem` schema. The notice says how many were added.

## 7. Finish

1. `More canvas actions` → `Tidy API layout`.
2. `Review` lists contract issues. Close it with `button "Close review"`.
3. `More canvas actions` → `Export OpenAPI YAML` (download) or `Copy OpenAPI YAML`.
4. Compare by meaning: `info`, `servers`, `security`, `tags`, every path and
   method, `components.securitySchemes`, and each schema's `properties`,
   `required`, `enum`, `format`, and length limits.

## Failure signs

| Sign | Meaning |
| --- | --- |
| `Endpoint` menu item disabled | No resource yet. Add one first |
| `Field name <x>` not found | The row was renamed. Use the new name (press `Tab` after renaming) |
| `Default security <Name>` not found | The Security card has no Name yet |
| Response model list is empty | The schema card has no name |
