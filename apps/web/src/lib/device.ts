import { MODEL } from '@securedata/ml';

/** Lo que impide usar la IA local en este equipo, y lo que conviene saber antes de bajarla. */
export interface DeviceCheck {
  blockers: string[];
  warnings: string[];
}

// Módulo WebAssembly mínimo con una instrucción SIMD: onnxruntime-web la necesita.
const SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 10, 30, 1, 28, 0, 65, 0, 253, 15, 253, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 253,
  186, 1, 26, 11,
]);

interface NavigatorExtras {
  deviceMemory?: number;
  connection?: { saveData?: boolean; effectiveType?: string; type?: string };
}

export async function checkDevice(): Promise<DeviceCheck> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const nav = navigator as Navigator & NavigatorExtras;

  if (typeof WebAssembly !== 'object' || typeof Worker === 'undefined') {
    blockers.push('Este navegador no puede correr modelos de IA (le falta WebAssembly). Probá con Chrome, Edge o Firefox actualizados.');
  } else {
    try {
      if (!WebAssembly.validate(SIMD_PROBE)) blockers.push('Este navegador es muy viejo para la IA local. Actualizalo o probá con Chrome, Edge o Firefox.');
    } catch {
      blockers.push('Este navegador es muy viejo para la IA local. Actualizalo o probá con Chrome, Edge o Firefox.');
    }
  }

  // deviceMemory está en Chrome y Edge (redondeado: 0.5, 1, 2, 4, 8). El modelo usa alrededor de 1 GB.
  if (nav.deviceMemory !== undefined && nav.deviceMemory < 4) {
    warnings.push(
      `Tu equipo tiene poca memoria (${nav.deviceMemory} GB): la IA local puede andar lenta o no alcanzar. Cerrá otras pestañas antes de activarla.`,
    );
  }

  const mobile = window.matchMedia?.('(pointer: coarse)').matches && window.innerWidth < 900;
  const cellular = nav.connection?.type === 'cellular' || nav.connection?.saveData || ['slow-2g', '2g', '3g'].includes(nav.connection?.effectiveType ?? '');
  if (cellular || mobile) {
    warnings.push(
      `La descarga es de ${MODEL.sizeMb} MB${cellular ? ' y parece que estás con datos móviles o una conexión lenta' : ''}: conviene hacerla con Wi-Fi.`,
    );
  }

  try {
    const { quota, usage } = await navigator.storage.estimate();
    if (quota !== undefined && quota - (usage ?? 0) < MODEL.sizeMb * 1.2 * 1_000_000) {
      warnings.push('Queda poco espacio en el navegador: la IA va a funcionar, pero el modelo se volvería a descargar en cada visita.');
    }
  } catch {
    // Sin estimación de espacio: no se avisa nada.
  }

  return { blockers, warnings };
}

export { friendlyAiError } from '@securedata/ml';
