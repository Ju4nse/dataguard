import { fold } from '../terms';
import type { Span } from '../types';

/**
 * Rubros de comercio: un nombre de persona justo después de uno de estos ("Ferretería Don Tito",
 * "Panadería Doña Rosa", "Estudio Pérez") es el nombre de un negocio, no una persona.
 */
const BUSINESS_NOUNS = new Set(
  (
    'ferreteria panaderia carniceria verduleria polleria fiambreria libreria jugueteria zapateria peluqueria barberia farmacia ' +
    'kiosco kiosko almacen despensa autoservicio supermercado minimercado distribuidora mayorista corralon pintureria ' +
    'taller gomeria lavadero estudio consultorio inmobiliaria agencia consultora constructora transportes logistica ' +
    'comercial restaurante restaurant parrilla pizzeria heladeria cafeteria confiteria bar optica veterinaria clinica ' +
    'laboratorio escribania drogueria tienda bazar boutique imprenta grafica vivero bodega cerveceria hotel hostel ' +
    'gimnasio academia instituto colegio jardin escuela fundacion asociacion cooperativa club'
  ).split(' '),
);

// Rubro (con mayúscula) + títulos o conectores opcionales ("Ferretería Don", "Panadería de la") justo antes del nombre.
const PREVIOUS_WORD = /(\p{Lu}\p{L}+)((?:\s+(?:[Dd]oña|[Dd]on|[Dd]ra|[Dd]r|[Ss]ra|[Ss]r|San|Santa|de|del|la|el|los|las)\.?)*)\s+$/u;

/** Convierte en empresa los nombres de persona que vienen después de un rubro comercial. */
export function promoteBusinessNames(text: string, spans: Span[]): Span[] {
  return spans.map((s) => {
    if (s.type !== 'NOMBRE_PERSONA') return s;
    const m = text.slice(Math.max(0, s.start - 40), s.start).match(PREVIOUS_WORD);
    if (!m || !BUSINESS_NOUNS.has(fold(m[1]!))) return s;
    const start = s.start - m[0].length;
    return { ...s, type: 'RAZON_SOCIAL', start, value: text.slice(start, s.end) };
  });
}
