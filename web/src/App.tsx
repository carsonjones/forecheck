import { Navigate, Route, Routes } from 'react-router';
import { CmdK } from '@web/components/CmdK';
import { GamesRoute } from '@web/routes/GamesRoute';

export function App() {
  return (
    <>
      <CmdK />
      <Routes>
        <Route path="/" element={<Navigate to="/games" replace />} />
        <Route path="/games" element={<GamesRoute />} />
        <Route path="/games/:gameId" element={<GamesRoute />} />
        <Route path="*" element={<Navigate to="/games" replace />} />
      </Routes>
    </>
  );
}
