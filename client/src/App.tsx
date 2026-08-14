import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HostScreen from './screens/HostScreen';
import ControllerScreen from './screens/ControllerScreen';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HostScreen />} />
        <Route path="/play" element={<ControllerScreen />} />
      </Routes>
    </BrowserRouter>
  );
}
