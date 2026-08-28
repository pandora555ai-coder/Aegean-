import { type ReactElement } from 'react';
import DevDrawScreen from './screens/DevDrawScreen';
import DevNumericScreen from './screens/DevNumericScreen';
import DevBlitzScreen from './screens/DevBlitzScreen';
import DevSceneScreen from './screens/DevSceneScreen';

export interface DevRoute {
  path: string;
  title: string;
  description: string; // one line, shown under the title on /dev
  element: ReactElement;
}

// THE list of dev routes. App.tsx builds its <Route> elements straight from
// this array and /dev renders the same array as a link list, so adding an
// entry here makes the page reachable AND makes it appear on /dev - there is
// no second list to keep in sync.
export const DEV_ROUTES: DevRoute[] = [
  {
    path: '/dev/draw',
    title: 'Ζωγραφική',
    description: 'Canvas test route — tools, colour wheel, export (Task 53).',
    element: <DevDrawScreen />,
  },
  {
    path: '/dev/numeric',
    title: 'Αριθμητικές',
    description: 'Content review for the numeric-estimate question pool (Task 67).',
    element: <DevNumericScreen />,
  },
  {
    path: '/dev/blitz',
    title: 'Blitz',
    description: 'Solo swipe minigame — all state local, no server (Task 69).',
    element: <DevBlitzScreen />,
  },
  {
    path: '/dev/scene',
    title: 'Σκηνή',
    description: 'Step through every /host phase with fake data — real views, real SceneLayer, no server (Task 106).',
    element: <DevSceneScreen />,
  },
];
