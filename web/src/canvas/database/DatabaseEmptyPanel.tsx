import { FileCode2, ListTree, Plus } from 'lucide-react'

export function DatabaseEmptyPanel({
  onAddTable,
  onAddEnum,
  onImportDdl,
}: {
  onAddTable: () => void
  onAddEnum: () => void
  onImportDdl: () => void
}) {
  return (
    <section className="db-empty-panel" aria-label="Design a database">
      <div className="db-empty-icon"><Plus size={18} /></div>
      <h2>Design a database</h2>
      <p>Tables hold columns, keys, and indexes. Double-click a table to edit it.</p>
      <p>Choose a target later in Database settings.</p>
      <div className="db-empty-actions">
        <button type="button" className="button primary" onClick={onAddTable}>
          <Plus size={15} />
          Add table
        </button>
        <button type="button" className="button" onClick={onAddEnum}>
          <ListTree size={15} />
          Add enum
        </button>
        <button type="button" className="button" onClick={onImportDdl}>
          <FileCode2 size={15} />
          Import DDL
        </button>
      </div>
    </section>
  )
}
