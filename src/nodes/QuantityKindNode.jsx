/**
 * Node for browsing and selecting QUDT quantity kinds. The selected quantity
 * kind is propagated to connected UnitNode instances as a unit filter.
 */
import { useCallback, useEffect, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { queryQuantityKinds } from '../services/qudtService';

function capitalizeInitial(value) {
  if (!value) {
    return value;
  }

  return value[0].toLocaleUpperCase() + value.slice(1);
}

export default function QuantityKindNode({ id, data, selected, onQuantityKindSelect }) {
  const [quantityKinds, setQuantityKinds] = useState([]);
  const [selectedQuantityKind, setSelectedQuantityKind] = useState(null);
  const language = data.language ?? 'en';
  const [filterText, setFilterText] = useState('');
  const [status, setStatus] = useState('Loading quantity kinds...');
  const [error, setError] = useState('');
  const normalizedFilterText = filterText.trim().toLocaleLowerCase();
  const visibleQuantityKinds = quantityKinds.filter((quantityKind) => {
    if (quantityKind.labelLanguage !== language) {
      return false;
    }

    if (!normalizedFilterText) {
      return true;
    }

    return quantityKind.label.toLocaleLowerCase().includes(normalizedFilterText);
  });
  const selectedQuantityKindKey = selectedQuantityKind?.qk || '';

  const selectQuantityKind = useCallback(
    (quantityKind) => {
      setSelectedQuantityKind(quantityKind);
      onQuantityKindSelect?.(id, quantityKind);
    },
    [id, onQuantityKindSelect],
  );

  useEffect(() => {
    const abortController = new AbortController();

    setStatus('Loading quantity kinds...');
    setError('');

    queryQuantityKinds({
      limit: data.limit,
      offset: data.offset ?? 0,
      signal: abortController.signal,
    })
      .then((rows) => {
        setQuantityKinds(rows);
        setStatus(
          rows.length === 1 ? '1 quantity kind loaded.' : `${rows.length} quantity kinds loaded.`,
        );
      })
      .catch((loadError) => {
        if (loadError?.name === 'AbortError') {
          return;
        }

        setQuantityKinds([]);
        setError(loadError?.message || 'Unable to load quantity kinds.');
        setStatus('');
      });

    return () => {
      abortController.abort();
    };
  }, [data.limit, data.offset]);

  useEffect(() => {
    if (visibleQuantityKinds.length === 0) {
      if (selectedQuantityKind) {
        selectQuantityKind(null);
      }

      return;
    }

    const selectedIsVisible = visibleQuantityKinds.some(
      (quantityKind) => quantityKind.qk === selectedQuantityKindKey,
    );

    if (!selectedIsVisible) {
      selectQuantityKind(visibleQuantityKinds[0]);
    }
  }, [selectQuantityKind, selectedQuantityKind, selectedQuantityKindKey, visibleQuantityKinds]);

  return (
    <div className={`quantity-kind-node${selected ? ' selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="quantity-kind-node__header">
        <p className="quantity-kind-node__title">{data.label}</p>
      </div>

      <input
        id={`quantity-kind-filter-${id}`}
        type="search"
        className="quantity-kind-node__filter-input nodrag"
        value={filterText}
        onChange={(event) => setFilterText(event.target.value)}
        aria-label="Filter quantity kinds"
        placeholder="Type to filter"
      />

      {status ? <p className="quantity-kind-node__status">{status}</p> : null}
      {error ? <p className="quantity-kind-node__error">{error}</p> : null}

      <div className="quantity-kind-node__results nowheel">
        {visibleQuantityKinds.length > 0 ? (
          <ul>
            {visibleQuantityKinds.map((quantityKind, index) => (
              <li key={`${quantityKind.qk}-${quantityKind.labelLanguage || index}`}>
                <button
                  type="button"
                  className={`quantity-kind-node__item-button nodrag${
                    quantityKind.qk === selectedQuantityKindKey ? ' selected' : ''
                  }`}
                  onClick={() => selectQuantityKind(quantityKind)}
                >
                  {capitalizeInitial(quantityKind.label) || 'Unnamed quantity kind'}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>No quantity kinds listed for this language.</p>
        )}
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
}
