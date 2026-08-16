import { Navigate, Route, Routes } from 'react-router';
import { CmdK } from '@web/components/CmdK';
import { GamesRoute } from '@web/routes/GamesRoute';
import { PlayersRoute } from '@web/routes/PlayersRoute';
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
