import { AUDIO_BITRATE_KBPS } from '@game/shared';

// Small provider interface so the TTS backend is swappable later without
// touching the generation script itself.
export interface VoiceProvider {
  synthesize(text: string): Promise<Buffer>;
}

// Mono, compressed MP3 straight from the API - no local re-encoding needed.
// The bitrate is shared with the server (Task 42b uses it to estimate a
// clip's duration from its file size) so it can't silently drift.
const OUTPUT_FORMAT = `mp3_44100_${AUDIO_BITRATE_KBPS}`;
const MODEL_ID = 'eleven_multilingual_v2'; // lines are Greek

export function createElevenLabsProvider(): VoiceProvider {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) {
    throw new Error(
      'Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID (e.g. in a repo-root .env file, gitignored) before generating voice lines.',
    );
  }

  return {
    async synthesize(text: string): Promise<Buffer> {
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${OUTPUT_FORMAT}`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text, model_id: MODEL_ID }),
        },
      );
      if (!res.ok) {
        throw new Error(`ElevenLabs request failed (${res.status}): ${await res.text()}`);
      }
      return Buffer.from(await res.arrayBuffer());
    },
  };
}
