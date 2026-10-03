/**
 * Corpus de evaluación con datos 100% FICTICIOS.
 *
 * Formato: [[TIPO|valor]] marca lo que el detector DEBE encontrar. Todo lo que no está marcado
 * NO debe detectarse (los casos "negativos" son tan importantes como los positivos).
 * Para agregar un caso: sumá una línea a TEXT_CASES o TABLE_CASES y corré `npm run eval`.
 */
import { cbuCheckDigits, cuitCheckDigit, luhnValid } from '../src';

const cuit = (prefix: string, body: string) => `${prefix}-${body}-${cuitCheckDigit(prefix + body)}`;
const cbu = (bank7: string, account13: string) => {
  const [c1, c2] = cbuCheckDigits(bank7, account13);
  return `${bank7}${c1}${account13}${c2}`;
};
/** Completa un número de tarjeta con su dígito Luhn. */
const card = (first15: string) => {
  for (let d = 0; d <= 9; d++) if (luhnValid(first15 + d)) return first15 + d;
  throw new Error('imposible');
};

export interface TextCase {
  id: string;
  text: string;
}

export const TEXT_CASES: TextCase[] = [
  // ---------- Identificación y contacto ----------
  { id: 'contacto-basico', text: 'Hola, soy [[NOMBRE_PERSONA|Lucía Fernández]], mi DNI es [[DNI|32.456.789]] y mi mail [[EMAIL|lucia.fernandez@gmail.com]].' },
  { id: 'telefonos', text: 'Contactar a [[NOMBRE_PERSONA|Martín Gómez]] al [[TELEFONO|+54 9 11 4567-8901]] o al [[TELEFONO|011 15-3344-5566]].' },
  { id: 'telefono-fijo-contexto', text: 'Tel. fijo: [[TELEFONO|4567-8901]]. Celular: [[TELEFONO|11 2345-6789]].' },
  { id: 'telefono-sin-separadores', text: 'Mandale un WhatsApp al [[TELEFONO|+5491155554444]] cuando puedas.' },
  { id: 'email-generico', text: 'Email genérico: [[EMAIL|info@lacteosnorte.com.ar]]; web: www.lacteosnorte.com.ar' },
  { id: 'dni-con-contexto', text: 'Datos del cliente: [[NOMBRE_PERSONA|Ana Laura Sosa]], DNI [[DNI|28.111.222]].' },
  { id: 'reclamo-completo', text: `Reclamo de [[NOMBRE_PERSONA|Diego Armando Sosa]] (DNI [[DNI|25.876.543]]), domiciliado en [[DIRECCION|Calle Belgrano 455]], tel. [[TELEFONO|0341 456-7890]].` },
  { id: 'pasaporte', text: 'Pasaporte [[PASAPORTE|AAB123456]], vence en 2030.' },

  // ---------- Fiscal y bancario ----------
  { id: 'empresa-cuit-factura', text: `La empresa [[RAZON_SOCIAL|Distribuidora del Sur S.R.L.]] (CUIT [[CUIT_CUIL|${cuit('30', '71234567')}]]) adeuda la factura 0001-00012345 por $ 1.250.000.` },
  { id: 'cuil-y-cuit-invalido', text: `CUIL del empleado: [[CUIT_CUIL|${cuit('20', '25876543')}]]; el CUIT 20-12345678-5 tiene mal el verificador.` },
  { id: 'cbu-y-alias', text: `Transferir al CBU [[CBU_CVU|${cbu('0170099', '2200000067890')}]] o al alias [[CBU_CVU|perro.casa.sol]] antes del viernes.` },
  { id: 'cvu', text: `Su CVU es [[CBU_CVU|${cbu('0000003', '1000123456789')}]].` },
  { id: 'tarjeta', text: 'Pagó con la tarjeta [[TARJETA|4111 1111 1111 1111]] el 15/03/2025.' },
  { id: 'tarjeta-sin-espacios', text: `Nro de tarjeta: [[TARJETA|${card('545454545454545')}]], vto 08/27.` },

  // ---------- Nombres y empresas ----------
  { id: 'firma-apoderado', text: 'Firmado por [[NOMBRE_PERSONA|Juan Carlos de la Fuente]], apoderado de [[RAZON_SOCIAL|Agro Pampa SA]].' },
  { id: 'apellido-coma-nombre', text: '[[NOMBRE_PERSONA|PÉREZ, Juan]] - Legajo 4521 - Área Comercial.' },
  { id: 'nombre-compuesto', text: 'Estimada [[NOMBRE_PERSONA|María José]]: le escribimos por su reclamo.' },
  { id: 'titulos', text: 'Ing. [[NOMBRE_PERSONA|Roberto Álvarez]] y Lic. [[NOMBRE_PERSONA|Paula Medina]] aprobaron el presupuesto.' },
  { id: 'titulo-apellido-solo', text: 'El vehículo patente [[PATENTE|AB 123 CD]] fue retirado por el Sr. [[NOMBRE_PERSONA|Ramírez]].' },
  { id: 'mayusculas', text: '[[NOMBRE_PERSONA|ANA MARÍA LÓPEZ]] firmó la nota.' },
  { id: 'apellidos-coma-nombre', text: 'Apellido y nombre: [[NOMBRE_PERSONA|Benítez Acosta, Julieta]]' },
  { id: 'paciente-apellido-primero', text: 'La paciente [[NOMBRE_PERSONA|Gómez Valentina]] está [[DATO_SENSIBLE|embarazada]].' },
  { id: 'tabla-en-texto', text: 'Cliente: [[RAZON_SOCIAL|Lácteos Norte SA]] | Contacto: [[NOMBRE_PERSONA|Camila Rodríguez]] | Cel: [[TELEFONO|(0351) 155-123456]]' },
  { id: 'direccion', text: 'Domicilio: [[DIRECCION|Av. Corrientes 1234]], piso 5, CABA.' },

  // ---------- Fechas y edad ----------
  { id: 'nacimiento-numerica', text: 'Nacido el [[FECHA_NACIMIENTO|12/03/1985]] en Córdoba.' },
  { id: 'edad-y-nacimiento-largo', text: 'Edad: [[EDAD|67]]. Fecha de nacimiento: [[FECHA_NACIMIENTO|3 de mayo de 1958]].' },

  // ---------- Datos sensibles (Ley 25.326) ----------
  { id: 'salud-licencia', text: 'La empleada tiene [[EDAD|45 años]] de edad y presentó [[DATO_SENSIBLE|licencia médica]] por [[DATO_SENSIBLE|depresión]].' },
  { id: 'salud-diagnostico', text: 'Atendido por la Dra. [[NOMBRE_PERSONA|Silvia Benítez]], diagnóstico: [[DATO_SENSIBLE|diabetes]] tipo 2.' },
  { id: 'sindical-religion', text: 'Es [[DATO_SENSIBLE|afiliado al sindicato]] de Comercio y [[DATO_SENSIBLE|católico]] practicante.' },
  { id: 'etnia', text: 'Se identifica como [[DATO_SENSIBLE|afrodescendiente]].' },
  { id: 'orientacion', text: 'Orientación sexual declarada: [[DATO_SENSIBLE|bisexual]].' },

  // ---------- Salarios ----------
  { id: 'sueldo', text: 'El sueldo bruto de [[NOMBRE_PERSONA|Pablo Romero]] es de [[SALARIO|$ 1.850.000]] mensuales.' },
  { id: 'remuneracion', text: 'Remuneración acordada: [[SALARIO|2.300.000 pesos]] más bonos.' },
  { id: 'neg-monto-venta', text: 'La venta total de marzo fue de $ 12.500.000 y el ticket promedio de $ 8.400.' },

  // ---------- Credenciales e infraestructura ----------
  { id: 'ip-y-api-key', text: 'El servidor de producción es [[IP|192.168.10.25]] y la API key es [[CREDENCIAL|sk-proj-a1B2c3D4e5F6g7H8i9J0kLmNoPqRsTuV]].' },
  { id: 'connection-string', text: 'DATABASE_URL=postgres://admin:[[CREDENCIAL|S3cr3tP4ss]]@db.empresa.local:5432/ventas' },
  { id: 'password-en-codigo', text: 'password = "[[CREDENCIAL|Hunter2024!]]"' },
  { id: 'aws-key', text: 'export AWS_ACCESS_KEY_ID=[[CREDENCIAL|AKIAIOSFODNN7EXAMPLE]]' },
  { id: 'jwt', text: 'Authorization: Bearer [[CREDENCIAL|eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U]]' },
  { id: 'github-token', text: 'Token de GitHub: [[CREDENCIAL|ghp_1234567890abcdefghijklmnopqrstuvwxYZ]]' },
  { id: 'ip-y-version', text: 'IP del atacante: [[IP|203.0.113.45]]; versión 2.10.4.1 del firewall.' },

  // ---------- Ex-validación (se ajustaron reglas mirándolos) ----------
  { id: 'ex-v-transferencia', text: `Por favor transferir a nombre de [[RAZON_SOCIAL|Ferretería Central SA]], CUIT [[CUIT_CUIL|${cuit('30', '70998877')}]], alias [[CBU_CVU|ferre.central.mp]].` },
  { id: 'ex-v-legajo', text: 'Empleado: [[NOMBRE_PERSONA|Sergio Luna]] | DNI [[DNI|27.345.901]] | Sueldo: [[SALARIO|$ 1.420.000]] | Obra social: OSDE' },
  { id: 'ex-v-patente', text: 'Dominio del vehículo de la empresa: [[PATENTE|AC 456 BD]].' },

  // ---------- Negativos: nada de esto debe detectarse ----------
  { id: 'neg-pedido-fecha-codigo', text: 'El pedido 12345678 se despachó el 2025-03-15 con el código ABC123 desde Rosario.' },
  { id: 'neg-montos', text: 'Facturamos 30.123.456 pesos en marzo; el crecimiento fue de 12,5%.' },
  { id: 'neg-lugares', text: 'Reunión en San Martín y Mercedes con el equipo de Ventas de Buenos Aires.' },
  { id: 'neg-version-ticket', text: 'La versión 1.2.3.4 del sistema corrige errores. Ticket 1145678901.' },
  { id: 'neg-timestamp', text: 'Nro de operación 20250315123045 registrada correctamente.' },
  { id: 'neg-ley', text: 'Política de privacidad: el tratamiento de datos se rige por la Ley 25.326.' },
  { id: 'neg-anios', text: 'El 3 de marzo de 2025 firmamos el acuerdo con 15 años de garantía.' },
  { id: 'neg-sa-suelto', text: 'SA de CV no aplica en Argentina; ver S.A. en el glosario.' },
  { id: 'neg-calle-sin-numero', text: 'Nos vemos en Calle Juan B. Justo y Av. San Martín (sin número).' },
  { id: 'neg-ultimos-4', text: 'Visa terminada en 4242, débito automático activo.' },
  { id: 'neg-futbol', text: 'Rosario Central le ganó a Boca en Rosario.' },
  { id: 'neg-procesamiento', text: 'Los datos se procesan en el navegador; no se envía información a servidores.' },
  { id: 'neg-articulo-cp', text: 'El artículo 12345678 cuesta $ 4.500 y el envío a CP 2000 es gratis.' },
  { id: 'neg-factura-telefono', text: 'Factura B 0003-00045678 emitida el 01/04/2025.' },
  { id: 'neg-mayusculas-oracion', text: 'Entre Ríos y Santa Fe lideran las ventas. Mar del Plata creció un 8%.' },
];

/**
 * Set de VALIDACIÓN: casos nuevos que no se usaron para ajustar las reglas. Mide qué tan bien
 * generaliza el detector a textos que no vio. Si se ajusta una regla mirando estos casos,
 * hay que mover el caso al set de arriba y escribir casos nuevos acá.
 */
export const VALIDATION_CASES: TextCase[] = [
  { id: 'v-mail-rrhh', text: 'Buen día, adjunto el CV de [[NOMBRE_PERSONA|Tomás Aguirre]] ([[EMAIL|t.aguirre88@hotmail.com]]), cel [[TELEFONO|+54 9 351 678-1234]].' },
  { id: 'v-reclamo', text: 'La Sra. [[NOMBRE_PERSONA|Graciela Ponce]] reclama por un débito no reconocido en su tarjeta [[TARJETA|5500 0000 0000 0004]].' },
  { id: 'v-medico', text: 'Se adjunta [[DATO_SENSIBLE|certificado médico]] del empleado por [[DATO_SENSIBLE|hipertensión]]; vuelve el lunes.' },
  { id: 'v-config', text: 'SMTP_HOST=smtp.empresa.com.ar\nSMTP_USER=notificaciones\nSMTP_PASSWORD=[[CREDENCIAL|Qx7!pLm2#9]]' },
  { id: 'v-slack-token', text: 'Usá este token para el bot: [[CREDENCIAL|xoxb-1234567890-abcdefghijkl]]' },
  { id: 'v-direccion-entrega', text: 'Entregar en [[DIRECCION|Calle Mitre 2150]], Rosario, de 9 a 13 hs.' },
  { id: 'v-nacimiento', text: 'F. Nac.: [[FECHA_NACIMIENTO|07/11/1990]] — Nacionalidad: argentina.' },
  { id: 'v-mayus-firma', text: 'FIRMA: [[NOMBRE_PERSONA|CARLOS ALBERTO MÉNDEZ]] - ACLARACIÓN' },
  { id: 'v-dos-personas', text: 'Participaron [[NOMBRE_PERSONA|Florencia Ríos]] (Compras) y [[NOMBRE_PERSONA|Gustavo Herrera]] (Finanzas).' },
  { id: 'v-ip-log', text: '2025-04-02 10:15:33 ERROR login fallido desde [[IP|181.47.20.199]] usuario admin' },
  { id: 'v-religion', text: 'Pidió el día libre por ser [[DATO_SENSIBLE|judío]] y celebrar Yom Kipur.' },
  { id: 'v2-cobranza', text: `Hola [[NOMBRE_PERSONA|Mariana Quiroga]], te recuerdo que la cuota vence el viernes. CBU para pagar: [[CBU_CVU|${cbu('0720001', '8800001234567')}]].` },
  { id: 'v2-ficha', text: 'Apellido: [[NOMBRE_PERSONA|Villalba]] / Nombre: [[NOMBRE_PERSONA|Joaquín]] / CUIL: [[CUIT_CUIL|' + cuit('20', '35123456') + ']] / Edad: [[EDAD|29]]' },
  { id: 'v2-cuenta-dev', text: 'Pasame la key de Stripe de test: [[CREDENCIAL|sk_test_4eC39HqLyjWDarjtT1zdp7dc]]' },
  { id: 'v2-sindical', text: 'El trabajador es [[DATO_SENSIBLE|delegado gremial]] desde 2019 y tiene [[DATO_SENSIBLE|asma]].' },
  { id: 'v2-proveedor', text: 'Proveedor nuevo: [[RAZON_SOCIAL|Transportes del Litoral S.A.]], contacto [[EMAIL|compras@translitoral.com.ar]], tel. [[TELEFONO|0342 455-1200]].' },
  { id: 'v2-neg-planilla', text: 'Total facturado: 4.567.890 | Clientes activos: 1.234 | Ticket medio: 3.701' },
  { id: 'v2-neg-ciudad', text: 'Viajamos de Mercedes a Rosario y después a Villa María por la ruta 9.' },
  // Negativos nuevos
  { id: 'v-neg-reporte', text: 'Ventas Q1: Córdoba $ 3.200.000, Mendoza $ 2.100.000; 1.250 unidades vendidas.' },
  { id: 'v-neg-producto', text: 'El modelo XR-2000 versión 3.1.4.2 se entrega con garantía de 12 meses.' },
  { id: 'v-neg-sucursal', text: 'La sucursal San Juan y la de Santa Rosa abren el lunes 7 de abril.' },
  { id: 'v-neg-calendario', text: 'Reunión de directorio: martes 15 de abril de 2025, sala Belgrano, piso 3.' },
  { id: 'v-neg-orden', text: 'OC 4500012345 aprobada; remito 0001-00098765 adjunto.' },
  { id: 'v-neg-politica', text: 'La política de seguridad prohíbe compartir contraseñas por chat.' },
];

/**
 * Casos difíciles para las reglas (nombres fuera del diccionario, extranjeros, empresas sin sufijo,
 * minúsculas): miden cuánto suma la IA local (`npm run eval:ia`). Se escribieron ANTES de medir
 * la IA y no se ajustó nada después; no entran en el test de las reglas.
 */
export const HARD_CASES: TextCase[] = [
  { id: 'v3-nombre-raro', text: 'La reclamación la firmó [[NOMBRE_PERSONA|Yanina Etcheverry]] el martes pasado.' },
  { id: 'v3-extranjero', text: 'El consultor externo, [[NOMBRE_PERSONA|Wojciech Kowalczyk]], pidió acceso al tablero de ventas.' },
  { id: 'v3-minusculas', text: 'che pasale el reporte a [[NOMBRE_PERSONA|nahuel ibarra]] que lo necesita hoy' },
  { id: 'v3-empresa-sin-sufijo', text: 'Renovamos el contrato con [[RAZON_SOCIAL|Distribuidora El Ombú]] por dos años más.' },
  { id: 'v3-firma-mail', text: 'Saludos cordiales,\n[[NOMBRE_PERSONA|Florencia Iturralde]]\nJefa de Compras' },
  { id: 'v3-salud-implicita', text: 'Necesita reposo porque le diagnosticaron [[DATO_SENSIBLE|hernia de disco]] la semana pasada.' },
  { id: 'v3-direccion-texto', text: 'Mandale la muestra a [[DIRECCION|Pasaje Las Heras 1540, Villa Allende]].' },
  { id: 'v3-neg-marca', text: 'Comparamos Mercado Libre contra Tienda Nube para el canal online.' },
];

export interface TableCase {
  id: string;
  header: string;
  values: (string | number | Date)[];
  /** Tipo esperado, 'texto' si es texto libre con datos adentro, o null si no es sensible. */
  expected: string | null;
}

export const TABLE_CASES: TableCase[] = [
  { id: 'nombre-apellido', header: 'Nombre y Apellido', values: ['Juan Pérez', 'María Gómez', 'Lucía Sosa'], expected: 'NOMBRE_PERSONA' },
  { id: 'nombres-mayus-sin-encabezado', header: 'Col1', values: ['JUAN PEREZ', 'MARIA GOMEZ', 'LUCIA SOSA', 'PABLO ROMERO'], expected: 'NOMBRE_PERSONA' },
  { id: 'empresas', header: 'Cliente', values: ['Pérez SA', 'Gómez SRL', 'Agro Pampa S.A.'], expected: 'RAZON_SOCIAL' },
  { id: 'email', header: 'Email', values: ['a@b.com', 'c@d.com.ar'], expected: 'EMAIL' },
  { id: 'telefono', header: 'Teléfono', values: ['11 4567-8901', '0351 456-7890'], expected: 'TELEFONO' },
  { id: 'password', header: 'Password', values: ['abc123!', 'Qwerty2024'], expected: 'CREDENCIAL' },
  { id: 'token', header: 'Token', values: ['ghp_1234567890abcdefghijklmnopqrstuvwxYZ'], expected: 'CREDENCIAL' },
  { id: 'diagnostico', header: 'Diagnóstico', values: ['Diabetes', 'Hipertensión', 'Asma'], expected: 'DATO_SENSIBLE' },
  { id: 'ip', header: 'IP origen', values: ['10.0.0.1', '192.168.1.20'], expected: 'IP' },
  { id: 'alias', header: 'Alias CBU', values: ['perro.casa.sol', 'luna.mar.rio'], expected: 'CBU_CVU' },
  { id: 'edad', header: 'Edad', values: [34, 45, 52], expected: 'EDAD' },
  { id: 'pasaporte', header: 'Pasaporte', values: ['AAB123456', 'AAC654321'], expected: 'PASAPORTE' },
  { id: 'sueldo', header: 'Sueldo bruto', values: [850000, 1230000, 990500], expected: 'SALARIO' },
  {
    id: 'observaciones',
    header: 'Observaciones',
    values: ['Llamar a Camila Rodríguez por la tarde', 'Sin novedades en la entrega', 'Mandar el resumen a ana@pyme.com.ar'],
    expected: 'texto',
  },
  // Negativos
  { id: 'neg-ciudades', header: 'Ciudad', values: ['Rosario', 'Mercedes', 'Córdoba'], expected: null },
  { id: 'neg-productos', header: 'Producto', values: ['Yerba Mate', 'Dulce de Leche', 'Queso Cremoso'], expected: null },
  { id: 'neg-monto', header: 'Monto', values: [1500, 2300, 999.5], expected: null },
  { id: 'neg-facturas', header: 'Nro Factura', values: ['0001-00012345', '0001-00012346', '0002-00000001'], expected: null },
  { id: 'neg-codigo', header: 'Código', values: ['30123456', '30123457', '30123458'], expected: null },
  { id: 'neg-legajo', header: 'Legajo', values: [1001, 1002, 1003], expected: null },
  { id: 'neg-fechas', header: 'Fecha', values: [new Date(2025, 2, 1), new Date(2025, 3, 1)], expected: null },
];

/**
 * Set de control para la IA local: escrito ANTES de calibrar filtros y umbrales del modelo y nunca
 * usado para ajustarlos. Mide si la calibración generaliza o solo se acomodó a los otros casos.
 * Mezcla positivos difíciles y negativos con mayúsculas que no son datos personales.
 */
export const HOLDOUT_CASES: TextCase[] = [
  { id: 'c-mail-cliente', text: 'Buenas, les escribo de [[RAZON_SOCIAL|Ferretería Don Tito]] por la factura vencida que nos reclamó [[NOMBRE_PERSONA|Graciela Benítez]].' },
  { id: 'c-rrhh', text: 'Desde Recursos Humanos confirmamos que [[NOMBRE_PERSONA|Matías Szwarc]] se reincorpora el lunes tras su licencia.' },
  { id: 'c-medico', text: 'El parte indica que el operario sufrió [[DATO_SENSIBLE|una fractura de tibia]] y no puede manejar.' },
  { id: 'c-proveedor', text: 'Cotizamos con [[RAZON_SOCIAL|Metalúrgica Santa Lucía]] y con [[RAZON_SOCIAL|Plásticos del Oeste]]; la segunda es más barata.' },
  { id: 'c-envio', text: 'Entregar en [[DIRECCION|Calle 47 nro 820, La Plata]] a nombre de [[NOMBRE_PERSONA|Rocío Lanús]].' },
  { id: 'c-minusculas', text: 'avisale a [[NOMBRE_PERSONA|agustina ferreyra]] que mañana no hay reunión' },
  { id: 'c-apodo-firma', text: 'Gracias por todo!\n[[NOMBRE_PERSONA|Tomás Ezequiel Rinaldi]]\nAnalista de Cuentas a Pagar' },
  { id: 'c-neg-herramientas', text: 'Subí el informe a Google Drive y avisá por Slack cuando esté listo.' },
  { id: 'c-neg-areas', text: 'Logística, Compras y Administración revisan el presupuesto anual.' },
  { id: 'c-neg-feriado', text: 'El Día de la Bandera no abre la planta de Pilar.' },
  { id: 'c-neg-cargo', text: 'El gerente de sucursal y la encargada de turno aprobaron el cambio.' },
  { id: 'c-neg-producto', text: 'El Plan Premium incluye soporte prioritario y la App Móvil.' },
];
