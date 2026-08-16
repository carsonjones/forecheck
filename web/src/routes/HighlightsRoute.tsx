import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { fetchHighlights, fetchPlayer, fetchPlayers, fetchTeams } from '@web/api';
import { HighlightCard } from '@web/components/HighlightCard';
import { Layout } from '@web/components/Layout';
import type { HighlightFilters } from '@web/types';

const currentYear = new Date().getFullYear();
const seasons = Array.from(new Set(['20242025', ...Array.from({ length: 8 }, (_, index) => `${currentYear - index}${currentYear - index + 1}`)])).sort().reverse();
const seasonLabel = (season: string) => `${season.slice(0, 4)}–${season.slice(4)}`;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

export function HighlightsRoute() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const filters: HighlightFilters = {
    season: searchParams.get('season') ?? '',
    team: searchParams.get('team') ?? '',
    player: searchParams.get('player') ?? '',
  };
  const [playerSearch, setPlayerSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [autoplayNext, setAutoplayNext] = useState(true);
  const articleRefs = useRef<Array<HTMLElement | null>>([]);
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([]);

  const highlightsQuery = useInfiniteQuery({
    queryKey: ['highlights', filters.season, filters.team, filters.player],
    queryFn: ({ pageParam }) => fetchHighlights(filters, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });
  const teamsQuery = useQuery({ queryKey: ['teams'], queryFn: fetchTeams });
  const selectedPlayerQuery = useQuery({ queryKey: ['player', filters.player], queryFn: () => fetchPlayer(filters.player), enabled: Boolean(filters.player) });
  const playerSuggestions = useQuery({
    queryKey: ['highlight-player-search', playerSearch.trim()],
    queryFn: () => fetchPlayers({ query: playerSearch.trim(), team: '', position: '' }),
    enabled: playerSearch.trim().length >= 2,
  });
  const highlights = highlightsQuery.data?.pages.flatMap((page) => page.results) ?? [];

  const updateFilters = (next: HighlightFilters) => {
    const params = new URLSearchParams();
    if (next.season) params.set('season', next.season);
    if (next.team) params.set('team', next.team);
    if (next.player) params.set('player', next.player);
    navigate(`/highlights${params.size ? `?${params}` : ''}`);
  };

  const selectClip = (index: number) => {
    setActiveIndex(index);
    articleRefs.current[index]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  const playClip = (index: number) => {
    selectClip(index);
    window.setTimeout(() => { void videoRefs.current[index]?.play(); }, 0);
  };

  const playNext = async (index: number) => {
    if (!autoplayNext) return;
    let nextHighlights = highlights;
    if (index + 1 >= nextHighlights.length && highlightsQuery.hasNextPage) {
      const result = await highlightsQuery.fetchNextPage();
      nextHighlights = result.data?.pages.flatMap((page) => page.results) ?? nextHighlights;
    }
    if (index + 1 < nextHighlights.length) playClip(index + 1);
  };

  useEffect(() => {
    setActiveIndex(0);
    articleRefs.current = [];
    videoRefs.current = [];
  }, [filters.season, filters.team, filters.player]);

  useEffect(() => {
    if (activeIndex < highlights.length) return;
    setActiveIndex(Math.max(0, highlights.length - 1));
  }, [activeIndex, highlights.length]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.metaKey || event.ctrlKey || event.altKey || target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA', 'VIDEO'].includes(target.tagName)) return;
      if (event.key === 'j' || event.key === 'k') {
        event.preventDefault();
        const next = Math.min(Math.max(activeIndex + (event.key === 'j' ? 1 : -1), 0), highlights.length - 1);
        selectClip(next);
      }
      if (event.key === ' ' && highlights.length) {
        event.preventDefault();
        const video = videoRefs.current[activeIndex];
        if (!video) return;
        if (video.paused) void video.play(); else video.pause();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeIndex, highlights.length]);

  const selectedPlayerName = selectedPlayerQuery.data ? `${selectedPlayerQuery.data.first_name} ${selectedPlayerQuery.data.last_name}` : filters.player ? `Player #${filters.player}` : '';

  return (
    <Layout
      header={<><strong>FORECHECK</strong><span>Highlight reel</span></>}
      footer={<><button className="brand-button" onClick={() => window.dispatchEvent(new Event('open-cmdk'))}>● forecheck</button><span><kbd>j/k</kbd> select · <kbd>space</kbd> play/pause · <kbd>⌘K</kbd> menu</span></>}
    >
      <section className="pane browser-pane">
        <div className="browser-controls">
          <label><span>Season</span><select value={filters.season} onChange={(event) => updateFilters({ ...filters, season: event.target.value })}><option value="">All seasons</option>{seasons.map((season) => <option key={season} value={season}>{seasonLabel(season)}</option>)}</select></label>
          <label><span>Team</span><select value={filters.team} onChange={(event) => updateFilters({ ...filters, team: event.target.value })}><option value="">All teams</option>{teamsQuery.data?.map((team) => <option key={team.id} value={team.id}>{team.abbreviation}</option>)}</select></label>
          <div className="player-picker">
            <label><span>Player</span><input type="search" value={playerSearch} placeholder={selectedPlayerName || 'Search scorer'} onChange={(event) => setPlayerSearch(event.target.value)} /></label>
            {playerSearch.trim().length >= 2 && <div className="player-suggestions">{playerSuggestions.isPending && <span>Searching…</span>}{playerSuggestions.data?.slice(0, 8).map((player) => <button key={player.id} onClick={() => { updateFilters({ ...filters, player: String(player.id) }); setPlayerSearch(''); }}>{player.first_name} {player.last_name}</button>)}{playerSuggestions.isSuccess && playerSuggestions.data.length === 0 && <span>No players found.</span>}</div>}
          </div>
          <label className="check-control"><input type="checkbox" checked={autoplayNext} onChange={(event) => setAutoplayNext(event.target.checked)} /><span>Autoplay next</span></label>
          {(filters.season || filters.team || filters.player) && <button className="text-button browser-clear" onClick={() => { updateFilters({ season: '', team: '', player: '' }); setPlayerSearch(''); }}>clear filters</button>}
          {filters.player && <button className="filter-chip" onClick={() => updateFilters({ ...filters, player: '' })}>{selectedPlayerName} ×</button>}
        </div>
        <div className="pane-meta"><span>Latest goal clips</span><span>{highlights.length}{highlightsQuery.hasNextPage ? '+' : ''}</span></div>
        <div className="browser-scroll">
          {highlightsQuery.isPending && <p className="empty-state">Loading highlights…</p>}
          {highlightsQuery.isError && <p className="empty-state error">{errorMessage(highlightsQuery.error)}</p>}
          {highlightsQuery.isSuccess && highlights.length === 0 && <p className="empty-state">No highlights match these filters.</p>}
          <div className="clip-grid browser-grid">{highlights.map((highlight, index) => <HighlightCard key={highlight.id} highlight={highlight} active={index === activeIndex} articleRef={(node) => { articleRefs.current[index] = node; }} videoRef={(node) => { videoRefs.current[index] = node; }} onSelect={() => setActiveIndex(index)} onEnded={() => { void playNext(index); }} />)}</div>
          {highlightsQuery.hasNextPage && <button className="load-more" disabled={highlightsQuery.isFetchingNextPage} onClick={() => { void highlightsQuery.fetchNextPage(); }}>{highlightsQuery.isFetchingNextPage ? 'Loading…' : 'Load more clips'}</button>}
        </div>
      </section>
    </Layout>
  );
}
