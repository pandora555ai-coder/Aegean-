import { type ReactElement } from 'react';
import DevDrawScreen from './screens/DevDrawScreen';
import DevNumericScreen from './screens/DevNumericScreen';
import DevBlitzScreen from './screens/DevBlitzScreen';
import DevSceneScreen from './screens/DevSceneScreen';
import DevVoiceScreen from './screens/DevVoiceScreen';
import DevVoiceMatrixScreen from './screens/DevVoiceMatrixScreen';
import DevVoiceEqScreen from './screens/DevVoiceEqScreen';
import DevVoiceAbScreen from './screens/DevVoiceAbScreen';
import DevCrowdScreen from './screens/DevCrowdScreen';

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
    description: 'Step through every /host phase with fake data — real views, real TheatreScene, no server (Task 106).',
    element: <DevSceneScreen />,
  },
  {
    path: '/dev/voice',
    title: 'Φωνή Σωκράτη',
    description: 'Rate every Socrates voice line before an ElevenLabs batch (Task 142).',
    element: <DevVoiceScreen />,
  },
  {
    path: '/dev/voice-matrix',
    title: 'Βαθύτερος Σωκράτης',
    description: 'A/B listening for the older/deeper Socrates DSP experiment (Task 144).',
    element: <DevVoiceMatrixScreen />,
  },
  {
    path: '/dev/voice-eq',
    title: 'Σωκράτης EQ',
    description: 'A/B listening for the EQ/dynamics-only (no pitch shift) Socrates experiment (Task 145).',
    element: <DevVoiceEqScreen />,
  },
  {
    path: '/dev/voice-ab',
    title: 'Νέα φωνή',
    description: 'A/B listening for the new ElevenLabs voice ID against the 43 GENIUS-rated lines (Task 147).',
    element: <DevVoiceAbScreen />,
  },
  {
    path: '/dev/crowd',
    title: 'Πλήθος',
    description: 'Listening page for the crowd sound set — three loops crossfaded by intensity, four one-shots (Task 36a).',
    element: <DevCrowdScreen />,
  },
];
