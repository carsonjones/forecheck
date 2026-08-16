import { Navigate, Route, Routes } from 'react-router';
import { CmdK } from '@web/components/CmdK';
import { GamesRoute } from '@web/routes/GamesRoute';
import { HighlightsRoute } from '@web/routes/HighlightsRoute';
import { PlayersRoute } from '@web/routes/PlayersRoute';
import { SearchRoute } from '@web/routes/SearchRoute';
import { TeamsRoute } from '@web/routes/TeamsRoute';
import { WarRoute } from '@web/routes/WarRoute';

export function App() {
  return (
    <>
      <CmdK />
      <Routes>
        <Route path="/" element={<Navigate to="/games" replace />} />
        <Route path="/games" element={<GamesRoute />} />
        <Route path="/games/:gameId" element={<GamesRoute />} />
        <Route path="/highlights" element={<HighlightsRoute />} />
        <Route path="/search" element={<SearchRoute />} />
        <Route path="/players" element={<PlayersRoute />} />
        <Route path="/players/:playerId" element={<PlayersRoute />} />
        <Route path="/war" element={<WarRoute />} />
        <Route path="/teams" element={<TeamsRoute />} />
        <Route path="/teams/:teamId" element={<TeamsRoute />} />
        <Route path="*" element={<Navigate to="/games" replace />} />
      </Routes>
    </>
  );
}
