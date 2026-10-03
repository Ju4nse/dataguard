import {
  analyzeDocument,
  fold,
  PseudonymRegistry,
  restorePseudonyms,
  transformDocument,
  type CustomTerm,
  type DocumentAnalysis,
  type RestoreResult,
  type Span,
} from '@securedata/detector';
import type { Action, DetectionType } from '@securedata/shared';
import { create } from 'zustand';
import { detectWithAi, useAi } from './lib/ai';
import { sendEvent } from './lib/api';
import { mergeTypeDecisions, useStore } from './store';

/**
 * Modo chat: el usuario escribe o pega prompts y respuestas de la IA externa.
 * - Cada prompt se protege igual que un documento (reglas + IA local).
 * - Los seudónimos son los mismos en toda la conversación: "Persona_01" es siempre la misma persona.
 * - Las respuestas se traducen con todos los seudónimos de la conversación.
 * La conversación vive solo en memoria: al cerrar la pestaña se pierde (salvo la tabla, si se descarga).
 */
export interface PromptTurn {
  id: number;
  kind: 'prompt';
  original: string;
  analysis: DocumentAnalysis;
  modelSpans: Span[][];
  protectedText: string;
  aiUsed: boolean;
}

export interface ResponseTurn {
  id: number;
  kind: 'respuesta';
  text: string;
  result: RestoreResult;
}

export type ChatTurn = PromptTurn | ResponseTurn;

interface ChatState {
  turns: ChatTurn[];
  registry: PseudonymRegistry;
  /** Valores que el usuario marcó como "no ocultar" (valen para toda la conversación). */
  ignored: string[];
  busy: boolean;
  aiProgress: number | null;
  sendPrompt: (text: string) => Promise<void>;
  sendResponse: (text: string) => void;
  toggleIgnore: (value: string) => void;
  clear: () => void;
}

/** Tipos que se "aprenden": un nombre detectado en un mensaje se oculta también en los siguientes. */
// prettier-ignore
const LEARNED_TYPES = new Set<DetectionType>(['NOMBRE_PERSONA', 'RAZON_SOCIAL', 'DIRECCION']);

let nextId = 1;

/** Nombres, empresas y direcciones ya detectados en la conversación. */
function learnedTerms(turns: ChatTurn[], ignored: string[]): CustomTerm[] {
  const skip = new Set(ignored.map(fold));
  const terms = new Map<string, CustomTerm>();
  for (const t of turns) {
    if (t.kind !== 'prompt') continue;
    for (const s of t.analysis.spans.flat()) {
      if (!LEARNED_TYPES.has(s.type) || s.ignored || skip.has(fold(s.value)) || s.value.length < 3) continue;
      terms.set(fold(s.value), { value: s.value, type: s.type });
    }
  }
  return [...terms.values()];
}

function protect(original: string, modelSpans: Span[][], terms: CustomTerm[], ignored: string[], registry: PseudonymRegistry) {
  const segments = [{ text: original }];
  const analysis = analyzeDocument(segments, terms, ignored, modelSpans);
  const decisions = mergeTypeDecisions(analysis, {}, useStore.getState().session?.politica ?? {});
  const res = transformDocument(segments, analysis.spans, decisions, registry);
  return { analysis, decisions, protectedText: res.texts.join('') };
}

export const useChat = create<ChatState>((set, get) => ({
  turns: [],
  registry: new PseudonymRegistry(),
  ignored: [],
  busy: false,
  aiProgress: null,

  sendPrompt: async (text) => {
    const original = text.trim();
    if (!original || get().busy) return;
    set({ busy: true });
    let modelSpans: Span[][] = [];
    if (useAi.getState().status === 'lista') {
      set({ aiProgress: 0 });
      try {
        modelSpans = await detectWithAi([original], (v) => set({ aiProgress: v }));
      } catch {
        modelSpans = []; // sin IA, protegen las reglas
      }
    }
    const { turns, ignored, registry } = get();
    const { analysis, decisions, protectedText } = protect(original, modelSpans, learnedTerms(turns, ignored), ignored, registry);
    const turn: PromptTurn = { id: nextId++, kind: 'prompt', original, analysis, modelSpans, protectedText, aiUsed: modelSpans.length > 0 };
    set({ turns: [...turns, turn], busy: false, aiProgress: null });

    // Con sesión: solo metadatos (tipos y cantidades), nunca el texto.
    const session = useStore.getState().session;
    if (session) {
      const detecciones = analysis.summary.map((s) => ({ tipo: s.type, accion: (decisions[s.type]?.action ?? 'mantener') as Action, cantidad: s.count }));
      void sendEvent({ tipoEntrada: 'prompt', detecciones }).catch(() => {});
    }
  },

  sendResponse: (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const result = restorePseudonyms(trimmed, get().registry.entries());
    set({ turns: [...get().turns, { id: nextId++, kind: 'respuesta', text: trimmed, result }] });
  },

  toggleIgnore: (value) => {
    const { ignored, turns, registry } = get();
    const key = fold(value);
    const next = ignored.some((x) => fold(x) === key) ? ignored.filter((x) => fold(x) !== key) : [...ignored, value];
    // Se vuelven a proteger los prompts con la nueva lista (los seudónimos ya asignados se mantienen).
    const updated: ChatTurn[] = [];
    for (const t of turns) {
      if (t.kind !== 'prompt') {
        updated.push(t.kind === 'respuesta' ? { ...t, result: restorePseudonyms(t.text, registry.entries()) } : t);
        continue;
      }
      const { analysis, protectedText } = protect(t.original, t.modelSpans, learnedTerms(updated, next), next, registry);
      updated.push({ ...t, analysis, protectedText });
    }
    set({ ignored: next, turns: updated });
  },

  clear: () => set({ turns: [], registry: new PseudonymRegistry(), ignored: [], busy: false, aiProgress: null }),
}));
