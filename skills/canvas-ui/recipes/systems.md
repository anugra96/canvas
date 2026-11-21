# Recipe: design a system architecture by hand

Profile: Systems. Five card types, one note type, four line types. Lines carry
the meaning, so their direction matters.

```text
Create canvas (Systems) → cards (Actor, System, Repository, Artifact, Schema)
  → lines (Connect + Edge relation) → notes → Replan layout → Apply preview → Review → Download .canvas
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

## 2. Lines

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

## 3. Levels (Context, Containers, Components, Contracts)

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

## 4. Finish

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
