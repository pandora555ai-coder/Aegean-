import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LandingScreen from './screens/LandingScreen';
import HostScreen from './screens/HostScreen';
import ControllerScreen from './screens/ControllerScreen';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingScreen />} />
        <Route path="/host" element={<HostScreen />} />
        <Route path="/play" element={<ControllerScreen />} />
      </Routes>
    </BrowserRouter>
  );
}
