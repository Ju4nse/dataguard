/**
 * Genera ejemplos de entrenamiento 100% FICTICIOS para ajustar (fine-tuning) GLiNER a lo que ve DataGuard:
 * mails, chats, formularios y prompts de empresas argentinas con nombres, empresas, direcciones y datos de salud.
 * Los casos "negativos" (roles, áreas, herramientas, organismos, ciudades, calles sin número) pesan tanto como
 * los positivos: le enseñan al modelo qué NO marcar.
 *
 * Uso: npm run entrenamiento:datos                       (4000 de entrenamiento + 500 de prueba)
 *      npm run entrenamiento:datos -- --cantidad 8000 --semilla 7
 *      npm run entrenamiento:datos -- --muestra 20         (muestra ejemplos marcados para revisarlos)
 * Salida: .cache/entrenamiento/train.json y dev.json, en el formato de la librería gliner:
 *   { tokenized_text: [...palabras], ner: [[primera, última (inclusive), etiqueta]], ner_labels: [...] }
 * Después: subir los dos archivos al notebook entrenamiento/entrenar_gliner.ipynb (Google Colab).
 *
 * Ningún ejemplo repite una entidad del set de control (el examen final de `npm run eval:ia -- --control`),
 * ni un nombre, empresa o dirección de los otros sets de evaluación: si no, la medición quedaría inflada.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HARD_CASES, HOLDOUT_CASES, TEXT_CASES, VALIDATION_CASES } from '../packages/detector/eval/corpus';
import { parseAnnotated } from '../packages/detector/eval/evaluate';
import { cuitCheckDigit } from '../packages/detector/src';
import { DEFAULT_CONFIG, LABEL_NAMES, splitWords } from '../packages/ml/src';

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const TOTAL = Number(arg('--cantidad') ?? 4000);
const DEV_TOTAL = Math.round(TOTAL / 8);
const SAMPLE = Number(arg('--muestra') ?? 0);
const OUT_DIR = join('.cache', 'entrenamiento');

// PRNG con semilla (mulberry32): mismos archivos en cada corrida.
let seed = Number(arg('--semilla') ?? 2026);
function rand() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;
const chance = (p: number) => rand() < p;
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const digits = (n: number) => Array.from({ length: n }, () => int(0, 9)).join('');
const split = (s: string) => s.trim().split(/\s*\|\s*/);

// ---------- Vocabulario (todo inventado; los nombres sueltos son comunes, las combinaciones no son de nadie) ----------

// prettier-ignore
const NOMBRES = split('Juan|María|Lucía|Martín|Sofía|Diego|Valentina|Pablo|Camila|Federico|Julieta|Nicolás|Florencia|Gonzalo|Agustina|Matías|Carolina|Sebastián|Milagros|Facundo|Romina|Hernán|Daiana|Leandro|Micaela|Ezequiel|Natalia|Cristian|Brenda|Maximiliano|Lorena|Ramiro|Antonella|Gustavo|Silvina|Marcelo|Paola|Jorge|Mónica|Rubén|Graciela|Osvaldo|Norma|Héctor|Susana|Walter|Liliana|Darío|Gisela|Emiliano|Belén|Joaquín|Rocío|Tomás|Abril|Lautaro|Candela|Bautista|Delfina|Thiago|Morena|Iván|Celeste|Germán|Vanesa|Fernando|Andrea|Claudio|Verónica|Alejandro|Mariela|Sergio|Analía|Rodrigo|Yanina|Esteban|Noelia|Ignacio|Melina|Franco|Pilar|Santiago|Luciana|Ariel|Tamara|Mauro|Jésica|Nahuel|Ayelén|Ulises|Rosa|Elba|Ángel|Néstor|Raúl');
// prettier-ignore
const SEGUNDOS = split('José|Laura|Andrés|Belén|Ignacio|Soledad|Alberto|Inés|Emilio|Victoria|Manuel|Paz|Ezequiel|Luján|Gabriel|Milagros|Ariel|Noemí');
// prettier-ignore
const APELLIDOS = split('Pérez|Gómez|Fernández|Rodríguez|López|Martínez|Sosa|Romero|Álvarez|Benítez|Acosta|Medina|Herrera|Aguirre|Pereyra|Gutiérrez|Giménez|Molina|Silva|Castro|Rojas|Ortiz|Núñez|Luna|Juárez|Cabrera|Ríos|Ferreyra|Godoy|Morales|Domínguez|Moreno|Peralta|Vega|Carrizo|Quiroga|Ledesma|Muñoz|Ojeda|Ponce|Vera|Villalba|Cardozo|Navarro|Coronel|Vázquez|Ramos|Arias|Toledo|Figueroa|Correa|Cáceres|Paz|Bustos|Maldonado|Mansilla|Ibáñez|Chávez|Russo|Ferrari|Esposito|Bianchi|Romano|Colombo|Ricci|Marino|Greco|Bruno|Gallo|Conti|De Luca|Costa|Giordano|Mancini|Lombardi|Moretti|Barbieri|Fontana|Santoro|Mariani|Rinaldi|Caruso|Ferrara|Galli|Martini|Leone|Longo|Gentile|Martinelli|Vitale|Lombardo|Serra|Coppola|De Santis|D\'Angelo|Marchetti|Parisi|Villa|Conte|Ferraro|Fabbri|Bianco|Marini|Grasso|Valentini|Messina|Sala|De Angelis|Gatti|Pellegrini|Palumbo|Sanna|Farina|Rizzi|Monti|Cattaneo|Morelli|Amato|Silvestri|Mazza|Testa|Grassi|Pellegrino|Carbone|Giuliani|Benedetti|Barone|Rossetti|Caputo|Montanari|Guerra|Palmieri|Bernardi|Martino|Fiore|De Rosa|Ferretti|Bellini|Basile|Riva|Donati|Piras|Vitali|Battaglia|Sartori|Neri|Costantini|Milani|Pagano|Ruggiero|Sorrentino|D\'Amico|Orlando|Damico|Negri|Kowalski|Novak|Schmidt|Müller|Weber|Fischer|Wagner|Becker|Hoffmann|Klein|Wolf|Schröder|Neumann|Schwarz|Zimmermann|Braun|Krüger|Hartmann|Lange|Werner|Krause|Lehmann|Köhler|Herrmann|König|Walter|Mayer|Huber|Kaiser|Fuchs|Peters|Lang|Scholz|Möller|Weiß|Jung|Hahn|Vogel|Friedrich|Keller|Günther|Frank|Berger|Winkler|Roth|Beck|Lorenz|Baumann|Franke|Albrecht|Schuster|Simon|Ludwig|Böhm|Winter|Kraus|Martin|Schumacher|Krämer|Vogt|Stein|Jäger|Otto|Sommer|Groß|Seidel|Heinrich|Brandt|Haas|Schreiber|Graf|Schulte|Dietrich|Ziegler|Kuhn|Kühn|Pohl|Engel|Horn|Busch|Bergmann|Thomas|Voigt|Sauer|Arnold|Wolff|Pfeiffer|Goldberg|Rosenfeld|Kaplan|Grinberg|Feldman|Abramovich|Zylberstein|Kogan|Lerner|Wainstein|Haddad|Khoury|Nasser|Saad|Yazbek|Hamdan|Malouf|Tanaka|Nakamura|Kim|Park|Chen|Wang|Smith|O\'Connor|MacKenzie|Fitzgerald|Duarte|Ocampo|Arce|Benavídez|Insaurralde|Leiva|Montenegro|Sandoval|Valdez|Zalazar|Barrios|Escobar|Galeano|Lezcano|Ayala|Britez|Cuello|Funes|Tello|Gauna|Iturralde|Echeverría|Goñi|Larrañaga|Urquiza|Zubiría|Aramburu|Etcheverry|Irigoyen|Olaechea');
// prettier-ignore
const PARTICULAS = split('de la|del|de los|Di|De|Van der|Mac');

// prettier-ignore
const RUBROS = split('Ferretería|Distribuidora|Metalúrgica|Transportes|Logística|Panificadora|Lácteos|Frigorífico|Textil|Agropecuaria|Constructora|Inmobiliaria|Farmacia|Veterinaria|Corralón|Maderera|Imprenta|Autopartes|Librería|Óptica|Bodega|Molino|Química|Plásticos|Envases|Cerámicas|Muebles|Estudio Contable|Consultora|Laboratorio|Clínica|Sanatorio|Taller|Agencia|Mayorista|Supermercado|Carnicería|Fiambrería|Vivero|Cooperativa|Seguros|Pinturería|Electricidad|Sanitarios|Cristalería|Herrería|Aserradero|Acopio|Semillera|Tornería');
// prettier-ignore
const FANTASIA = split('El Tornillo|La Esperanza|San Cayetano|Los Álamos|El Progreso|La Unión|Santa Rita|El Ceibo|Don Alberto|Doña Rosa|La Estrella|El Molino|Las Acacias|San Jorge|La Paloma|El Sol|Nueva Era|La Tradición|El Faro|Los Pinos|San Expedito|La Colonia|El Hornero|Las Marías|La Serenísima|El Trébol|Tres Arroyos|Don Pepe|La Familia|El Galpón|Santa Clara|La Rueda|El Puente|Los Hermanos|La Escondida|Del Valle|Del Plata|Del Centro|del Litoral|del Norte Grande|Patagónica|Cuyana|Pampeana|Andina|Mediterránea|Austral|Rioplatense|Atlántica|Serrana|Norteña');
// prettier-ignore
const SILABAS_A = split('Agro|Tecno|Metal|Pampa|Andes|Rio|Sur|Norte|Info|Ser|Pro|Indu|Plast|Termo|Elec|Hidro|Vial|Petro|Trans|Ali|Fri|Construc|Lumi|Fer|Gran|Cam|Bio|Eco|Data|Net');
// prettier-ignore
const SILABAS_B = split('vial|link|mar|sol|tec|plast|sur|pack|net|cor|gas|tex|lab|tel|med|frio|lux|car|vid|ar|mix|max|par|fer|dat|log|cam|gro|norte|vent');
// prettier-ignore
const SOCIEDADES = split('SA|S.A.|SRL|S.R.L.|SAS|S.A.S.|S.H.|SACIF|Hnos.|e Hijos|& Asociados|y Cía.');

// prettier-ignore
const CALLES = split('Belgrano|San Martín|Rivadavia|Mitre|Sarmiento|Moreno|Alsina|Lavalle|Corrientes|Córdoba|Santa Fe|Entre Ríos|Tucumán|Urquiza|Alem|Colón|Maipú|Chacabuco|Pueyrredón|Las Heras|Güemes|Dorrego|Saavedra|Brown|Paso|Laprida|Castelli|Rodríguez Peña|Larrea|Ayacucho|Junín|Uriburu|Pringles|Estrada|Necochea|Brandsen|Gral. Paz|9 de Julio|25 de Mayo|3 de Febrero|Independencia|Libertad|Constitución|España|Italia|Francia|Bolivia|Perú|Chile|Uruguay|Los Aromos|Las Lilas|Los Jazmines|Del Carmen|Hipólito Yrigoyen|Juan B. Justo|Gaona|Warnes|Cabildo|Monroe|Olazábal|Avellaneda|Pellegrini|Oroño|Bv. Oroño|Vélez Sarsfield|Colón|Duarte Quirós|Emilio Civit|Aristóbulo del Valle');
// prettier-ignore
const TIPOS_CALLE = split('Calle|Av.|Avenida|Pasaje|Pje.|Bv.|Boulevard|Diagonal');
// prettier-ignore
const CIUDADES = split('CABA|Rosario|Córdoba|Mendoza|La Plata|Mar del Plata|Tucumán|Salta|Santa Fe|Paraná|Neuquén|Bahía Blanca|San Juan|Resistencia|Posadas|Corrientes|Río Cuarto|Villa María|Tandil|Rafaela|Venado Tuerto|Pergamino|Junín|Olavarría|Zárate|Campana|Pilar|San Isidro|Quilmes|Lanús|Morón|Ramos Mejía|Banfield|Avellaneda|San Miguel|Villa Carlos Paz|Godoy Cruz|San Rafael|Comodoro Rivadavia|Trelew|Ushuaia|Viedma|General Roca|Concordia|Gualeguaychú|Santiago del Estero|Catamarca|La Rioja|Jujuy|Formosa');
// prettier-ignore
const PROVINCIAS = split('Buenos Aires|Córdoba|Santa Fe|Mendoza|Tucumán|Salta|Entre Ríos|Misiones|Chaco|Neuquén|Río Negro|Chubut|San Juan|San Luis|La Pampa|Corrientes|Jujuy|Santiago del Estero');

// Salud: siempre el estado o la condición, con artículo cuando lo lleva en la frase.
// prettier-ignore
const SALUD = split('diabetes tipo 2|diabetes tipo 1|hipertensión arterial|una fractura de muñeca|una fractura de peroné|una fractura de clavícula|un esguince de tobillo|un esguince de rodilla|una hernia inguinal|una hernia de disco lumbar|asma bronquial|EPOC|celiaquía|depresión mayor|ansiedad generalizada|un ataque de pánico|ataques de pánico|trastorno bipolar|covid|neumonía|bronquitis|cáncer de mama|cáncer de colon|un tumor benigno|epilepsia|migrañas crónicas|hipotiroidismo|hipertiroidismo|HIV|VIH positivo|hepatitis C|un infarto|una arritmia|insuficiencia renal|lumbalgia|cervicalgia|tendinitis|síndrome del túnel carpiano|una lesión de meniscos|una conjuntivitis|gastritis|colon irritable|anemia|obesidad mórbida|un ACV|Parkinson|esclerosis múltiple|artritis reumatoidea|psoriasis|dermatitis|TDAH|autismo|anorexia|bulimia|adicción al alcohol|consumo problemático de sustancias|un embarazo de riesgo|embarazo de 20 semanas|un aborto espontáneo|endometriosis|un cuadro de estrés laboral|burnout|una quemadura de segundo grado|un corte profundo en la mano|una conmoción cerebral|un desgarro muscular|hipoacusia|disminución visual');

// ---------- Negativos: parecen entidades pero no son datos confidenciales de nadie ----------
// prettier-ignore
const ROLES = split('el Gerente de Ventas|la Jefa de Compras|el encargado del depósito|la responsable de Tesorería|el contador|la contadora|el abogado de la empresa|el operario|la empleada nueva|el cliente|la clienta|el proveedor|el médico laboral|la doctora de guardia|el Director Comercial|la Analista de Cuentas a Pagar|el supervisor de turno|la recepcionista|el chofer|el cadete|el técnico|la coordinadora|el titular de la cuenta|el apoderado|el paciente|la paciente|el usuario|el administrador del sistema|el jefe|la gerenta|el auditor externo|la escribana');
// prettier-ignore
const AREAS = split('Recursos Humanos|RRHH|Compras|Ventas|Logística|Administración|Finanzas|Tesorería|Contabilidad|Sistemas|Legales|Marketing|Mesa de Ayuda|Atención al Cliente|el área Comercial|Gerencia General|Depósito Central|la Sucursal Centro|la Planta 2|el Directorio|Calidad|Mantenimiento|Seguridad e Higiene|Cobranzas|Facturación|Expedición|Producción');
// prettier-ignore
const HERRAMIENTAS = split('Excel|Google Drive|Gmail|Outlook|Teams|Slack|WhatsApp|Zoom|Notion|Jira|ChatGPT|Copilot|SAP|Tango Gestión|Mercado Pago|Mercado Libre|Trello|Google Sheets|Power BI|Dropbox|OneDrive|Word|el sistema de facturación|el CRM');
// prettier-ignore
const ORGANISMOS = split('AFIP|ARCA|ANSES|la Superintendencia de Riesgos del Trabajo|el Ministerio de Trabajo|Rentas|ARBA|el Banco Central|IGJ|la Municipalidad|SENASA|ANMAT|el INTI|la CNV|PAMI');
// prettier-ignore
const PRODUCTOS = split('yerba 1 kg|aceite 1,5 L|harina 000|cemento portland|tornillos 8x40|cable 2,5 mm|pallets|cajas de cartón|resmas A4|tóner|guantes de nitrilo|bobinas de film|pintura látex 20 L|caños de PVC|hierro del 8|chapas acanaladas|semillas de soja|alimento balanceado|leche en polvo|queso cremoso');
// prettier-ignore
const MESES = split('enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre');
// prettier-ignore
const DIAS = split('lunes|martes|miércoles|jueves|viernes|sábado|Lunes|Martes|Miércoles|Jueves|Viernes');

// ---------- Generadores de valores ----------

function casing(s: string): string {
  if (chance(0.06)) return s.toLowerCase();
  if (chance(0.05)) return s.toLocaleUpperCase('es');
  return s;
}

function apellido(): string {
  if (chance(0.06)) return `${pick(PARTICULAS)} ${pick(APELLIDOS)}`;
  return pick(APELLIDOS);
}

function persona(): string {
  const n = pick(NOMBRES);
  const r = rand();
  let s: string;
  if (r < 0.45) s = `${n} ${apellido()}`;
  else if (r < 0.58) s = `${n} ${pick(SEGUNDOS)} ${apellido()}`;
  else if (r < 0.7) s = `${n} ${apellido()} ${pick(APELLIDOS)}`;
  else if (r < 0.78) s = `${apellido().toLocaleUpperCase('es')}, ${n}`;
  else if (r < 0.86) s = `${apellido()}, ${n}${chance(0.3) ? ` ${pick(SEGUNDOS)}` : ''}`;
  else if (r < 0.92) s = `${apellido()} ${n}`;
  else s = `${n.charAt(0)}. ${apellido()}`;
  return casing(s);
}

/** Nombre de fantasía inventado: "Agrolink", "Termopack" (sin repetir la sílaba, nada de "Vialvial"). */
function fantasyName(): string {
  for (;;) {
    const a = pick(SILABAS_A);
    const b = pick(SILABAS_B);
    if (!a.toLowerCase().endsWith(b) && !b.startsWith(a.toLowerCase())) return a + b;
  }
}

function empresa(): string {
  const r = rand();
  let s: string;
  if (r < 0.4) s = `${pick(RUBROS)} ${pick(FANTASIA)}`;
  else if (r < 0.55) s = `${pick(RUBROS)} ${pick(APELLIDOS)}`;
  else if (r < 0.7) s = fantasyName();
  else if (r < 0.8) s = `${pick(APELLIDOS)} ${pick(['Hnos.', 'Hermanos', 'e Hijos', '& Asociados', 'y Cía.'])}`;
  else if (r < 0.9) s = `${fantasyName()} ${pick(['Argentina', 'Sur', 'del Plata', 'Group', 'Soluciones', 'Servicios'])}`;
  else s = `${pick(RUBROS)} ${pick(['del', 'de la'])} ${pick(['Sur', 'Oeste', 'Este', 'Norte', 'Costa', 'Sierra', 'Pampa', 'Ribera'])}`;
  if (chance(0.45) && !/(Hnos\.|Hermanos|Hijos|Asociados|Cía\.)$/.test(s)) s += ` ${pick(SOCIEDADES.slice(0, 8))}`;
  return chance(0.05) ? s.toLocaleUpperCase('es') : s;
}

function direccion(): string {
  const calle = pick(CALLES);
  const numero = String(int(1, 9800));
  const r = rand();
  let s: string;
  if (r < 0.35) s = `${pick(TIPOS_CALLE)} ${calle} ${numero}`;
  else if (r < 0.55) s = `${calle} ${numero}`;
  else if (r < 0.65) s = `${pick(TIPOS_CALLE)} ${calle} ${pick(['nro', 'Nro.', 'N°', 'nº'])} ${numero}`;
  else if (r < 0.75) s = `Calle ${int(1, 180)} ${pick(['nro ', 'N° ', ''])}${numero}`;
  else if (r < 0.85) s = `${calle} ${numero}, piso ${int(1, 14)} ${pick(['dto', 'depto.', 'dpto'])} ${pick(['A', 'B', 'C', 'D', '4', '12'])}`;
  else s = `Ruta ${pick(['Provincial', 'Nacional'])} ${int(1, 40)} km ${int(1, 900)}`;
  if (chance(0.35)) s += `, ${pick(CIUDADES)}`;
  return s;
}

function fecha(): string {
  return chance(0.5) ? `${int(1, 28)}/${int(1, 12)}/${pick(['2024', '2025', '2026'])}` : `el ${int(1, 28)} de ${pick(MESES)}`;
}
function dni(): string {
  return String(int(18_000_000, 46_000_000)).replace(/(\d{2})(\d{3})(\d{3})/, chance(0.6) ? '$1.$2.$3' : '$1$2$3');
}
function cuit(): string {
  for (;;) {
    const prefix = pick(['20', '23', '27', '30', '33']);
    const body = String(int(10_000_000, 49_000_000));
    const check = cuitCheckDigit(prefix + body);
    if (check !== null) return `${prefix}-${body}-${check}`;
  }
}
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
function email(): string {
  const user = chance(0.5)
    ? `${fold(pick(NOMBRES))}.${fold(pick(APELLIDOS)).replace(/[^a-z]/g, '')}`
    : pick(['ventas', 'compras', 'info', 'administracion', 'rrhh']);
  return `${user}@${pick(['gmail.com', 'hotmail.com', 'yahoo.com.ar', `${fold(pick(SILABAS_A))}${fold(pick(SILABAS_B))}.com.ar`])}`;
}
function telefono(): string {
  return pick([`+54 9 11 ${digits(4)}-${digits(4)}`, `11 ${digits(4)}-${digits(4)}`, `(0351) ${digits(3)}-${digits(4)}`, `0341 15${digits(6)}`]);
}
const monto = () => `$ ${int(5, 9800)}.${digits(3)}${chance(0.3) ? `,${digits(2)}` : ''}`;

/** Ranuras: las que tienen etiqueta generan una entidad marcada; el resto, texto sin marcar. */
const LABELED: Record<string, [label: string, gen: () => string]> = {
  persona: ['person', persona],
  nombre: ['person', () => casing(pick(NOMBRES))],
  nombres: ['person', () => `${pick(NOMBRES)} ${pick(SEGUNDOS)}`],
  apellido: ['person', apellido],
  empresa: ['organization', empresa],
  direccion: ['address', direccion],
  salud: ['medical condition', () => pick(SALUD)],
};
const PLAIN: Record<string, () => string> = {
  rol: () => pick(ROLES),
  area: () => pick(AREAS),
  herramienta: () => pick(HERRAMIENTAS),
  organismo: () => pick(ORGANISMOS),
  ciudad: () => pick(CIUDADES),
  provincia: () => pick(PROVINCIAS),
  calle: () => `${pick(TIPOS_CALLE)} ${pick(CALLES)}`,
  esquina: () => `${pick(CALLES)} y ${pick(CALLES)}`,
  producto: () => pick(PRODUCTOS),
  fecha,
  dia: () => pick(DIAS),
  dni,
  cuit,
  email,
  tel: telefono,
  monto,
  factura: () => `${pick(['A', 'B', 'C'])} 000${int(1, 9)}-000${digits(5)}`,
  legajo: () => String(int(100, 9999)),
  n: () => String(int(2, 300)),
};

// ---------- Plantillas ----------
// Cada línea es una plantilla ({ranura} = valor generado; ¶ = salto de línea).

// prettier-ignore
const TEMPLATES = `
Hola, soy {persona} de {empresa}. Les escribo por la factura {factura} que sigue impaga.
Buenas tardes, {nombre}: te paso el presupuesto de {producto} que nos pidió {empresa}.
Estimada {nombre}: confirmamos la entrega para {fecha} en {direccion}.
Por favor coordinar con {persona} el retiro de la mercadería en {direccion}.
{persona} (DNI {dni}) solicita el reintegro de {monto} por gastos de viaje.
El proveedor {empresa}, CUIT {cuit}, nos facturó dos veces el mismo pedido.
Desde {area} informamos que {persona} se incorpora el {dia} como {rol}.
La empleada {persona} presentó certificado por {salud} y no viene hasta {fecha}.
El parte médico indica que {persona} tiene {salud} y necesita reposo.
Según la ART, el operario sufrió {salud} durante el turno noche.
{persona} pidió licencia porque le diagnosticaron {salud}.
Recordá que {nombre} tiene {salud}, así que no puede hacer tareas de esfuerzo.
Mandale el contrato a {persona} a {email} antes del {dia}.
Te dejo el contacto de {persona}: {tel}.
Necesito que llames a {nombre} de {empresa} para reclamar el pago.
Ayer hablé con el Sr. {apellido} y nos dio el ok para avanzar.
La Dra. {apellido} firmó el alta de {persona}.
Ing. {persona} y Lic. {persona} aprobaron la compra de {producto}.
El envío va a {direccion} a nombre de {persona}.
Domicilio de entrega: {direccion}. Recibe: {persona}.
Apellido y nombre: {persona}¶Domicilio: {direccion}¶DNI: {dni}
Razón social: {empresa}¶CUIT: {cuit}¶Dirección: {direccion}
Paciente: {persona}¶Diagnóstico: {salud}¶Indicación: reposo laboral
Cliente: {empresa}¶Contacto: {persona}¶Teléfono: {tel}
Gracias por todo!¶{persona}¶{rol} - {empresa}
Saludos,¶{persona}¶{area}
Resumime este mail de {persona} y armá una respuesta para {empresa}.
Armá una tabla con las ventas de {empresa} y {empresa} del último trimestre.
Redactá una carta documento para {persona}, que vive en {direccion}, por la deuda de {monto}.
Escribí un mail para {nombre} diciéndole que el pedido de {producto} se atrasa.
Corregí la ortografía de este texto: {persona} no se presentó a trabajar porque tenía {salud}.
Traducí al inglés: estimado {apellido}, adjunto la cotización de {empresa}.
Cotizamos con {empresa} y con {empresa}; la segunda es más barata.
{empresa} nos ofrece {producto} a {monto} por unidad, puesto en {ciudad}.
Le compramos a {empresa} desde hace años y nunca tuvimos problemas.
El reclamo lo hizo {persona}, de {empresa}, por un faltante de {n} unidades.
Avisale a {nombre} que mañana no hay reunión.
che {nombre} pasame el excel de {empresa} cuando puedas
{nombre} dijo que {persona} renunció y que su último día es el {dia}.
Hay que darle de baja a {persona} en {herramienta} y en {herramienta}.
El legajo {legajo} corresponde a {persona}, del área de {area}.
{persona} vive en {direccion} y se mudó hace poco desde {provincia}.
Nos mudamos: desde {fecha} atendemos en {direccion}.
La sucursal de {empresa} en {direccion} cierra a las 18.
{persona} está {salud2} y pidió no hacer horas extra.
El hijo de {persona} tiene {salud} y ella necesita salir antes los {dia}.
En la revisión anual se detectó que {persona} tiene {salud}.
La ART rechazó el siniestro de {persona} ({salud}) por falta de documentación.
Por favor no comentar en el grupo lo de {salud} de {nombre}.
Firmado por {persona}, apoderado de {empresa}.
En representación de {empresa} se presenta {persona}, con domicilio en {direccion}.
El inquilino {persona} adeuda tres meses del local de {direccion}.
La transferencia de {monto} a {empresa} quedó rechazada por el banco.
{empresa} y {empresa} firmaron el acuerdo de distribución en {ciudad}.
El gerente de {empresa}, {persona}, nos visita el {dia}.
Te reenvío lo que mandó {persona}: dice que {empresa} subió los precios un 15%.
{rol} de {empresa} pidió una reunión con {persona} para revisar el contrato.
Subí el informe a {herramienta} y avisá por {herramienta} cuando esté listo.
{area}, {area} y {area} revisan el presupuesto anual.
{rol} tiene que aprobar la orden antes del {dia}.
La reunión con {area} pasó para el {dia} a las 10.
{organismo} nos intimó a presentar la declaración jurada antes de {fecha}.
Hay que cargar las facturas en {herramienta} y mandarle el resumen a {organismo}.
La planta de {ciudad} paró dos días por mantenimiento.
El camión se demoró en {calle} por un corte.
Nos encontramos en la esquina de {esquina}.
{rol} pidió que {area} revise los pedidos de {producto}.
El pedido de {n} unidades de {producto} sale el {dia} desde {ciudad}.
Necesito un resumen de las ventas de {provincia} y {provincia} por mes.
Calculá el promedio de días de atraso de los pagos de {fecha} a {fecha}.
Recordatorio: el {dia} vence el pago de {organismo}.
La capacitación de {herramienta} es obligatoria para todo {area}.
El paciente refiere dolor lumbar desde hace dos semanas; se indica reposo.
La licencia médica se carga en el sistema con el certificado adjunto.
{rol} de {area} está de vacaciones hasta {fecha}.
Pedile a {area} que mande la factura a {email}.
¿Me pasás el teléfono de {area}? Es {tel}, creo.
Cuando hables con {persona} preguntale por la cotización de {empresa}.
Dejo constancia de que {persona} (legajo {legajo}) devolvió la notebook.
La señora {apellido} llamó tres veces por el reclamo del envío a {direccion}.
{persona} y {persona} van a viajar a {ciudad} para la feria.
Por indicación de {persona}, la deuda de {empresa} pasa a Legales.
Le diagnosticaron {salud} a {nombre} y va a estar con licencia un mes.
`.trim().split('\n').map((t) => t.replaceAll('¶', '\n'));

/** "{salud2}": condición que va sin artículo después de "está" (embarazada, internada…). */
// prettier-ignore
const SALUD_ESTADO = split('embarazada|internado|internada|en tratamiento oncológico|en rehabilitación|con licencia psiquiátrica|en diálisis|convaleciente');
LABELED.salud2 = ['medical condition', () => pick(SALUD_ESTADO)];

// Una de cada seis plantillas queda solo para dev.json (repartidas entre todos los tipos de texto).
const devTemplates = TEMPLATES.filter((_, i) => i % 6 === 5);
const trainTemplates = TEMPLATES.filter((_, i) => i % 6 !== 5);

// ---------- Entidades que no pueden aparecer (sets de evaluación) ----------

const forbidden = new Set<string>();
for (const c of HOLDOUT_CASES) for (const g of parseAnnotated(c.text).gold) forbidden.add(fold(g.value));
for (const c of [...TEXT_CASES, ...VALIDATION_CASES, ...HARD_CASES]) {
  for (const g of parseAnnotated(c.text).gold) if (['NOMBRE_PERSONA', 'RAZON_SOCIAL', 'DIRECCION'].includes(g.type)) forbidden.add(fold(g.value));
}

interface Example {
  tokenized_text: string[];
  ner: [number, number, string][];
  ner_labels: string[];
}

interface Rendered {
  text: string;
  spans: { start: number; end: number; label: string }[];
}

function render(template: string): Rendered {
  let text = '';
  const spans: Rendered['spans'] = [];
  let pos = 0;
  for (const m of template.matchAll(/\{(\w+)\}/g)) {
    text += template.slice(pos, m.index);
    pos = m.index + m[0].length;
    const slot = m[1]!;
    const labeled = LABELED[slot];
    if (labeled) {
      const value = labeled[1]();
      spans.push({ start: text.length, end: text.length + value.length, label: labeled[0] });
      text += value;
    } else {
      const plain = PLAIN[slot];
      if (!plain) throw new Error(`Ranura desconocida {${slot}} en: ${template}`);
      const value = plain();
      // Al principio de la frase: "El Gerente de Ventas…", no "el Gerente…".
      text += text === '' || text.endsWith('\n') ? value.charAt(0).toLocaleUpperCase('es') + value.slice(1) : value;
    }
  }
  text += template.slice(pos);
  return { text, spans };
}

/** Texto con posiciones de caracteres → palabras (mismo corte que la IA en el navegador) e índices de palabra. */
function toExample(r: Rendered): Example | 'desalineado' | 'prohibido' | 'largo' {
  const words = splitWords(r.text);
  const ner: Example['ner'] = [];
  for (const s of r.spans) {
    if (forbidden.has(fold(r.text.slice(s.start, s.end)))) return 'prohibido';
    const first = words.findIndex((w) => w.start === s.start);
    const last = words.findIndex((w) => w.end === s.end);
    if (first < 0 || last < first) return 'desalineado';
    if (last - first + 1 > DEFAULT_CONFIG.maxWidth) return 'largo';
    ner.push([first, last, s.label]);
  }
  return { tokenized_text: words.map((w) => w.text), ner, ner_labels: LABEL_NAMES };
}

function generate(templates: string[], count: number): { examples: Example[]; skipped: Record<string, number> } {
  const examples: Example[] = [];
  const seen = new Set<string>();
  const skipped: Record<string, number> = { desalineado: 0, prohibido: 0, largo: 0, repetido: 0 };
  let attempts = 0;
  while (examples.length < count && attempts++ < count * 20) {
    // 1 a 3 frases juntas: así llegan al modelo las ventanas de ~24 palabras.
    const parts = Array.from({ length: pick([1, 1, 2, 2, 3]) }, () => render(pick(templates)));
    const joined: Rendered = { text: '', spans: [] };
    for (const p of parts) {
      if (joined.text) joined.text += chance(0.25) ? '\n' : ' ';
      const offset = joined.text.length;
      joined.text += p.text;
      joined.spans.push(...p.spans.map((s) => ({ ...s, start: s.start + offset, end: s.end + offset })));
    }
    if (seen.has(joined.text)) {
      skipped.repetido!++;
      continue;
    }
    seen.add(joined.text);
    const ex = toExample(joined);
    if (typeof ex === 'string') {
      skipped[ex]!++;
      continue;
    }
    examples.push(ex);
  }
  return { examples, skipped };
}

function stats(examples: Example[]) {
  const byLabel: Record<string, number> = Object.fromEntries(LABEL_NAMES.map((l) => [l, 0]));
  let negatives = 0;
  let words = 0;
  for (const e of examples) {
    if (e.ner.length === 0) negatives++;
    words += e.tokenized_text.length;
    for (const [, , label] of e.ner) byLabel[label] = (byLabel[label] ?? 0) + 1;
  }
  return { byLabel, negatives, avgWords: Math.round(words / Math.max(1, examples.length)) };
}

/** Ejemplo legible: "Hola [[person|Juan Pérez]] …" (para revisar a ojo que las marcas tengan sentido). */
function annotate(e: Example): string {
  const out = [...e.tokenized_text];
  for (const [a, b, label] of e.ner) {
    out[a] = `[[${label}|${out[a]}`;
    out[b] = `${out[b]}]]`;
  }
  return out.join(' ');
}

const train = generate(trainTemplates, TOTAL);
const dev = generate(devTemplates, DEV_TOTAL);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'train.json'), JSON.stringify(train.examples));
writeFileSync(join(OUT_DIR, 'dev.json'), JSON.stringify(dev.examples));

for (const [name, set, templates] of [
  ['train.json', train, trainTemplates],
  ['dev.json', dev, devTemplates],
] as const) {
  const s = stats(set.examples);
  console.log(
    `${name}: ${set.examples.length} ejemplos (${templates.length} plantillas, ~${s.avgWords} palabras c/u, ${s.negatives} sin entidades) · ` +
      Object.entries(s.byLabel)
        .map(([l, n]) => `${l} ${n}`)
        .join(' · '),
  );
  const skipped = Object.entries(set.skipped).filter(([, n]) => n > 0);
  if (skipped.length) console.log(`  descartados: ${skipped.map(([k, n]) => `${k} ${n}`).join(' · ')}`);
}
console.log(`Guardado en ${OUT_DIR}/ (${forbidden.size} entidades de los sets de evaluación excluidas)`);

if (SAMPLE > 0) {
  console.log('\nMuestra:');
  for (const e of train.examples.slice(0, SAMPLE)) console.log(`- ${annotate(e).replace(/\n/g, ' ⏎ ')}`);
}
