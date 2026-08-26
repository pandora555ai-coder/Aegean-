import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LandingScreen from './screens/LandingScreen';
import HostScreen from './screens/HostScreen';
import ControllerScreen from './screens/ControllerScreen';
import DevDrawScreen from './screens/DevDrawScreen';
import DevNumericScreen from './screens/DevNumericScreen';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingScreen />} />
        <Route path="/host" element={<HostScreen />} />
        <Route path="/play" element={<ControllerScreen />} />
        {/* Task 53 - dev-only, linked from nowhere. Open it directly on a phone. */}
        <Route path="/dev/draw" element={<DevDrawScreen />} />
        {/* Task 67 - dev-only, linked from nowhere. Content review for the
            numeric-estimate question pool before it ships. */}
        <Route path="/dev/numeric" element={<DevNumericScreen />} />
      </Routes>
    </BrowserRouter>
  );
}
