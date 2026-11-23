# Recipe: design a system architecture by hand

Profile: Systems. Five card types, one note type, four line types. Lines carry
the meaning, so their direction matters.

```text
Create canvas (Systems) → cards (Actor, System, Repository, Artifact, Schema)
  → lines (Connect + Edge relation) → notes → Zone (group + District + District owner)
  → Replan layout → Apply preview → Review → Download .canvas
```

## 1. Cards

1. `Add` → `menuitem "<Type>"`. The new card is selected: double-click
   `.react-flow__node.selected` at once, before anything changes the selection.
2. The editor is `dialog "Edit <Type>"` (Schema: `dialog "Edit schema contract"`).
3. Fill the fields, then `Done`. The card is now `group "<Type> <Name>"`.

| Card | Use for | Fields (label) |
| --- | --- | --- |
| System | Anything that runs | `Name`, `Kind` (`service`, `api`, `database`, `queue`, `worker`, `job`, `cli`, `external`), `Owner`, `URL`, purpose (Markdown) |
| Actor | A person, role, or team | `Name`, `Kind` (`person`, `role`, `team`), purpose (Markdown) |
| Repository | Where code lives | `Name`, `URL`, `Owner`, purpose (Markdown) |
| Artifact | A built output (image, model, dataset) | `Name`, `Kind`, `Version`, `URI`, `Owner`, `Purpose`, Schema radio (`None`, `Define here`, `Use shared`) |
| Schema | A data contract | `Name`, `Version`, `Owner`, `Kind`, `Status`; fields in the `Fields` tab |
| Note | Context, decision, risk, question | `Name`, `Kind` (`note`, `decision`, `risk`, `question`), body (Markdown) |

Rules:

- **Selects:** use `getByRole('combobox', { name: 'Kind', exact: true })`.
  `getByLabel('Kind')` does not match because the label text includes the options.
- **Markdown text** (System, Actor, Repository and Note purpose or body): fill
  `getByRole('textbox', { name: 'Markdown preview', exact: true })`. Artifact uses
  a plain `Purpose` field.
- **Pick the kind, not a new type.** A database, queue, scheduled job, or
  third-party service is a System with that kind. Do not model it as a note.
- **One fact, one card.** Put decisions and risks in a Note with that kind,
  then link the note to the card it is about.

## 2. Zone

Once the Systems are placed, group them into districts. A district is a group
with an owner; plain groups stay visual.

1. Select the cards that belong in one district, then `button "Group"` in the
   selection toolbar.
2. Click the group's empty edge so the toolbar says `1 selected` (the group
   only, not its cards).
3. Click `button "District"`. It stays pressed and the group border marks the
   district.
4. Choose `combobox "District owner"` and pick an Actor card, or `No owner`.
   The group label shows the owner after the label, e.g. `Payments · Finance team`.
5. Repeat for each district.

Review reports district issues under `Zoning`: `Unzoned system`,
`District without owner`, `Shared database`, and `Route bypasses gate`.
`District without owner` is a Publish warning.

## 3. Lines

Draw lines with the toolbar, not by dragging:

1. Press `Escape`. Click the source card `group "<Type> <Name>"`.
2. Click `button "Connect"` (it changes to "Click a card"). Click the target card.
3. The new line is selected. Choose `getByLabel('Edge relation')`.
4. `Escape` cancels Connect mode.

| Relation | From → To | Means |
| --- | --- | --- |
| `uses` | Actor, System, Repository → System, Repository, Artifact, Schema; Schema → Schema | Calls, reads, writes, runs, or depends on |
| `produces` | System, Repository → Artifact | Builds or writes this output |
| `defines` | System, Repository → Schema | Owns this contract |
| `relates_to` | Note → any card (or any card → Note) | Context for that card |

Direction rule: **the line points from the actor of the sentence.** "Tasks API
uses Tasks DB" is a line from Tasks API to Tasks DB. A line that breaks the
table appears as an issue in `Review`.

## 4. Levels (Context, Containers, Components, Contracts)

`Views` shows the canvas at four levels. A card folds into the card that
**leads to it**:

| Card | Folds into |
| --- | --- |
| System kind `job` | the System, Repository, or Actor that `uses` it |
| System kind `database` or `queue` | the one System that `uses` it |
| Repository | the System that `uses` it |
| Artifact | the System or Repository that `produces` it |
| Schema | the System or Repository that `defines` it |

`Review` shows "Unassigned at level" when a card has no such parent, or when a
database has two or more users. It is a warning, not an error.

## 5. Finish

1. `More canvas actions` → `Replan layout`, after the lines exist (the layout
   follows them; before that it stacks the cards in one column). The preview
   opens as `region "Layout preview"`; click `button "Apply"` to move the cards.
   Escape or `button "Cancel"` discards the preview and leaves positions alone.
2. `Review` (toolbar) lists issues. Close it with `button "Close review"` before
   you use the toolbar again: the panel covers it.
3. `More canvas actions` → `Download .canvas`. Check the cards
   (`app.entityType`, `app.fields`) and lines (`app.relationType`) in the file.

## Failure signs

| Sign | Meaning |
| --- | --- |
| Line label "Define relation" | The line has no relation yet. Select it and set `Edge relation` |
| `Edge relation` not found | No single line is selected. Connect again, or click the line |
| Toolbar click times out | The Review panel or an editor covers it. Close it first |
