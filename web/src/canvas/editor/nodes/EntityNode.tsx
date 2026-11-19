import type { NodeProps } from '@xyflow/react'
import {
  Boxes,
  Braces,
  ChevronDown,
  ChevronRight,
  Cable,
  Code2,
  Database,
  FolderGit2,
  Layers,
  Package,
  ShieldCheck,
  StickyNote,
  Table2,
  UserRound,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import {
  NOTE_KIND_LABELS,
  entityTitle,
  findEntityType,
  type EntityTypeDefinition,
  type NoteKind,
  type OntologyField,
} from '@canvas/contract'

import { useOntology } from '../../../ontology/OntologyContext'
import { useSchemaCards } from '../../schema/schemaCards'
import { artifactSchemaChip } from '../../schema/embeddedSchema'
import { colorFor } from '../../model/adapter'
import type { CanvasFlowNode } from '../../model/adapter'
import { useCanvasEditorActions } from '../CanvasEditorContext'
import { useIsMobile } from '../../../useMediaQuery'
import { MarkdownContent } from '../MarkdownContent'
import { FocusEditor } from '../FocusEditor'
import { MarkdownEditor } from '../MarkdownEditorLazy'
import { NodeShell } from './NodeShell'
import { ApiDefinitionEditor } from '../../apiDesign/ApiDefinitionEditor'
import { ApiEndpointEditor, EndpointCopyCurlButton } from '../../apiDesign/ApiEndpointEditor'
import { ResourceEditor } from '../../apiDesign/ResourceEditor'
import { SecuritySchemeEditor } from '../../apiDesign/SecuritySchemeEditor'
import { ApiCardPreview } from '../../apiDesign/ApiCardPreview'
import { DatabaseEnumCardPreview, DatabaseSchemaCardPreview } from '../../database/DatabaseCardPreviews'
import { TableCardPreview } from '../../database/TableCardPreview'
import { TableEditor } from '../../database/TableEditor'
import { ArtifactEditor } from './ArtifactEditor'
import { FieldInput } from './FieldInput'

const ICONS = {
  boxes: Boxes,
  cable: Cable,
  'folder-git': FolderGit2,
  'user-round': UserRound,
  code: Code2,
  braces: Braces,
  database: Database,
  layers: Layers,
  'table-2': Table2,
  package: Package,
  shield: ShieldCheck,
  'sticky-note': StickyNote,
} as const

function TypeIcon({ name }: { name: string }) {
  const Icon = ICONS[name as keyof typeof ICONS] ?? StickyNote
  return <Icon size={16} strokeWidth={2.2} />
}

function entityFields(
  entityType: EntityTypeDefinition,
  fields: Record<string, string | number | null>,
  contentKey?: string,
): Array<{ field: OntologyField; value: string }> {
  return entityType.fields
    .filter((field) => !field.primary && field.key !== contentKey)
    .map((field) => ({ field, value: fields[field.key] == null ? '' : String(fields[field.key]) }))
    .filter(({ value }) => value.trim() !== '')
}

export function EntityNode({ id, data, selected }: NodeProps<CanvasFlowNode>) {
  const actions = useCanvasEditorActions()
  const isMobile = useIsMobile()
  const ontology = useOntology()
  const schemas = useSchemaCards()
  const meta = data.entity
  const [editing, setEditing] = useState(false)
  const [propertiesOpen, setPropertiesOpen] = useState(false)
  const formRef = useRef<HTMLDivElement>(null)
  const focusedForEdit = useRef(false)

  const entityType = meta ? findEntityType(ontology, meta.entityType) : undefined
  const contentField = entityType?.id === 'db_enum' || entityType?.id === 'db_schema'
    ? undefined
    : entityType?.fields.find((field) => field.type === 'textarea')
  const propertyFields = entityType
    ? entityType.fields.filter((field) => field.key !== contentField?.key)
    : []
  const primaryField = entityType?.fields.find((field) => field.primary)
  const focusKey = primaryField?.key === contentField?.key
    ? contentField?.key
    : primaryField?.key ?? contentField?.key ?? propertyFields[0]?.key

  function startEditing() {
    setPropertiesOpen(true)
    setEditing(true)
  }

  useEffect(() => {
    if (!editing) {
      focusedForEdit.current = false
      return
    }
    if (focusedForEdit.current) return
    focusedForEdit.current = true
    if (!focusKey) return
    const field = formRef.current?.querySelector<HTMLElement>(`[data-field-key="${focusKey}"]`)
    field?.scrollIntoView({ block: 'nearest' })
    if (field?.classList.contains('entity-content-field')) {
      field.querySelector<HTMLElement>('.rich-editor-content')?.focus()
    } else {
      field?.focus()
    }
  }, [editing, focusKey])

  if (!meta) {
    return (
      <NodeShell node={{ id, data, selected } as CanvasFlowNode} selected={Boolean(selected)} className="entity-node">
        <div className="asset-node-body"><span>Unknown entity</span></div>
      </NodeShell>
    )
  }

  if (!entityType) {
    return (
      <NodeShell node={{ id, data, selected } as CanvasFlowNode} selected={Boolean(selected)} className="entity-node">
        <div className="asset-node-body">
          <span>Unknown entity type: {meta.entityType}</span>
        </div>
      </NodeShell>
    )
  }

  const title = entityTitle(entityType, meta.fields)
  const iconColor = colorFor(entityType.color)
  const hiddenSummaryKeys = entityType.id === 'endpoint'
    ? new Set(['operation'])
    : entityType.id === 'api_definition' || entityType.id === 'database_definition'
      ? new Set(['extra'])
      : entityType.id === 'security_scheme'
        ? new Set(['definition'])
        : entityType.id === 'artifact'
          ? new Set(['schemaMode', 'schema', 'schemaRef'])
          : entityType.id === 'note'
            ? new Set(['kind'])
            : new Set<string>()
  const noteKind = entityType.id === 'note' ? String(meta.fields.kind ?? 'note') : ''
  const noteKindLabel = entityType.id === 'note'
    ? NOTE_KIND_LABELS[noteKind as NoteKind] ?? NOTE_KIND_LABELS.note
    : ''
  const rows = entityFields(entityType, meta.fields, contentField?.key)
    .filter(({ field }) => !hiddenSummaryKeys.has(field.key))
  const contentValue = contentField
    ? String(meta.fields[contentField.key] ?? '').trim()
    : ''
  const schemaChip = entityType.id === 'artifact' ? artifactSchemaChip(meta.fields, schemas) : undefined

  const editorForm = (
    <div
      className="entity-form nodrag nopan"
      ref={formRef}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Escape' || (event.key === 'Enter' && (event.metaKey || event.ctrlKey))) {
          event.preventDefault()
          event.stopPropagation()
          setEditing(false)
        }
      }}
    >
      {entityType.id === 'system' && meta.fields.kind === 'api' && (
        <button
          type="button"
          className="button ghost api-canvas-command"
          onClick={() => actions.createOrOpenApiCanvas(id, title || 'API canvas')}
        >
          <Cable size={16} />
          Create or open API canvas
        </button>
      )}
      {propertyFields.length > 0 && (
        <section className="property-drawer">
          <button
            type="button"
            className="property-drawer-toggle nodrag nopan"
            aria-expanded={propertiesOpen}
            onClick={() => setPropertiesOpen((open) => !open)}
          >
            {propertiesOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            Properties
            <span>{propertyFields.length}</span>
          </button>
          {propertiesOpen && (
            <div className="property-drawer-body">
              {propertyFields.map((field) => (
                <FieldInput
                  key={field.key}
                  field={field}
                  value={meta.fields[field.key] == null ? '' : String(meta.fields[field.key])}
                  readOnly={
                    (entityType.id === 'api_definition' || entityType.id === 'database_definition')
                    && field.key === 'extra'
                  }
                  onChange={(value) => actions.updateEntityField(id, field.key, value)}
                />
              ))}
            </div>
          )}
        </section>
      )}
      {contentField && (
        <div className="entity-field entity-content-field" data-field-key={contentField.key}>
          <span>{contentField.label}</span>
          <MarkdownEditor
            value={meta.fields[contentField.key] == null ? '' : String(meta.fields[contentField.key])}
            onChange={(value) => actions.updateEntityField(id, contentField.key, value)}
            autoFocus={focusKey === contentField.key}
          />
        </div>
      )}
    </div>
  )

  return (
    <NodeShell
      node={{ id, data, selected } as CanvasFlowNode}
      selected={Boolean(selected)}
      className={`entity-node${entityType.id === 'resource' ? ' api-lane-node' : ''}${entityType.id === 'db_schema' ? ' db-schema-lane' : ''}`}
      onEdit={startEditing}
    >
      {entityType.id === 'table' ? (
        <TableCardPreview fields={meta.fields} />
      ) : entityType.id === 'db_schema' ? (
        <DatabaseSchemaCardPreview fields={meta.fields} />
      ) : entityType.id === 'db_enum' ? (
        <DatabaseEnumCardPreview fields={meta.fields} />
      ) : ['api_definition', 'resource', 'endpoint', 'security_scheme'].includes(entityType.id) ? (
        <div
          className="entity-card api-card"
          onDoubleClick={() => {
            if (!editing) startEditing()
          }}
        >
          <ApiCardPreview entityType={entityType.id} nodeId={id} fields={meta.fields} />
        </div>
      ) : (
        <div
          className="entity-card"
          onDoubleClick={() => {
            if (!editing) startEditing()
          }}
        >
          <header className="entity-head">
            <span
              className="entity-icon"
              style={iconColor
                ? {
                  color: iconColor,
                  borderColor: `${iconColor}66`,
                  background: `${iconColor}14`,
                }
                : undefined}
            >
              <TypeIcon name={entityType.icon} />
            </span>
            <div>
              <span className="entity-type">{entityType.label}</span>
              <strong>{title || `Untitled ${entityType.label.toLowerCase()}`}</strong>
            </div>
            {entityType.id === 'note' && (
              <span className={`note-kind note-kind-${noteKind}`}>{noteKindLabel}</span>
            )}
          </header>

          <div className="entity-body">
            {rows.length === 0 && !contentValue && (
              <span className="entity-hint">
                {entityType.id === 'note' ? `${isMobile ? 'Double-tap' : 'Double-click'} to write a note` : `${isMobile ? 'Double-tap' : 'Double-click'} to add fields`}
              </span>
            )}
            {rows.map(({ field, value }) => (
              <div className="entity-row" key={field.key}>
                <span>{field.label}</span>
                {field.type === 'url' ? (
                  <a
                    className="nodrag"
                    href={value}
                    target="_blank"
                    rel="noreferrer noopener"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {value}
                  </a>
                ) : (
                  <strong>{value}</strong>
                )}
              </div>
            ))}
            {schemaChip && <span className="artifact-schema-chip">{schemaChip}</span>}
            {contentValue && (
              <div className="entity-content-preview">
                <MarkdownContent text={contentValue} />
              </div>
            )}
          </div>
        </div>
      )}
      {editing && (
        <FocusEditor
          label={`Edit ${entityType.label}`}
          title={title || `Untitled ${entityType.label.toLowerCase()}`}
          badge={entityType.id === 'endpoint'
            ? <span className={`api-method api-method-${String(meta.fields.method ?? 'get').toLowerCase()}`}>{String(meta.fields.method ?? 'GET')}</span>
            : undefined}
          actions={entityType.id === 'endpoint'
            ? <EndpointCopyCurlButton fields={meta.fields} />
            : undefined}
          onClose={() => setEditing(false)}
        >
          {entityType.id === 'endpoint' ? (
            <ApiEndpointEditor
              fields={meta.fields}
              onChange={(key, value) => actions.updateEntityField(id, key, value)}
            />
          ) : entityType.id === 'api_definition' ? (
            <ApiDefinitionEditor
              fields={meta.fields}
              onChange={(key, value) => actions.updateEntityField(id, key, value)}
            />
          ) : entityType.id === 'security_scheme' ? (
            <SecuritySchemeEditor
              fields={meta.fields}
              onChange={(key, value) => actions.updateEntityField(id, key, value)}
            />
          ) : entityType.id === 'resource' ? (
            <ResourceEditor
              fields={meta.fields}
              onChange={(key, value) => actions.updateEntityField(id, key, value)}
            />
          ) : entityType.id === 'table' ? (
            <TableEditor
              fields={meta.fields}
              onChange={(key, value) => actions.updateEntityField(id, key, value)}
            />
          ) : entityType.id === 'artifact' ? (
            <ArtifactEditor
              id={id}
              entityType={entityType}
              fields={meta.fields}
              onChange={(key, value) => actions.updateEntityField(id, key, value)}
              onOpenSchema={(schemaId) => {
                setEditing(false)
                actions.openNodeEditor(schemaId)
              }}
            />
          ) : editorForm}
        </FocusEditor>
      )}
    </NodeShell>
  )
}
