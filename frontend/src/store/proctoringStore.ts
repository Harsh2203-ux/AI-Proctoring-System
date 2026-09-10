import { create } from 'zustand';

interface Warning {
  number: number;
  message: string;
  max_warnings: number;
}

interface ProctoringState {
  sessionId: string | null;
  demoMode: boolean;
  faceCount: number;
  identityVerified: boolean;
  identityConfidence: number;
  warningCount: number;
  maxWarnings: number;
  isDisqualified: boolean;
  disqualificationMessage: string | null;
  lastWarning: Warning | null;
  violations: any[];
  objects: any[];
  pose: any;
  gaze: any;
  transcript: string;
  speakerCount: number;
  isConnected: boolean;
  lastUpdate: Date | null;

  setSessionId: (id: string) => void;
  setDemoMode: (demo: boolean) => void;
  updateFromFrame: (result: any) => void;
  updateFromAudio: (result: any) => void;
  setConnected: (connected: boolean) => void;
  triggerDisqualification: (message: string) => void;
  reset: () => void;
}

export const useProctoringStore = create<ProctoringState>((set) => ({
  sessionId: null,
  demoMode: true,
  faceCount: 1,
  identityVerified: false,
  identityConfidence: 0,
  warningCount: 0,
  maxWarnings: 3,
  isDisqualified: false,
  disqualificationMessage: null,
  lastWarning: null,
  violations: [],
  objects: [],
  pose: {},
  gaze: {},
  transcript: '',
  speakerCount: 1,
  isConnected: false,
  lastUpdate: null,

  setSessionId: (id) => set({ sessionId: id }),
  setDemoMode: (demo) => set({ demoMode: demo }),

  updateFromFrame: (result) => set((state) => ({
    faceCount: result.face_count ?? state.faceCount,
    identityVerified: result.identity?.is_match ?? state.identityVerified,
    identityConfidence: result.identity?.confidence ?? state.identityConfidence,
    objects: result.objects ?? state.objects,
    pose: result.pose ?? state.pose,
    gaze: result.gaze ?? state.gaze,
    lastWarning: result.warning ?? state.lastWarning,
    warningCount: result.warning?.number ?? state.warningCount,
    maxWarnings: result.warning?.max_warnings ?? state.maxWarnings,
    violations: result.violations?.length ? [...state.violations, ...result.violations].slice(-50) : state.violations,
    isDisqualified: result.disqualified ? true : state.isDisqualified,
    disqualificationMessage: result.disqualification_message ?? state.disqualificationMessage,
    lastUpdate: new Date(),
  })),

  updateFromAudio: (result) => set((state) => ({
    transcript: result.transcript ?? state.transcript,
    speakerCount: result.speaker_count ?? state.speakerCount,
    lastWarning: result.warning ?? state.lastWarning,
    warningCount: result.warning?.number ?? state.warningCount,
    isDisqualified: result.disqualified ? true : state.isDisqualified,
    lastUpdate: new Date(),
  })),

  setConnected: (connected) => set({ isConnected: connected }),

  triggerDisqualification: (message) => set({ isDisqualified: true, disqualificationMessage: message }),

  reset: () => set({
    sessionId: null, faceCount: 1, identityVerified: false, identityConfidence: 0,
    warningCount: 0, isDisqualified: false, disqualificationMessage: null,
    lastWarning: null, violations: [], objects: [], pose: {}, gaze: {},
    transcript: '', speakerCount: 1, isConnected: false, lastUpdate: null,
  }),
}));
