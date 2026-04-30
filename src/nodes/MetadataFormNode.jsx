import { useEffect, useRef, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import '@ulb-darmstadt/shacl-form';
import { fetchDefaultMetadataShapes } from '../services/metadataShapesService';
import metadataFormIcon from '../assets/Architetto_--_Formulario.svg';

const defaultMetadataValuesSubject = 'https://example.org/datasets/ro-kit';
const defaultMetadataValues = `@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix dcterms: <http://purl.org/dc/terms/> .

<${defaultMetadataValuesSubject}>
  a dcat:Dataset ;
  dcterms:conformsTo <https://w3id.org/nfdi4ing/profiles/4a5d4526-34d4-4b00-8f8f-4b13dd48e6d6> ;
  dcterms:title "RO-kit dataset"@en .
`;

export default function MetadataFormNode({ id, data, selected, onRdfChange }) {
  const formRef = useRef(null);
  const [isValid, setIsValid] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const [defaultShapes, setDefaultShapes] = useState('');
  const [shapesError, setShapesError] = useState('');
  const shapes = data.shapes || defaultShapes;
  const formKey = data.shapesKey || (data.shapes ? `profile-${data.profileBaseUri}` : 'default');
  const initialValues = data.shapes ? undefined : defaultMetadataValues;
  const initialValuesSubject = data.shapes ? undefined : defaultMetadataValuesSubject;

  useEffect(() => {
    if (data.shapes) {
      return undefined;
    }

    let isActive = true;
    setShapesError('');

    fetchDefaultMetadataShapes()
      .then((loadedShapes) => {
        if (isActive) {
          setDefaultShapes(loadedShapes);
        }
      })
      .catch((error) => {
        if (isActive) {
          setShapesError(error.message || 'Unable to load metadata shapes.');
        }
      });

    return () => {
      isActive = false;
    };
  }, [data.shapes]);

  useEffect(() => {
    const formElement = formRef.current;

    if (!shapes || !formElement) {
      return undefined;
    }

    const onFormChange = (event) => {
      const valid = Boolean(event?.detail?.valid);
      setIsValid(valid);
      setHasSaved(false);

      if (!valid) {
        onRdfChange?.(id, '');
      }
    };

    const onFormSubmit = (event) => {
      event.preventDefault();

      if (typeof formElement.serialize !== 'function') {
        return;
      }

      const nextSerializedRdf = formElement.serialize();
      setIsValid(true);
      setHasSaved(true);
      onRdfChange?.(id, nextSerializedRdf);
    };

    formElement.addEventListener('change', onFormChange);
    formElement.addEventListener('submit', onFormSubmit);
    return () => {
      formElement.removeEventListener('change', onFormChange);
      formElement.removeEventListener('submit', onFormSubmit);
    };
  }, [formKey, id, onRdfChange, shapes]);

  useEffect(() => {
    setIsValid(false);
    setHasSaved(false);
    onRdfChange?.(id, '');
  }, [formKey, id, onRdfChange, shapes]);

  return (
    <div className={`metadata-form-node${selected ? ' selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="metadata-form-node__header">
        <img src={metadataFormIcon} alt="" className="metadata-form-node__icon" />
        <p className="metadata-form-node__title">{data.label}</p>
      </div>

      <div className="metadata-form-node__form-wrap">
        {shapes ? (
          <shacl-form
            key={formKey}
            ref={formRef}
            data-shapes={shapes}
            data-values={initialValues}
            data-values-subject={initialValuesSubject}
            data-submit-button="Save"
            data-show-root-shape-label=""
          />
        ) : (
          <p className="metadata-form-node__loading">
            {shapesError || 'Loading metadata form...'}
          </p>
        )}
      </div>

      <p className="metadata-form-node__status">
        {hasSaved ? 'Metadata saved' : isValid ? 'Metadata is valid' : 'Metadata not valid yet'}
      </p>

      <Handle type="source" position={Position.Right} />
    </div>
  );
}
