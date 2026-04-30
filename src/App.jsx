import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addEdge,
  applyEdgeChanges,
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import * as XLSX from 'xlsx';
import '@xyflow/react/dist/style.css';
import TabularFileNode from './nodes/TabularFileNode';
import PreviewTabularDataNode from './nodes/PreviewTabularDataNode';
import ColumnDescriptionNode from './nodes/ColumnDescriptionNode';
import MetadataFormNode from './nodes/MetadataFormNode';
import MetadataProfileSearchNode from './nodes/MetadataProfileSearchNode';
import RDFStoreNode from './nodes/RDFStoreNode';
import ROCrateNode from './nodes/ROCrateNode';
import QuantityKindNode from './nodes/QuantityKindNode';
import UnitNode from './nodes/UnitNode';
import { fetchAimsApplicationProfileDefinition } from './services/aimsApi';
import { serializeColumnDescriptionsToTurtle } from './services/columnDescriptionRdf';
import tabularFileIcon from './assets/tabular-file-icon.png';
import spreadsheetIcon from './assets/matt-icons_text-x-office-generic-spreadsheet.svg';
import tabularSchemaIcon from './assets/tabular_schema.png';
import metadataFormIcon from './assets/Architetto_--_Formulario.svg';
import aimsIcon from './assets/aims.png';
import rdfLogo from './assets/250px-Rdf_logo.svg.png';
import roCrateLogo from './assets/RO-Crate.png';
import rwthCaadLogo from './assets/rwth_caad_en_schwarz_grau_rgb.svg';
import nfdi4ingLogo from './assets/nfdi4ing_24.svg';

const initialNodes = [
  {
    id: 'tabular-source',
    type: 'tabularFile',
    position: { x: 40, y: 80 },
    data: { label: 'Tabular file 1' },
  },
  {
    id: 'tabular',
    type: 'previewTabular',
    position: { x: 280, y: 80 },
    data: { label: 'Preview Tabular Data 1' },
  },
];

const tabularPreviewEdgeStyle = { stroke: '#2563eb', strokeWidth: 2 };

/**
 * Highlights connections that carry workflow data between compatible nodes.
 * The styling is visual only; data propagation is handled by deriveNodeData().
 */
function applySemanticEdgeStyle(edge, nodes) {
  const nodeTypesById = new Map(nodes.map((node) => [node.id, node.type]));

  if (
    (nodeTypesById.get(edge.source) === 'tabularFile' &&
      ['previewTabular', 'columnDescription', 'headerSchema'].includes(
        nodeTypesById.get(edge.target),
      )) ||
    (nodeTypesById.get(edge.source) === 'metadataForm' &&
      nodeTypesById.get(edge.target) === 'rdfStore') ||
    (['columnDescription', 'headerSchema'].includes(nodeTypesById.get(edge.source)) &&
      nodeTypesById.get(edge.target) === 'rdfStore') ||
    (nodeTypesById.get(edge.source) === 'profileSearch' &&
      nodeTypesById.get(edge.target) === 'metadataForm') ||
    (nodeTypesById.get(edge.source) === 'quantityKind' &&
      nodeTypesById.get(edge.target) === 'unit') ||
    ([
      'tabularFile',
      'previewTabular',
      'rdfStore',
      'metadataForm',
      'columnDescription',
      'headerSchema',
    ].includes(nodeTypesById.get(edge.source)) &&
      nodeTypesById.get(edge.target) === 'roCrate')
  ) {
    return {
      ...edge,
      animated: true,
      style: {
        ...edge.style,
        ...tabularPreviewEdgeStyle,
      },
    };
  }

  return edge;
}

const initialEdges = [
  applySemanticEdgeStyle(
    { id: 'e1-2', source: 'tabular-source', target: 'tabular', animated: true },
    initialNodes,
  ),
];

const nodeTemplates = [
  { type: 'tabularFile', label: 'Tabular file', icon: tabularFileIcon },
  { type: 'previewTabular', label: 'Preview Tabular Data', icon: spreadsheetIcon },
  { type: 'columnDescription', label: 'Column Description', icon: tabularSchemaIcon },
  { type: 'quantityKind', label: 'Quantity Kinds' },
  { type: 'unit', label: 'Units' },
  { type: 'profileSearch', label: 'Metadata Profile Search', icon: aimsIcon },
  { type: 'metadataForm', label: 'Metadata Form', icon: metadataFormIcon },
  { type: 'rdfStore', label: 'RDF Store', icon: rdfLogo },
  { type: 'roCrate', label: 'RO-Crate', icon: roCrateLogo },
];

const globalLanguageOptions = [
  {
    value: 'en',
    label: 'English',
    iconSrc: 'https://unpkg.com/language-icons/icons/en.svg',
  },
  {
    value: 'de',
    label: 'Deutsch',
    iconSrc: 'https://unpkg.com/language-icons/icons/de.svg',
  },
];

const languageAwareNodeTypes = new Set(['quantityKind', 'unit']);

const appText = {
  en: {
    sidebarHeading: 'Tabular Data Management',
    sidebarIntro: 'Drag a button into the canvas to create a node where you drop it.',
  },
  de: {
    sidebarHeading: 'Management von tabellarischen Daten',
    sidebarIntro:
      'Ziehe eine Schaltfläche auf die Arbeitsfläche, um an der Stelle, an der du sie ablegst, einen Knoten zu erstellen.',
  },
};

/**
 * Creates editable column-description rows from spreadsheet headers while
 * preserving any descriptions and units already entered for unchanged headers.
 */
function buildColumnDescriptionFields(headers, previousFields = []) {
  const previousByHeader = new Map(
    previousFields.map((field) => [field.header, field]),
  );

  return headers.map((header) => {
    const existing = previousByHeader.get(header);

    return {
      header,
      description: existing?.description ?? '',
      unit: existing?.unit ?? '',
      unitUri: existing?.unitUri ?? '',
    };
  });
}

function buildNodeTypeCounts(nodes) {
  return nodes.reduce((counts, node) => {
    counts[node.type] = (counts[node.type] ?? 0) + 1;
    return counts;
  }, {});
}

function normalizeCellValue(value) {
  if (value == null) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value);
}

function isEmptyRow(row) {
  return row.every((cell) => normalizeCellValue(cell).trim().length === 0);
}

/**
 * Parses a loaded workbook into two shapes:
 * - a small first-sheet preview used by preview/description nodes
 * - all sheets as row objects for later RO-Crate CSV export
 */
function parseTabularWorkbook(buffer, previewRowCount = 5) {
  const workbook = XLSX.read(buffer, {
    type: 'array',
    cellDates: true,
  });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    return { headers: [], rows: [], rowCount: 0, sheetName: '', sheets: [] };
  }

  const worksheet = workbook.Sheets[sheetName];
  const tableRows = XLSX.utils
    .sheet_to_json(worksheet, {
      header: 1,
      blankrows: false,
      defval: '',
      raw: false,
    })
    .filter((row) => Array.isArray(row) && !isEmptyRow(row));
  const sheets = workbook.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], {
      defval: '',
      raw: false,
    }),
  }));

  if (tableRows.length === 0) {
    return { headers: [], rows: [], rowCount: 0, sheetName, sheets };
  }

  const columnCount = tableRows.reduce(
    (maxColumns, row) => Math.max(maxColumns, row.length),
    0,
  );
  const headers = Array.from({ length: columnCount }, (_, index) =>
    normalizeCellValue(tableRows[0][index]),
  );
  const rows = tableRows.slice(1, previewRowCount + 1).map((row) =>
    Array.from({ length: columnCount }, (_, index) => normalizeCellValue(row[index])),
  );

  return { headers, rows, rowCount: Math.max(tableRows.length - 1, 0), sheetName, sheets };
}

/**
 * Propagates tabular payloads through outgoing edges. Downstream nodes receive
 * only the fields they need, keeping node-specific state isolated in data.
 */
function recalculateFlows(nodes, edges, tabularMemory) {
  const outgoingEdgesBySource = new Map();

  for (const edge of edges) {
    const outgoing = outgoingEdgesBySource.get(edge.source);
    if (outgoing) {
      outgoing.push(edge.target);
    } else {
      outgoingEdgesBySource.set(edge.source, [edge.target]);
    }
  }

  const payloadByNodeId = new Map();
  const queue = [];
  const visited = new Set();

  for (const node of nodes) {
    if (node.type !== 'tabularFile') {
      continue;
    }

    const preview = tabularMemory.get(node.id);
    if (!preview) {
      continue;
    }

    payloadByNodeId.set(node.id, preview);
    queue.push({ nodeId: node.id, payload: preview });
  }

  while (queue.length > 0) {
    const next = queue.shift();

    if (!next || visited.has(next.nodeId)) {
      continue;
    }

    visited.add(next.nodeId);
    const targets = outgoingEdgesBySource.get(next.nodeId) ?? [];

    for (const targetId of targets) {
      if (payloadByNodeId.has(targetId)) {
        continue;
      }

      payloadByNodeId.set(targetId, next.payload);
      queue.push({ nodeId: targetId, payload: next.payload });
    }
  }

  return nodes.map((node) => {
    const payload = payloadByNodeId.get(node.id);

    if (node.type === 'previewTabular') {
      return payload
        ? {
            ...node,
            data: {
              ...node.data,
              headers: payload.headers,
              rows: payload.rows,
            },
          }
        : {
            ...node,
            data: {
              ...node.data,
              headers: [],
              rows: [],
            },
          };
    }

    if (node.type === 'columnDescription' || node.type === 'headerSchema') {
      return payload
        ? {
            ...node,
            data: {
              ...node.data,
              fields: buildColumnDescriptionFields(payload.headers, node.data.fields),
            },
          }
        : {
            ...node,
            data: {
              ...node.data,
              fields: [],
            },
          };
    }

    if (node.type === 'roCrate') {
      return {
        ...node,
        data: {
          ...node.data,
          sheets: payload?.sheets ?? [],
        },
      };
    }

    return node;
  });
}

function getConnectedMetadataFormIds(nodes, edges, profileSearchNodeId) {
  const nodeTypesById = new Map(nodes.map((node) => [node.id, node.type]));
  const metadataFormIds = new Set();

  for (const edge of edges) {
    const sourceIsProfileSearch = edge.source === profileSearchNodeId;
    const targetIsProfileSearch = edge.target === profileSearchNodeId;

    if (!sourceIsProfileSearch && !targetIsProfileSearch) {
      continue;
    }

    const connectedNodeId = sourceIsProfileSearch ? edge.target : edge.source;

    if (nodeTypesById.get(connectedNodeId) === 'metadataForm') {
      metadataFormIds.add(connectedNodeId);
    }
  }

  return [...metadataFormIds];
}

/**
 * Collects serialized RDF from metadata-producing nodes connected to RDF Store
 * nodes. RDF Store nodes consume the combined Turtle string via data.rdfInput.
 */
function propagateMetadataRdf(nodes, edges) {
  const nodeTypesById = new Map(nodes.map((node) => [node.id, node.type]));
  const nodeDataById = new Map(nodes.map((node) => [node.id, node.data]));
  const rdfInputsByNodeId = new Map();

  for (const edge of edges) {
    if (nodeTypesById.get(edge.target) !== 'rdfStore') {
      continue;
    }

    if (
      !['metadataForm', 'columnDescription', 'headerSchema'].includes(
        nodeTypesById.get(edge.source),
      )
    ) {
      continue;
    }

    const serializedRdf = nodeDataById.get(edge.source)?.serializedRdf || '';

    if (serializedRdf) {
      const existingInputs = rdfInputsByNodeId.get(edge.target) ?? [];
      rdfInputsByNodeId.set(edge.target, [...existingInputs, serializedRdf]);
    }
  }

  return nodes.map((node) => {
    if (node.type !== 'rdfStore') {
      return node;
    }

    return {
      ...node,
      data: {
        ...node.data,
        rdfInput: (rdfInputsByNodeId.get(node.id) ?? []).join('\n\n'),
      },
    };
  });
}

/**
 * Applies the selected Quantity Kind as a filter for connected Unit nodes.
 */
function propagateQuantityKindToUnits(nodes, edges) {
  const nodeTypesById = new Map(nodes.map((node) => [node.id, node.type]));
  const nodeDataById = new Map(nodes.map((node) => [node.id, node.data]));
  const quantityKindByUnitId = new Map();

  for (const edge of edges) {
    if (
      nodeTypesById.get(edge.source) === 'quantityKind' &&
      nodeTypesById.get(edge.target) === 'unit'
    ) {
      quantityKindByUnitId.set(
        edge.target,
        nodeDataById.get(edge.source)?.selectedQuantityKind || null,
      );
    }
  }

  return nodes.map((node) => {
    if (node.type !== 'unit') {
      return node;
    }

    const quantityKind = quantityKindByUnitId.get(node.id);

    return {
      ...node,
      data: {
        ...node.data,
        quantityKindFilter: quantityKind?.qk || '',
        quantityKindLabel: quantityKind?.label || '',
      },
    };
  });
}

/**
 * Collects RDF content connected to RO-Crate nodes. The current metadata
 * producers emit Turtle, but the RO-Crate node keeps the existing jsonLdContent
 * property name because the export template expects that shape.
 */
function propagateROCrateInputs(nodes, edges) {
  const nodeTypesById = new Map(nodes.map((node) => [node.id, node.type]));
  const nodeDataById = new Map(nodes.map((node) => [node.id, node.data]));
  const rdfInputsByNodeId = new Map();

  for (const edge of edges) {
    if (nodeTypesById.get(edge.target) !== 'roCrate') {
      continue;
    }

    const sourceType = nodeTypesById.get(edge.source);
    const sourceData = nodeDataById.get(edge.source) ?? {};
    const rdfContent =
      sourceType === 'rdfStore'
        ? sourceData.rdfInput
        : ['metadataForm', 'columnDescription', 'headerSchema'].includes(sourceType)
          ? sourceData.serializedRdf
          : '';

    if (rdfContent) {
      const existingInputs = rdfInputsByNodeId.get(edge.target) ?? [];
      rdfInputsByNodeId.set(edge.target, [...existingInputs, rdfContent]);
    }
  }

  return nodes.map((node) => {
    if (node.type !== 'roCrate') {
      return node;
    }

    return {
      ...node,
      data: {
        ...node.data,
        jsonLdContent: {
          jsonLd: (rdfInputsByNodeId.get(node.id) ?? []).join('\n\n'),
        },
      },
    };
  });
}

/**
 * Central recomputation pipeline for derived node data. Call this after any
 * node or edge change that may affect previews, RDF, units, or RO-Crate inputs.
 */
function deriveNodeData(nodes, edges, tabularMemory) {
  const flowNodes = recalculateFlows(nodes, edges, tabularMemory);
  const nodesWithMetadata = propagateMetadataRdf(flowNodes, edges);
  const nodesWithUnits = propagateQuantityKindToUnits(nodesWithMetadata, edges);
  return propagateROCrateInputs(nodesWithUnits, edges);
}

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges] = useEdgesState(initialEdges);
  const [globalLanguage, setGlobalLanguage] = useState('en');
  const text = appText[globalLanguage] ?? appText.en;
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const nodeIdCountRef = useRef(initialNodes.length);
  const nodeTypeCountsRef = useRef(buildNodeTypeCounts(initialNodes));
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const tabularMemoryRef = useRef(new Map());
  const profileDefinitionRequestsRef = useRef(new Map());
  const nodeHandlerRef = useRef({});

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  const onColumnDescriptionFieldsChange = useCallback(
    (nodeId, fields) => {
      const serializedRdf = serializeColumnDescriptionsToTurtle(fields);

      setNodes((currentNodes) => {
        const nodesWithFields = currentNodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  fields,
                  serializedRdf,
                },
              }
            : node,
        );
        const nextNodes = deriveNodeData(
          nodesWithFields,
          edgesRef.current,
          tabularMemoryRef.current,
        );

        nodesRef.current = nextNodes;
        return nextNodes;
      });
    },
    [setNodes],
  );

  const onTabularLoaded = useCallback(
    (nodeId, fileName, buffer) => {
      const preview = parseTabularWorkbook(buffer, 5);
      tabularMemoryRef.current.set(nodeId, preview);

      setNodes((currentNodes) => {
        const nextNodes = deriveNodeData(
          currentNodes.map((node) =>
            node.id === nodeId
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    fileName,
                    rowCount: preview.rowCount,
                    sheetName: preview.sheetName,
                  },
              }
              : node,
          ),
          edgesRef.current,
          tabularMemoryRef.current,
        );

        nodesRef.current = nextNodes;
        return nextNodes;
      });
    },
    [setNodes],
  );

  const onProfileSelect = useCallback(
    async (profileSearchNodeId, profile) => {
      const metadataFormIds = getConnectedMetadataFormIds(
        nodesRef.current,
        edgesRef.current,
        profileSearchNodeId,
      );

      if (metadataFormIds.length === 0) {
        throw new Error('Connect this profile search node to a metadata form first.');
      }

      profileDefinitionRequestsRef.current.get(profileSearchNodeId)?.abort();

      const abortController = new AbortController();
      profileDefinitionRequestsRef.current.set(profileSearchNodeId, abortController);

      try {
        const profileDefinition = await fetchAimsApplicationProfileDefinition({
          profile,
          signal: abortController.signal,
        });

        if (profileDefinitionRequestsRef.current.get(profileSearchNodeId) !== abortController) {
          return;
        }

        const metadataFormIdSet = new Set(metadataFormIds);
        const shapesKey = `profile-${profileDefinition.baseUri}-${Date.now()}`;

        setNodes((currentNodes) => {
          const nextNodes = currentNodes.map((node) =>
            metadataFormIdSet.has(node.id)
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    shapes: profileDefinition.shapes,
                    shapesKey,
                    profileName: profileDefinition.name,
                    profileBaseUri: profileDefinition.baseUri,
                  },
                }
              : node,
          );

          nodesRef.current = nextNodes;
          return nextNodes;
        });
      } catch (error) {
        if (error?.name === 'AbortError') {
          return;
        }

        throw error;
      } finally {
        if (profileDefinitionRequestsRef.current.get(profileSearchNodeId) === abortController) {
          profileDefinitionRequestsRef.current.delete(profileSearchNodeId);
        }
      }
    },
    [setNodes],
  );

  const onMetadataRdfChange = useCallback(
    (nodeId, serializedRdf) => {
      setNodes((currentNodes) => {
        const nodesWithMetadata = currentNodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  serializedRdf,
                },
              }
            : node,
        );
        const nextNodes = deriveNodeData(
          nodesWithMetadata,
          edgesRef.current,
          tabularMemoryRef.current,
        );

        nodesRef.current = nextNodes;
        return nextNodes;
      });
    },
    [setNodes],
  );

  const onQuantityKindSelect = useCallback(
    (nodeId, quantityKind) => {
      setNodes((currentNodes) => {
        const nodesWithSelection = currentNodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  selectedQuantityKind: quantityKind,
                },
              }
            : node,
        );
        const nextNodes = deriveNodeData(
          nodesWithSelection,
          edgesRef.current,
          tabularMemoryRef.current,
        );

        nodesRef.current = nextNodes;
        return nextNodes;
      });
    },
    [setNodes],
  );

  const onGlobalLanguageChange = useCallback(
    (language) => {
      setGlobalLanguage(language);
      document.documentElement.lang = language;

      setNodes((currentNodes) => {
        const nextNodes = currentNodes.map((node) =>
          languageAwareNodeTypes.has(node.type)
            ? {
                ...node,
                data: {
                  ...node.data,
                  language,
                },
              }
            : node,
        );

        nodesRef.current = nextNodes;
        return nextNodes;
      });
    },
    [setNodes],
  );

  nodeHandlerRef.current = {
    onTabularLoaded,
    onColumnDescriptionFieldsChange,
    onMetadataRdfChange,
    onProfileSelect,
    onQuantityKindSelect,
  };

  const nodeTypes = useMemo(
    () => ({
      tabularFile: (props) => (
        <TabularFileNode
          {...props}
          onTabularLoaded={nodeHandlerRef.current.onTabularLoaded}
        />
      ),
      previewTabular: PreviewTabularDataNode,
      columnDescription: (props) => (
        <ColumnDescriptionNode
          {...props}
          onFieldsChange={nodeHandlerRef.current.onColumnDescriptionFieldsChange}
        />
      ),
      headerSchema: (props) => (
        <ColumnDescriptionNode
          {...props}
          onFieldsChange={nodeHandlerRef.current.onColumnDescriptionFieldsChange}
        />
      ),
      metadataForm: (props) => (
        <MetadataFormNode
          {...props}
          onRdfChange={nodeHandlerRef.current.onMetadataRdfChange}
        />
      ),
      profileSearch: (props) => (
        <MetadataProfileSearchNode
          {...props}
          onProfileSelect={nodeHandlerRef.current.onProfileSelect}
        />
      ),
      quantityKind: (props) => (
        <QuantityKindNode
          {...props}
          onQuantityKindSelect={nodeHandlerRef.current.onQuantityKindSelect}
        />
      ),
      unit: UnitNode,
      rdfStore: RDFStoreNode,
      roCrate: ROCrateNode,
    }),
    [],
  );

  const onConnect = useCallback(
    (connection) =>
      setEdges((currentEdges) => {
        const styledConnection = applySemanticEdgeStyle(connection, nodesRef.current);
        const nextEdges = addEdge(styledConnection, currentEdges);
        edgesRef.current = nextEdges;

        setNodes((currentNodes) => {
          const nextNodes = deriveNodeData(currentNodes, nextEdges, tabularMemoryRef.current);
          nodesRef.current = nextNodes;
          return nextNodes;
        });

        return nextEdges;
      }),
    [setEdges, setNodes],
  );

  const onEdgesChange = useCallback(
    (changes) => {
      setEdges((currentEdges) => {
        const nextEdges = applyEdgeChanges(changes, currentEdges);
        edgesRef.current = nextEdges;

        setNodes((currentNodes) => {
          const nextNodes = deriveNodeData(currentNodes, nextEdges, tabularMemoryRef.current);
          nodesRef.current = nextNodes;
          return nextNodes;
        });

        return nextEdges;
      });
    },
    [setEdges, setNodes],
  );

  const onNodesDelete = useCallback((deletedNodes) => {
    for (const node of deletedNodes) {
      tabularMemoryRef.current.delete(node.id);

      if (node.type === 'profileSearch') {
        profileDefinitionRequestsRef.current.get(node.id)?.abort();
        profileDefinitionRequestsRef.current.delete(node.id);
      }
    }
  }, []);

  const onDragStart = useCallback((event, template) => {
    event.dataTransfer.setData('application/reactflow', JSON.stringify(template));
    event.dataTransfer.effectAllowed = 'move';
  }, []);

  const onDragOver = useCallback((event) => {
    if (!Array.from(event.dataTransfer.types).includes('application/reactflow')) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event) => {
      if (!reactFlowInstance) {
        return;
      }

      const rawTemplate = event.dataTransfer.getData('application/reactflow');

      if (!rawTemplate) {
        return;
      }

      event.preventDefault();

      const template = JSON.parse(rawTemplate);
      nodeIdCountRef.current += 1;
      const nextTypeCount = (nodeTypeCountsRef.current[template.type] ?? 0) + 1;
      nodeTypeCountsRef.current[template.type] = nextTypeCount;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode = {
        id: `node-${nodeIdCountRef.current}`,
        type: template.type,
        position,
        data: {
          label: `${template.label} ${nextTypeCount}`,
          ...(languageAwareNodeTypes.has(template.type) ? { language: globalLanguage } : {}),
        },
      };

      setNodes((currentNodes) => {
        const nextNodes = [...currentNodes, newNode];
        nodesRef.current = nextNodes;
        return nextNodes;
      });
    },
    [globalLanguage, reactFlowInstance, setNodes],
  );

  return (
    <div className="app-shell">
      <img className="app-logo" src={rwthCaadLogo} alt="RWTH CAAD" />
      <div className="global-language-selector" aria-label="Global language selection">
        {globalLanguageOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`global-language-selector__button${
              globalLanguage === option.value ? ' selected' : ''
            }`}
            onClick={() => onGlobalLanguageChange(option.value)}
            aria-pressed={globalLanguage === option.value}
            aria-label={option.label}
            title={option.label}
          >
            <img
              className="global-language-selector__icon"
              src={option.iconSrc}
              alt=""
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
      <aside className="sidebar">
        <p className="eyebrow">{text.sidebarHeading}</p>
        <p className="intro">{text.sidebarIntro}</p>
        <div className="node-palette">
          {nodeTemplates.map((template) => (
            <button
              key={template.label}
              type="button"
              draggable
              className={`drag-button${template.icon ? ' drag-button--with-icon' : ''}`}
              onDragStart={(event) => onDragStart(event, template)}
            >
              <span className="drag-button__content">
                {template.icon ? (
                  <img src={template.icon} alt="" className="drag-button__icon" />
                ) : null}
                <span>{template.label}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="sidebar-footer">
          <img className="sidebar-footer__logo" src={nfdi4ingLogo} alt="NFDI4Ing" />
        </div>
      </aside>

      <main className="canvas" onDrop={onDrop} onDragOver={onDragOver}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodesDelete={onNodesDelete}
          onConnect={onConnect}
          onInit={setReactFlowInstance}
          deleteKeyCode={['Backspace', 'Delete']}
          fitViewOptions={{ padding: 0.25, maxZoom: 0.9 }}
          fitView
        >
          <Controls />
          <Background gap={16} size={1} />
        </ReactFlow>
      </main>
    </div>
  );
}
