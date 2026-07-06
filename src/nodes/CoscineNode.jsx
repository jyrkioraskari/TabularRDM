import { useCallback, useEffect, useMemo, useState } from 'react';
import coscineLogo from '../assets/coscine_rgb.svg';
import {
  fetchCoscineApplicationProfileDefinition,
  fetchCoscineResourceOptions,
  uploadROCrateToCoscine,
} from '../services/coscineApi';
import { createROCratePackage } from '../services/roCrateExport';
import NodeHandle from './NodeHandle';
import NodeInfoButton from './NodeInfoButton';

export default function CoscineNode({
  id,
  data,
  selected,
  onApplicationProfileLoaded,
}) {
  const [apiToken, setApiToken] = useState('');
  const [resources, setResources] = useState([]);
  const [selectedResourceKey, setSelectedResourceKey] = useState('');
  const [isLoadingResources, setIsLoadingResources] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const uploadMetadata = data.roCrateInput?.metadataContent?.trim() ?? '';
  const canBuildCrate = Boolean(data.roCrateInput?.jsonLdContent?.jsonLd?.trim());
  const hasUploadMetadata = Boolean(uploadMetadata);
  const selectedResource = useMemo(
    () => resources.find((resource) => resource.key === selectedResourceKey) ?? null,
    [resources, selectedResourceKey],
  );

  const handleLoadResources = useCallback(async () => {
    setIsLoadingResources(true);
    setError('');
    setStatus('Loading resources...');

    try {
      const resourceOptions = await fetchCoscineResourceOptions(apiToken);
      const options = resourceOptions.map((resource) => ({
        ...resource,
        key: `${resource.projectId}:${resource.resourceId}`,
      }));

      setResources(options);
      setSelectedResourceKey((currentKey) =>
        options.some((resource) => resource.key === currentKey)
          ? currentKey
          : options[0]?.key ?? '',
      );
      setStatus(
        options.length > 0
          ? `Loaded ${options.length} resource${options.length === 1 ? '' : 's'}.`
          : 'No writable resources found for this token.',
      );
    } catch (loadError) {
      setError(loadError.message || 'Could not load Coscine resources.');
      setStatus('');
    } finally {
      setIsLoadingResources(false);
    }
  }, [apiToken]);

  useEffect(() => {
    if (!selectedResource || !apiToken.trim()) {
      onApplicationProfileLoaded?.(id, null);
      return undefined;
    }

    let isActive = true;
    setIsLoadingProfile(true);
    setError('');
    setStatus('Loading Coscine form...');

    fetchCoscineApplicationProfileDefinition(
      apiToken,
      selectedResource.applicationProfileUri,
    )
      .then((profileDefinition) => {
        if (!isActive) {
          return;
        }

        onApplicationProfileLoaded?.(id, {
          ...profileDefinition,
          resourceId: selectedResource.resourceId,
          resourceName: selectedResource.resourceName,
          projectId: selectedResource.projectId,
          projectName: selectedResource.projectName,
        });
        setStatus(`Loaded form for ${selectedResource.resourceName}.`);
      })
      .catch((profileError) => {
        if (!isActive) {
          return;
        }

        onApplicationProfileLoaded?.(id, null);
        setError(profileError.message || 'Could not load the Coscine form.');
        setStatus('');
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingProfile(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [apiToken, id, onApplicationProfileLoaded, selectedResource]);

  const handleUpload = useCallback(async () => {
    setIsUploading(true);
    setError('');
    setStatus('Building RO-Crate...');

    try {
      const cratePackage = await createROCratePackage({
        jsonLdContent: data.roCrateInput?.jsonLdContent,
        sheets: data.roCrateInput?.sheets,
      });

      setStatus('Uploading RO-Crate...');
      await uploadROCrateToCoscine({
        apiToken,
        projectId: selectedResource?.projectId,
        resourceId: selectedResource?.resourceId,
        crateBlob: cratePackage.blob,
        fileName: cratePackage.fileName,
        metadataContent: uploadMetadata,
        profile: data.coscineApplicationProfile,
      });
      setStatus(`Uploaded ${cratePackage.fileName}.`);
    } catch (uploadError) {
      setError(uploadError.message || 'Could not upload the RO-Crate.');
      setStatus('');
    } finally {
      setIsUploading(false);
    }
  }, [apiToken, data.coscineApplicationProfile, data.roCrateInput, selectedResource, uploadMetadata]);

  const uploadDisabled =
    isUploading ||
    !apiToken.trim() ||
    !selectedResource ||
    !canBuildCrate ||
    !hasUploadMetadata;

  return (
    <div className={`coscine-node${selected ? ' selected' : ''}`}>
      <NodeHandle type="target" />
      <div className="coscine-node__header">
        <img src={coscineLogo} alt="" className="coscine-node__icon" />
        <p className="coscine-node__title">{data.label}</p>
      </div>
      <label className="coscine-node__label">
        API token
        <input
          className="coscine-node__input nodrag"
          type="password"
          value={apiToken}
          placeholder="Bearer token"
          autoComplete="off"
          onChange={(event) => setApiToken(event.target.value)}
        />
      </label>
      <button
        type="button"
        className="coscine-node__button nodrag"
        disabled={isLoadingResources || !apiToken.trim()}
        onClick={handleLoadResources}
      >
        {isLoadingResources ? 'Loading...' : 'Load resources'}
      </button>
      <label className="coscine-node__label">
        Resource
        <select
          className="coscine-node__select nodrag"
          value={selectedResourceKey}
          disabled={resources.length === 0}
          onChange={(event) => setSelectedResourceKey(event.target.value)}
        >
          <option value="">Select a resource</option>
          {resources.map((resource) => (
            <option key={resource.key} value={resource.key}>
              {resource.projectName} / {resource.resourceName}
              {resource.resourceType ? ` (${resource.resourceType})` : ''}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="coscine-node__button coscine-node__button--primary nodrag"
        disabled={uploadDisabled}
        onClick={handleUpload}
      >
        {isUploading ? 'Uploading...' : 'Upload RO-Crate'}
      </button>
      <p className="coscine-node__status">
        {status ||
          (isLoadingProfile
            ? 'Loading Coscine form...'
            : canBuildCrate
              ? hasUploadMetadata
                ? 'Ready to upload the RO-Crate resource.'
                : 'Save Coscine metadata before uploading.'
            : 'Connect an RO-Crate node to upload.')}
      </p>
      {error ? <p className="coscine-node__error">{error}</p> : null}
      <NodeInfoButton nodeType="coscine" language={data.language} />
      <NodeHandle type="source" />
    </div>
  );
}
