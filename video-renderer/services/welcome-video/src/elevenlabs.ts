import { getEnv } from "./env";

type SynthesizeSpeechInput = {
  voiceId: string;
  text: string;
};

export const synthesizeSpeech = async ({
  voiceId,
  text,
}: SynthesizeSpeechInput): Promise<Buffer> => {
  const env = getEnv();

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": env.elevenLabsApiKey,
        "content-type": "application/json",
        accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: env.elevenLabsModelId,
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `ElevenLabs request failed (${response.status} ${response.statusText}): ${body}`,
    );
  }

  return Buffer.from(await response.arrayBuffer());
};
