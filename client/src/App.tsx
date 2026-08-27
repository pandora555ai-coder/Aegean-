import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LandingScreen from './screens/LandingScreen';
import HostScreen from './screens/HostScreen';
import ControllerScreen from './screens/ControllerScreen';
import DevIndexScreen from './screens/DevIndexScreen';
import { DEV_ROUTES } from './devRoutes';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingScreen />} />
        <Route path="/host" element={<HostScreen />} />
        <Route path="/play" element={<ControllerScreen />} />
        {/* Dev-only test pages. The one list lives in devRoutes.tsx; /dev
            renders it as a link list and these <Route>s are generated from
            the same array, so a new dev page is added in exactly one place.
            Linked from the landing page as "Δοκιμές". */}
        <Route path="/dev" element={<DevIndexScreen />} />
        {DEV_ROUTES.map((r) => (
          <Route key={r.path} path={r.path} element={r.element} />
        ))}
      </Routes>
    </BrowserRouter>
  );
}
