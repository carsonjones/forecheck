import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { searchTranscripts } from '@web/api';
import { HighlightCard } from '@web/components/HighlightCard';
import { Layout } from '@web/components/Layout';
import { teamAbbreviation } from '@web/teams';
import type { TranscriptSearchMode, TranscriptSearchResult } from '@web/types';

const modes: Array<{ value: TranscriptSearchMode; label: string }> = [
  { value: 'keyword', label: 'Keyword' },
  { value: 'semantic', label: 'Semantic' },
  { value: 'hybrid', label: 'Hybrid' },
];
const resultId = (result: TranscriptSearchResult) => `${result.game_id}:${result.event_id}`;
const snippet = (text: string | null) => {
  if (!text) return 'No transcript text.';
  return text.length > 260 ? `${text.slice(0, 257).trimEnd()}…` : text;
};
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

export function SearchRoute() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q')?.trim() ?? '';
  const requestedMode = searchParams.get('mode');
  const mode: TranscriptSearchMode = requestedMode === 'semantic' || requestedMode === 'hybrid' ? requestedMode : 'keyword';
  const selectedId = searchParams.get('clip');
  const [draft, setDraft] = useState(query);
  const selectedVideo = useRef<HTMLVideoElement>(null);

  useEffect(() => setDraft(query), [query]);
  useEffect(() => {
    if (selectedId) selectedVideo.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedId]);

  const searchQuery = useQuery({
    queryKey: ['transcript-search', query, mode],
    queryFn: () => searchTranscripts(query, mode),
    enabled: Boolean(query),
    retry: false,
  });
  const results = searchQuery.data?.results ?? [];
  const selected = results.find((result) => resultId(result) === selectedId) ?? results[0];

  const navigateSearch = (nextQuery: string, nextMode: TranscriptSearchMode, clip?: string) => {
    const params = new URLSearchParams();
    if (nextQuery) params.set('q', nextQuery);
    params.set('mode', nextMode);
    if (clip) params.set('clip', clip);
    navigate(`/search?${params}`);
  };

  useEffect(() => {
    if (!results.length || selectedId) return;
    navigateSearch(query, mode, resultId(results[0]!));
  }, [mode, query, results, selectedId]);

  const selectResult = (result: TranscriptSearchResult) => {
    navigateSearch(query, mode, resultId(result));
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.metaKey || event.ctrlKey || event.altKey || target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA', 'VIDEO'].includes(target.tagName) || !['j', 'k'].includes(event.key) || !results.length) return;
      event.preventDefault();
      const current = Math.max(0, results.findIndex((result) => resultId(result) === resultId(selected ?? results[0]!)));
      const next = Math.min(Math.max(current + (event.key === 'j' ? 1 : -1), 0), results.length - 1);
      selectResult(results[next]!);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, query, results, selected]);

  return (
    <Layout
      header={<><strong>FORECHECK</strong><span>Transcript search</span></>}
      footer={<><button className="brand-button" onClick={() => window.dispatchEvent(new Event('open-cmdk'))}>● forecheck</button><span><kbd>j/k</kbd> select result · <kbd>⌘K</kbd> menu</span></>}
    >
      <section className="pane search-pane">
        <form className="search-controls" onSubmit={(event) => { event.preventDefault(); navigateSearch(draft.trim(), mode); }}>
          <label><span>Search transcripts</span><input autoFocus type="search" value={draft} placeholder='Try “top shelf” or “goalie screened”' onChange={(event) => setDraft(event.target.value)} /></label>
          <button type="submit" disabled={!draft.trim()}>Search</button>
          <div className="mode-toggle" role="group" aria-label="Search mode">{modes.map((item) => <button key={item.value} type="button" className={mode === item.value ? 'active' : ''} aria-pressed={mode === item.value} onClick={() => navigateSearch(query, item.value)}>{item.label}</button>)}</div>
        </form>
        <div className="search-body">
          <aside className="search-results">
            <div className="pane-meta"><span>{query ? `Results · ${mode}` : 'Results'}</span><span>{searchQuery.isSuccess ? results.length : '—'}</span></div>
            {!query && <p className="empty-state">Search what announcers said to find the matching goal clip.</p>}
            {searchQuery.isPending && query && <p className="empty-state">Searching transcripts…</p>}
            {searchQuery.isError && <div className="inline-notice" role="status"><strong>{mode === 'keyword' ? 'Search unavailable' : `${modes.find((item) => item.value === mode)?.label} search unavailable`}</strong><p>{errorMessage(searchQuery.error)}</p>{mode !== 'keyword' && <button onClick={() => navigateSearch(query, 'keyword')}>Try keyword search</button>}</div>}
            {searchQuery.isSuccess && results.length === 0 && <p className="empty-state">No transcript matches.</p>}
            <div className="result-list">{results.map((result) => {
              const id = resultId(result);
              const scorer = [result.first_name, result.last_name].filter(Boolean).join(' ') || 'Goal highlight';
              return <button key={id} className={id === resultId(selected ?? result) ? 'search-result active' : 'search-result'} onClick={() => selectResult(result)}><span><strong>{scorer}</strong><small>{teamAbbreviation(result.away_team_id)} @ {teamAbbreviation(result.home_team_id)} · {result.game_date}</small></span><p>{snippet(result.transcript)}</p></button>;
            })}</div>
          </aside>
          <section className="search-detail">
            {!selected && <p className="empty-state">Select a result to view its clip.</p>}
            {selected && <div className="search-clip"><div className="section-heading"><h2>Matched clip</h2><span>{teamAbbreviation(selected.team_id)} · P{selected.period} {selected.time_in_period}</span></div><HighlightCard key={resultId(selected)} highlight={selected} active videoRef={selectedVideo} /></div>}
          </section>
        </div>
      </section>
    </Layout>
  );
}
