import { create } from 'zustand';
import {
  analyzeDocument,
  analyzeTable,
  applyDecisions,
  applyTableModel,
  planTableModel,
  type CellSpans,
  DEFAULT_ACTIONS,
  DEFAULT_DOCUMENT_ACTIONS,
  fold,
  jsonLeaves,
  rebuildJson,
  transformDocument,
  type ColumnDecision,
  type ColumnFinding,
  type CustomTerm,
  type DocumentAnalysis,
  type EquivalenceRow,
  type JsonLeaf,
  type Segment,
  type Span,
  type TransformResult,
  type TypeDecision,
} from '@securedata/detector';
import { PSEUDONYM_PREFIXES, type Action, type DetectionType } from '@securedata/shared';
import { detectWithAi, useAi } from './lib/ai';
import { sendEvent, type Session } from './lib/api';
import { ACCEPTED_EXTENSIONS, extensionOf, MAX_SIZE_MB, parseFile, type FileFormat, type ParsedSheet } from './lib/files';

/** traducir: pasar la respuesta de la IA externa a los datos reales con la tabla de equivalencias. */
export type Step = 'subir' | 'revisar' | 'resultado' | 'traducir' | 'chat';
/** tabla: CSV/Excel/JSON tabular, por columna. documento: PDF/Word/TXT/JSON, por tipo de dato. */
export type Mode = 'tabla' | 'documento';

export interface DocumentResult {
  text: string;
  equivalences: EquivalenceRow[];
  transformedCounts: Partial<Record<DetectionType, number>>;
}

interface State {
  step: Step;
  mode: Mode;
  loading: boolean;
  error: string | null;
  fileName: string;
  format: FileFormat;

  // Modo tabla
  delimiter: string;
  sheets: ParsedSheet[];
  sheetIndex: number;
  findings: ColumnFinding[];
  decisions: Record<number, ColumnDecision>;
  result: TransformResult | null;
  /** Lo que encontró la IA local en las celdas de texto libre de la hoja actual. */
  cellSpans: CellSpans;

  // Modo documento
  segments: Segment[];
  jsonRoot: unknown;
  customTerms: CustomTerm[];
  /** Valores que el usuario marcó como "no ocultar" (falsos positivos). */
  ignoredValues: string[];
  analysis: DocumentAnalysis | null;
  /** Lo que encontró la IA local en cada segmento (vacío si no se usó). */
  modelSpans: Span[][];
  /** La IA local revisó este archivo. */
  aiUsed: boolean;
  /** Avance del análisis con IA local (0 a 1), o null si no está corriendo. */
  aiProgress: number | null;
  /** La IA local falló en este archivo: se protegió solo con reglas. */
  aiError: string | null;
  typeDecisions: Partial<Record<DetectionType, TypeDecision>>;
  docResult: DocumentResult | null;

  /** Sesión opcional del empleado: trae la política de su empresa y habilita el envío de metadatos al panel. */
  session: Session | null;
  /** Ya se enviaron los metadatos de este archivo (se envían una vez, al descargar o copiar). */
  usageSent: boolean;

  loadFile: (file: File) => Promise<void>;
  setSession: (session: Session | null) => void;
  recordUsage: () => void;
  selectSheet: (index: number) => Promise<void>;
  /** Abre el traductor de respuestas (paso "traducir"). */
  openTranslator: () => void;
  setDecision: (column: number, patch: Partial<ColumnDecision>) => void;
  apply: () => void;
  addTerm: (value: string, type: DetectionType) => void;
  removeTerm: (index: number) => void;
  toggleIgnore: (value: string) => void;
  setTypeDecision: (type: DetectionType, patch: Partial<TypeDecision>) => void;
  applyDocument: () => void;
  backToReview: () => void;
  /** Volver al último resultado aplicado. */
  backToResult: () => void;
  /** Navegación con el botón atrás del navegador: va a un paso si tiene sentido con lo que hay cargado. */
  goToStep: (step: Step) => void;
  reset: () => void;
}

type Policy = Session['politica'];

/** Acción por defecto de cada columna: la política de la empresa (si hay sesión) manda sobre la sugerencia. */
function initialDecisions(findings: ColumnFinding[], policy: Policy): Record<number, ColumnDecision> {
  const out: Record<number, ColumnDecision> = {};
  for (const f of findings) {
    out[f.index] =
      f.kind === 'ninguno'
        ? { action: 'mantener', type: null, kind: 'columna' }
        : {
            action: (f.type && policy[f.type]) || f.suggestedAction,
            type: f.type,
            kind: f.kind,
            prefix: f.type ? PSEUDONYM_PREFIXES[f.type] : undefined,
          };
  }
  return out;
}

/** En documentos no se puede "eliminar una columna": la política "eliminar" se aplica como "anonimizar". */
function documentAction(type: DetectionType, policy: Policy): TypeDecision['action'] {
  const p = policy[type];
  if (!p) return DEFAULT_DOCUMENT_ACTIONS[type];
  return p === 'eliminar' ? 'anonimizar' : p;
}

/** Conserva lo que el usuario ya eligió y agrega la acción de la política (o la sugerida) para los tipos nuevos. */
export function mergeTypeDecisions(analysis: DocumentAnalysis, current: Partial<Record<DetectionType, TypeDecision>>, policy: Policy) {
  const out = { ...current };
  for (const { type } of analysis.summary) {
    out[type] ??= { action: documentAction(type, policy), prefix: PSEUDONYM_PREFIXES[type] };
  }
  return out;
}

const empty = {
  step: 'subir' as Step,
  mode: 'tabla' as Mode,
  loading: false,
  error: null,
  fileName: '',
  format: 'csv' as FileFormat,
  delimiter: ',',
  sheets: [],
  sheetIndex: 0,
  findings: [],
  decisions: {},
  result: null,
  cellSpans: new Map() as CellSpans,
  segments: [],
  jsonRoot: null,
  customTerms: [],
  ignoredValues: [],
  analysis: null,
  modelSpans: [] as Span[][],
  aiUsed: false,
  aiProgress: null,
  aiError: null,
  typeDecisions: {},
  docResult: null,
  usageSent: false,
};

export const useStore = create<State>((set, get) => ({
  ...empty,
  session: null,

  setSession: (session) => {
    set({ session });
    // Si ya hay un archivo procesado, se vuelve a proteger con la política de la empresa.
    const { step, mode, sheetIndex, analysis } = get();
    if (step === 'subir') return;
    if (mode === 'tabla') {
      // Sin volver a analizar (ni a correr la IA): solo se recalculan las acciones con la política.
      const { findings } = get();
      if (findings.length > 0) {
        set({ decisions: initialDecisions(findings, session?.politica ?? {}) });
        get().apply();
      } else void get().selectSheet(sheetIndex);
    } else if (analysis) {
      set({ typeDecisions: mergeTypeDecisions(analysis, {}, session?.politica ?? {}) });
      get().applyDocument();
    }
  },

  recordUsage: () => {
    const { session, usageSent, mode, fileName, findings, decisions, sheets, sheetIndex, analysis, typeDecisions } = get();
    if (!session || usageSent) return;
    set({ usageSent: true });

    const detecciones: { tipo: DetectionType; accion: Action; cantidad: number }[] = [];
    if (mode === 'tabla') {
      const sheet = sheets[sheetIndex];
      for (const f of findings) {
        const d = decisions[f.index];
        if (!d) continue;
        if (f.kind === 'columna' && d.type && f.detectionCount > 0) {
          detecciones.push({ tipo: d.type, accion: d.action, cantidad: f.detectionCount });
        } else if (f.kind === 'texto') {
          for (const [t, n] of Object.entries(f.textCounts)) if (n) detecciones.push({ tipo: t as DetectionType, accion: d.action, cantidad: n });
        } else if (f.kind === 'ninguno' && d.type && sheet) {
          // Columna marcada a mano por el usuario.
          const n = sheet.rows.filter((r) => r[f.index] !== null && r[f.index] !== undefined && String(r[f.index]).trim() !== '').length;
          if (n) detecciones.push({ tipo: d.type, accion: d.action, cantidad: n });
        }
      }
    } else if (analysis) {
      for (const s of analysis.summary) detecciones.push({ tipo: s.type, accion: typeDecisions[s.type]?.action ?? 'mantener', cantidad: s.count });
    }

    // Solo metadatos: tipo de archivo (no el nombre), cantidad de filas y conteos por tipo y acción.
    void sendEvent({
      tipoEntrada: mode,
      tipoArchivo: extensionOf(fileName).slice(1),
      filas: mode === 'tabla' ? sheets[sheetIndex]?.rows.length : undefined,
      detecciones,
    }).catch(() => {
      // Si falla el envío no se bloquea al usuario; se puede reintentar en el próximo archivo.
      set({ usageSent: false });
    });
  },

  loadFile: async (file) => {
    const ext = extensionOf(file.name);
    if (ext === '.doc') {
      set({ error: 'Los archivos .doc (Word 97-2003) no se pueden leer. Abrilo en Word y guardalo como .docx.' });
      return;
    }
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      set({ error: `Formato no soportado. Podés subir: ${ACCEPTED_EXTENSIONS.join(', ')}.` });
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      set({ error: `El archivo supera los ${MAX_SIZE_MB} MB.` });
      return;
    }
    set({ ...empty, loading: true });
    try {
      const parsed = await parseFile(file);
      if (parsed.kind === 'tabla') {
        if (parsed.sheets.length === 0) throw new Error('El archivo está vacío.');
        set({ mode: 'tabla', fileName: file.name, format: parsed.format, delimiter: parsed.delimiter, sheets: parsed.sheets });
        await get().selectSheet(0);
        set({ loading: false });
        return;
      }
      const segments: Segment[] = parsed.kind === 'json' ? jsonLeaves(parsed.root) : [{ text: parsed.text }];
      if (segments.every((s) => !s.text.trim())) throw new Error('El archivo no tiene texto.');
      // Con la IA local activa, primero la corre (en su worker) y suma lo que encuentra a las reglas.
      let modelSpans: Span[][] = [];
      let aiError: string | null = null;
      if (useAi.getState().status === 'lista') {
        set({ aiProgress: 0 });
        try {
          modelSpans = await detectWithAi(
            segments.map((s) => s.text),
            (v) => set({ aiProgress: v }),
          );
        } catch (err) {
          aiError = err instanceof Error ? err.message : String(err);
        }
      }
      const analysis = analyzeDocument(segments, [], [], modelSpans);
      set({
        modelSpans,
        aiUsed: modelSpans.length > 0,
        aiProgress: null,
        aiError,
        mode: 'documento',
        fileName: file.name,
        format: parsed.kind === 'json' ? 'json' : parsed.format,
        segments,
        jsonRoot: parsed.kind === 'json' ? parsed.root : null,
        ignoredValues: [],
        analysis,
        typeDecisions: mergeTypeDecisions(analysis, {}, get().session?.politica ?? {}),
        loading: false,
      });
      // Protección automática: se aplican las acciones recomendadas y se va directo al resultado.
      // Revisar es opcional ("Revisar y ajustar").
      get().applyDocument();
    } catch (err) {
      set({ loading: false, error: `No pudimos leer el archivo: ${err instanceof Error ? err.message : String(err)}` });
    }
  },

  selectSheet: async (index) => {
    const sheet = get().sheets[index];
    if (!sheet) return;
    let findings = analyzeTable(sheet);
    let cellSpans: CellSpans = new Map();
    let aiUsed = false;
    let aiError: string | null = null;

    // Con la IA local activa: revisa las columnas dudosas o sin clasificar y el texto libre.
    const requests = useAi.getState().status === 'lista' ? planTableModel(sheet, findings) : [];
    if (requests.length > 0) {
      set({ aiProgress: 0 });
      try {
        const flat = await detectWithAi(
          requests.flatMap((r) => r.texts),
          (v) => set({ aiProgress: v }),
          { windowWords: 0 },
        );
        // Se reparte lo encontrado entre los pedidos, en el mismo orden en que se mandó.
        let k = 0;
        const results = requests.map((r) => r.texts.map(() => flat[k++] ?? []));
        ({ findings, cellSpans } = applyTableModel(sheet, findings, requests, results));
        aiUsed = true;
      } catch (err) {
        aiError = err instanceof Error ? err.message : String(err);
      }
    }
    // Si mientras corría la IA el usuario cargó otro archivo, este resultado ya no corresponde.
    if (get().sheets[index] !== sheet) return;
    set({
      sheetIndex: index,
      findings,
      cellSpans,
      aiUsed,
      aiError,
      aiProgress: null,
      decisions: initialDecisions(findings, get().session?.politica ?? {}),
      result: null,
    });
    // Protección automática, igual que en documentos.
    get().apply();
  },

  setDecision: (column, patch) =>
    set((s) => {
      const current = s.decisions[column] ?? { action: 'mantener', type: null, kind: 'columna' };
      const next = { ...current, ...patch };
      // Al cambiar el tipo a mano, se actualiza el prefijo sugerido y se evita una acción sin sentido.
      if ('type' in patch) {
        next.prefix = patch.type ? PSEUDONYM_PREFIXES[patch.type] : undefined;
        if (patch.type && !current.type && next.kind === 'columna') next.action = DEFAULT_ACTIONS[patch.type];
        if (!patch.type && next.kind === 'columna' && (next.action === 'anonimizar' || next.action === 'seudonimizar')) next.action = 'mantener';
      }
      return { decisions: { ...s.decisions, [column]: next } };
    }),

  apply: () => {
    const { sheets, sheetIndex, decisions, cellSpans } = get();
    const sheet = sheets[sheetIndex];
    if (!sheet) return;
    set({ result: applyDecisions(sheet, decisions, cellSpans), step: 'resultado' });
  },

  addTerm: (value, type) => {
    const v = value.trim();
    const { customTerms, segments, typeDecisions, ignoredValues } = get();
    if (v.length < 2 || customTerms.some((t) => t.value.toLowerCase() === v.toLowerCase())) return;
    const terms = [...customTerms, { value: v, type }];
    // Si el usuario lo agrega a mano, deja de estar ignorado.
    const ignored = ignoredValues.filter((x) => x.toLowerCase() !== v.toLowerCase());
    const analysis = analyzeDocument(segments, terms, ignored, get().modelSpans);
    set({ customTerms: terms, ignoredValues: ignored, analysis, typeDecisions: mergeTypeDecisions(analysis, typeDecisions, get().session?.politica ?? {}) });
  },

  removeTerm: (index) => {
    const { customTerms, segments, typeDecisions, ignoredValues } = get();
    const terms = customTerms.filter((_, i) => i !== index);
    const analysis = analyzeDocument(segments, terms, ignoredValues, get().modelSpans);
    set({ customTerms: terms, analysis, typeDecisions: mergeTypeDecisions(analysis, typeDecisions, get().session?.politica ?? {}) });
  },

  toggleIgnore: (value) => {
    const { customTerms, segments, typeDecisions, ignoredValues } = get();
    // Se compara sin mayúsculas ni tildes, igual que en el análisis.
    const key = fold(value);
    const ignored = ignoredValues.some((x) => fold(x) === key) ? ignoredValues.filter((x) => fold(x) !== key) : [...ignoredValues, value];
    const analysis = analyzeDocument(segments, customTerms, ignored, get().modelSpans);
    set({ ignoredValues: ignored, analysis, typeDecisions: mergeTypeDecisions(analysis, typeDecisions, get().session?.politica ?? {}) });
  },

  setTypeDecision: (type, patch) =>
    set((s) => ({
      typeDecisions: { ...s.typeDecisions, [type]: { ...(s.typeDecisions[type] ?? { action: 'mantener' }), ...patch } },
    })),

  applyDocument: () => {
    const { segments, analysis, typeDecisions, format, jsonRoot } = get();
    if (!analysis) return;
    const res = transformDocument(segments, analysis.spans, typeDecisions);
    const text =
      // En JSON, cada segmento es una hoja con su ruta (ver loadFile).
      format === 'json' ? JSON.stringify(rebuildJson(jsonRoot, segments as JsonLeaf[], res.texts), null, 2) : res.texts.join('');
    set({ docResult: { text, equivalences: res.equivalences, transformedCounts: res.transformedCounts }, step: 'resultado' });
  },

  backToReview: () => set({ step: 'revisar' }),

  // El resultado mostrado es el último aplicado; lo cambiado en la revisión queda como borrador.
  backToResult: () => set({ step: 'resultado' }),

  openTranslator: () => set({ step: 'traducir' }),

  goToStep: (step) => {
    const { result, docResult } = get();
    if (step === 'subir') get().reset();
    else if (step === 'traducir' || step === 'chat') set({ step });
    else if (result || docResult) set({ step });
    else get().reset();
  },

  reset: () => set({ ...empty }),
}));
