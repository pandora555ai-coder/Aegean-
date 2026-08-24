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

export function createElevenLabsProvider(): VoiceProvider {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  const modelId = process.env.ELEVENLABS_MODEL_ID;
  if (!apiKey || !voiceId || !modelId) {
    throw new Error(
      'Set ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID and ELEVENLABS_MODEL_ID (e.g. in a repo-root .env file, ' +
        'gitignored) before generating voice lines.',
    );
  }

  return {
    async synthesize(text: string): Promise<Buffer> {
      // Task 43: no `style` field, ever. eleven_v3 - the model this was
      // written against, needed for the "[tag]" emotion/non-verbal syntax
      // in `text` - reports can_use_style: false; sending one anyway is
      // either rejected or silently ignored depending on the model, so the
      // request body only ever carries what every model accepts.
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${OUTPUT_FORMAT}`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text, model_id: modelId }),
        },
      );
      if (!res.ok) {
        throw new Error(`ElevenLabs request failed (${res.status}): ${await res.text()}`);
      }
      return Buffer.from(await res.arrayBuffer());
    },
  };
}
