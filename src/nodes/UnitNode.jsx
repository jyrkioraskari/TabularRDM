/**
 * Node for browsing QUDT units. It can be filtered by a connected quantity kind
 * and exposes selected units as draggable payloads for ColumnDescriptionNode.
 */
import { useEffect, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { queryUnits } from '../services/qudtService';

const UNIT_DRAG_MIME_TYPE = 'application/tabulatrdm-unit';

export default function UnitNode({ id, data, selected }) {
  const [units, setUnits] = useState([]);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const language = data.language ?? 'en';
  const [filterText, setFilterText] = useState('');
  const [status, setStatus] = useState('Loading units...');
  const [error, setError] = useState('');
  const normalizedFilterText = filterText.trim().toLocaleLowerCase();
  const visibleUnits = units.filter((unit) => {
    if (unit.labelLanguage !== language) {
      return false;
    }

    if (
      data.quantityKindFilter &&
      !unit.quantityKinds.includes(data.quantityKindFilter)
    ) {
      return false;
    }

    if (!normalizedFilterText) {
      return true;
    }

    return unit.label.toLocaleLowerCase().includes(normalizedFilterText);
  });
  const selectedUnitKey = selectedUnit?.unit || '';

  useEffect(() => {
    const abortController = new AbortController();

    setStatus('Loading units...');
    setError('');

    queryUnits({
      limit: data.limit,
      offset: data.offset ?? 0,
      signal: abortController.signal,
    })
      .then((rows) => {
        setUnits(rows);
        setStatus(
          rows.length === 1 ? '1 unit loaded.' : `${rows.length} units loaded.`,
        );
      })
      .catch((loadError) => {
        if (loadError?.name === 'AbortError') {
          return;
        }

        setUnits([]);
        setError(loadError?.message || 'Unable to load units.');
        setStatus('');
      });

    return () => {
      abortController.abort();
    };
  }, [data.limit, data.offset]);

  useEffect(() => {
    if (visibleUnits.length === 0) {
      if (selectedUnit) {
        setSelectedUnit(null);
      }

      return;
    }

    const selectedIsVisible = visibleUnits.some((unit) => unit.unit === selectedUnitKey);

    if (!selectedIsVisible) {
      setSelectedUnit(visibleUnits[0]);
    }
  }, [selectedUnit, selectedUnitKey, visibleUnits]);

  return (
    <div className={`unit-node${selected ? ' selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="unit-node__header">
        <p className="unit-node__title">{data.label}</p>
      </div>

      <input
        id={`unit-filter-${id}`}
        type="search"
        className="unit-node__filter-input nodrag"
        value={filterText}
        onChange={(event) => setFilterText(event.target.value)}
        aria-label="Filter units"
        placeholder="Type to filter"
      />

      {status ? <p className="unit-node__status">{status}</p> : null}
      {error ? <p className="unit-node__error">{error}</p> : null}
      {data.quantityKindLabel ? (
        <p className="unit-node__status">Filtered by {data.quantityKindLabel}</p>
      ) : null}

      <div className="unit-node__results nodrag nopan nowheel">
        {visibleUnits.length > 0 ? (
          <ul>
            {visibleUnits.map((unit, index) => (
              <li key={`${unit.unit}-${unit.labelLanguage || index}`}>
                <button
                  type="button"
                  draggable
                  className={`unit-node__item-button nodrag${
                    unit.unit === selectedUnitKey ? ' selected' : ''
                  }`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onDragStart={(event) => {
                    event.stopPropagation();
                    event.dataTransfer.setData(
                      UNIT_DRAG_MIME_TYPE,
                      JSON.stringify({
                        label: unit.label || 'Unnamed unit',
                        uri: unit.unit,
                        language: unit.labelLanguage,
                      }),
                    );
                    event.dataTransfer.setData('text/plain', unit.label || unit.unit);
                    event.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => setSelectedUnit(unit)}
                >
                  {unit.label || 'Unnamed unit'}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>No units listed for this language.</p>
        )}
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
}
