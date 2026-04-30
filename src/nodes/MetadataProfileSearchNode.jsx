import { useCallback, useEffect, useRef, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  DEFAULT_PROFILE_QUERY,
  fetchAimsApplicationProfiles,
  getProfileBaseUri,
} from '../services/aimsApi';
import aimsIcon from '../assets/aims.png';

const SEARCH_DEBOUNCE_MS = 400;

export default function MetadataProfileSearchNode({ id, data, selected, onProfileSelect }) {
  const abortControllerRef = useRef(null);
  const hasQueuedInitialSearchRef = useRef(false);
  const initialSearchText = data.defaultQuery ?? DEFAULT_PROFILE_QUERY;
  const [searchText, setSearchText] = useState(initialSearchText);
  const [profiles, setProfiles] = useState([]);
  const [status, setStatus] = useState(
    initialSearchText.trim() ? 'Searching...' : 'Enter a search string.',
  );
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedProfileBaseUri, setSelectedProfileBaseUri] = useState('');
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  const runSearch = useCallback(async (query) => {
    const trimmedQuery = query.trim();

    abortControllerRef.current?.abort();

    if (!trimmedQuery) {
      setProfiles([]);
      setError('');
      setStatus('Enter a search string.');
      setIsLoading(false);
      return;
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsLoading(true);
    setError('');
    setStatus('Searching...');

    try {
      const nextProfiles = await fetchAimsApplicationProfiles({
        query: trimmedQuery,
        signal: abortController.signal,
      });

      setProfiles(nextProfiles);
      setStatus(
        nextProfiles.length === 1
          ? '1 metadata profile found.'
          : `${nextProfiles.length} metadata profiles found.`,
      );
    } catch (searchError) {
      if (searchError?.name === 'AbortError') {
        return;
      }

      setProfiles([]);
      setError(searchError?.message || 'Unable to search metadata profiles.');
      setStatus('');
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
        setIsLoading(false);
      }
    }
  }, []);

  const handleSubmit = useCallback(
    (event) => {
      event.preventDefault();
      runSearch(searchText);
    },
    [runSearch, searchText],
  );

  const handleProfileSelect = useCallback(
    async (profile) => {
      const baseUri = getProfileBaseUri(profile);

      setSelectedProfileBaseUri(baseUri);
      setIsLoadingProfile(true);
      setError('');

      try {
        await onProfileSelect?.(id, profile);
      } catch (selectError) {
        setError(selectError?.message || 'Unable to load selected metadata profile.');
      } finally {
        setIsLoadingProfile(false);
      }
    },
    [id, onProfileSelect],
  );

  useEffect(
    () => () => {
      abortControllerRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    const trimmedQuery = searchText.trim();

    if (!trimmedQuery) {
      abortControllerRef.current?.abort();
      setProfiles([]);
      setError('');
      setStatus('Enter a search string.');
      setIsLoading(false);
      return undefined;
    }

    const delay = hasQueuedInitialSearchRef.current ? SEARCH_DEBOUNCE_MS : 0;
    hasQueuedInitialSearchRef.current = true;

    const timeoutId = window.setTimeout(() => {
      runSearch(trimmedQuery);
    }, delay);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [runSearch, searchText]);

  return (
    <div className={`profile-search-node${selected ? ' selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="profile-search-node__header">
        <img src={aimsIcon} alt="" className="profile-search-node__icon" />
        <p className="profile-search-node__title">{data.label}</p>
      </div>

      <form className="profile-search-node__form nodrag nopan" onSubmit={handleSubmit}>
        <label className="profile-search-node__label" htmlFor={`profile-search-${id}`}>
          Search string
        </label>
        <div className="profile-search-node__controls">
          <input
            id={`profile-search-${id}`}
            type="search"
            className="profile-search-node__input"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="RO-kit"
          />
          <button
            type="submit"
            className="profile-search-node__button"
            disabled={isLoading}
          >
            {isLoading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </form>

      {status ? <p className="profile-search-node__status">{status}</p> : null}
      {error ? <p className="profile-search-node__error">{error}</p> : null}

      <div className="profile-search-node__results nowheel">
        {profiles.length > 0 ? (
          <ul>
            {profiles.map((profile, index) => {
              const baseUri = getProfileBaseUri(profile);
              const isSelected = baseUri && baseUri === selectedProfileBaseUri;

              return (
                <li key={`${profile.name || 'profile'}-${baseUri || index}`}>
                  <button
                    type="button"
                    className={`profile-search-node__result-button${
                      isSelected ? ' selected' : ''
                    }`}
                    disabled={isLoadingProfile}
                    title={baseUri || undefined}
                    onClick={() => handleProfileSelect(profile)}
                  >
                    {profile.name || 'Unnamed metadata profile'}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p>No metadata profiles listed yet.</p>
        )}
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
}
