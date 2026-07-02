/**
 * Node that loads connected Turtle RDF into rdfstore-js. It reports triple
 * counts, previews the loaded RDF, and provides a metadata.ttl download.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import rdfstoreScriptUrl from 'rdfstore/dist/rdfstore.js?url';
import rdfLogo from '../assets/250px-Rdf_logo.svg.png';
import NodeHandle from './NodeHandle';
import NodeInfoButton from './NodeInfoButton';

let rdfstoreScriptPromise = null;

function loadRdfstoreScript() {
  if (window.rdfstore) {
    return Promise.resolve(window.rdfstore);
  }

  if (rdfstoreScriptPromise) {
    return rdfstoreScriptPromise;
  }

  rdfstoreScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = rdfstoreScriptUrl;
    script.async = true;
    script.onload = () => {
      if (window.rdfstore) {
        resolve(window.rdfstore);
        return;
      }

      reject(new Error('Rdfstore-js loaded without exposing window.rdfstore.'));
    };
    script.onerror = () => {
      reject(new Error('Unable to load the Rdfstore-js browser bundle.'));
    };

    document.head.appendChild(script);
  });

  return rdfstoreScriptPromise;
}

async function createRdfStore() {
  const rdfstore = await loadRdfstoreScript();

  return new Promise((resolve, reject) => {
    rdfstore.create((error, store) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(store);
    });
  });
}

function clearStore(store) {
  return new Promise((resolve, reject) => {
    store.clear((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function loadRdf(store, mediaType, content) {
  return new Promise((resolve, reject) => {
    store.load(mediaType, content, (error, tripleCount) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(tripleCount ?? 0);
    });
  });
}

export default function RDFStoreNode({ data, selected }) {
  const storeRef = useRef(null);
  const lastLoadedInputRef = useRef('');
  const [status, setStatus] = useState('Starting RDF store...');
  const [error, setError] = useState('');
  const [storeReady, setStoreReady] = useState(false);
  const [tripleCount, setTripleCount] = useState(0);
  const [loadedTurtle, setLoadedTurtle] = useState('');
  const connectedInput = data.rdfInput || '';

  useEffect(() => {
    let isActive = true;

    createRdfStore()
      .then((store) => {
        if (!isActive) {
          return;
        }

        storeRef.current = store;
        setStoreReady(true);
        setStatus('RDF store ready.');
      })
      .catch((storeError) => {
        if (isActive) {
          setError(storeError?.message || 'Unable to start RDF store.');
          setStatus('');
        }
      });

    return () => {
      isActive = false;
      storeRef.current = null;
    };
  }, []);

  const loadRdfText = useCallback(async (content) => {
    const trimmedRdf = content.trim();

    if (!storeRef.current) {
      setError('RDF store is not ready yet.');
      return;
    }

    if (!trimmedRdf) {
      setError('');
      setTripleCount(0);
      setLoadedTurtle('');
      setStatus('Waiting for RDF from a connected node.');
      return;
    }

    setStatus('Loading RDF...');
    setError('');

    try {
      await clearStore(storeRef.current);
      const loadedTripleCount = await loadRdf(storeRef.current, 'text/turtle', trimmedRdf);
      lastLoadedInputRef.current = content;
      setTripleCount(loadedTripleCount);
      setLoadedTurtle(trimmedRdf);
      setStatus(`Loaded ${loadedTripleCount} triple${loadedTripleCount === 1 ? '' : 's'}.`);
    } catch (loadError) {
      setTripleCount(0);
      setLoadedTurtle('');
      setError(loadError?.message || 'Unable to load RDF content.');
      setStatus('');
    }
  }, []);

  useEffect(() => {
    if (!connectedInput || connectedInput === lastLoadedInputRef.current) {
      return;
    }

    if (storeReady) {
      loadRdfText(connectedInput);
    }
  }, [connectedInput, loadRdfText, storeReady]);

  const downloadTurtle = useCallback(() => {
    if (!loadedTurtle) {
      return;
    }

    const blob = new Blob([loadedTurtle], { type: 'text/turtle;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = 'metadata.ttl';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [loadedTurtle]);

  return (
    <div className={`rdf-node${selected ? ' selected' : ''}`}>
      <NodeHandle type="target" />
      <div className="rdf-node__header">
        <img src={rdfLogo} alt="" className="rdf-node__icon" />
        <p className="rdf-node__title">{data.label}</p>
      </div>
      <p className="rdf-node__count">{tripleCount} triples in store</p>
      <button
        type="button"
        className="rdf-node__button nodrag"
        disabled={!loadedTurtle}
        onClick={downloadTurtle}
      >
        Download Turtle
      </button>
      <div className="rdf-node__preview">
        <p className="rdf-node__preview-title">Turtle Preview</p>
        {loadedTurtle ? (
          <pre className="rdf-node__preview-content nowheel">{loadedTurtle}</pre>
        ) : (
          <p className="rdf-node__preview-empty">No Turtle content loaded yet.</p>
        )}
      </div>
      {!connectedInput ? (
        <p className="rdf-node__status">Connect an RDF-producing node and press Save.</p>
      ) : null}
      {status ? <p className="rdf-node__status">{status}</p> : null}
      {error ? <p className="rdf-node__error">{error}</p> : null}
      <NodeInfoButton nodeType="rdfStore" language={data.language} />
      <NodeHandle type="source" />
    </div>
  );
}
