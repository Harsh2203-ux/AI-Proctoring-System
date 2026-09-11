/**
 * Demo-mode AI analysis — replaces real face detection AI.
 * Generates plausible but simulated proctoring results.
 */

interface DemoFrameResult {
  face_count: number;
  identity: { is_match: boolean; confidence: number };
  pose: { yaw: number; pitch: number };
  gaze: { looking_away: boolean; confidence: number };
  objects: unknown[];
  demo: boolean;
}

interface DemoAudioResult {
  transcript: string;
  speaker_count: number;
  suspicious_speech: boolean;
  matched_keywords: string[];
  background_conversation: boolean;
  demo: boolean;
}

export function analyseFrameDemo(_imageB64: string): DemoFrameResult {
  // Mostly-normal results with occasional anomaly
  const rand = Math.random();
  return {
    face_count: rand < 0.05 ? 0 : rand < 0.08 ? 2 : 1,
    identity: {
      is_match: rand > 0.02,
      confidence: 0.75 + Math.random() * 0.2,
    },
    pose: {
      yaw:   (Math.random() - 0.5) * 20,
      pitch: (Math.random() - 0.5) * 15,
    },
    gaze: {
      looking_away: rand < 0.06,
      confidence: 0.7 + Math.random() * 0.2,
    },
    objects: [],
    demo: true,
  };
}

export function analyseAudioDemo(_audioB64: string): DemoAudioResult {
  const rand = Math.random();
  return {
    transcript: rand < 0.1 ? 'Can you help me with the answer?' : '',
    speaker_count: rand < 0.05 ? 2 : 1,
    suspicious_speech: rand < 0.05,
    matched_keywords: rand < 0.05 ? ['help me', 'answer'] : [],
    background_conversation: rand < 0.04,
    demo: true,
  };
}
