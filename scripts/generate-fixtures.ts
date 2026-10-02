/**
 * Genera archivos de prueba con datos 100% FICTICIOS (CUIT y CBU con verificador válido, pero inventados).
 * Uso: npm run fixtures
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { cbuCheckDigits, cuitCheckDigit } from '../packages/detector/src';

// PRNG con semilla para que los archivos sean siempre iguales.
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]!;
const digits = (n: number) => Array.from({ length: n }, () => Math.floor(rand() * 10)).join('');

function fakeCuit(prefix: '20' | '27' | '30' | '33'): string {
  for (;;) {
    const body = String(10_000_000 + Math.floor(rand() * 39_000_000));
    const check = cuitCheckDigit(prefix + body);
    if (check !== null) return `${prefix}-${body}-${check}`;
  }
}

function fakeCbu(): string {
  const bank = pick(['007', '011', '014', '017', '072', '285']) + digits(4);
  const account = digits(13);
  const [c1, c2] = cbuCheckDigits(bank, account);
  return `${bank}${c1}${account}${c2}`;
}

const NOMBRES = ['Juan', 'María', 'Lucía', 'Martín', 'Sofía', 'Diego', 'Valentina', 'Pablo', 'Camila', 'Federico', 'Julieta', 'Nicolás'];
const APELLIDOS = ['Pérez', 'Gómez', 'Fernández', 'Rodríguez', 'López', 'Martínez', 'Sosa', 'Romero', 'Álvarez', 'Benítez', 'Acosta', 'Medina'];
const EMPRESAS = ['Distribuidora del Sur', 'Lácteos Norte', 'Ferretería Central', 'Agro Pampa', 'Logística Andina', 'Textil Rosario', 'Panificadora Belgrano', 'Metalúrgica Oeste'];
const SOCIEDADES = ['SA', 'S.R.L.', 'SRL', 'S.A.', 'SAS'];
const PROVINCIAS = ['Buenos Aires', 'CABA', 'Córdoba', 'Santa Fe', 'Mendoza', 'Tucumán'];
const PRODUCTOS = ['Yerba 1kg', 'Aceite 1,5L', 'Harina 000', 'Azúcar 1kg', 'Fideos 500g', 'Arroz 1kg'];

const persona = () => `${pick(NOMBRES)} ${pick(APELLIDOS)}`;
const telefono = () => pick([`+54 9 11 ${digits(4)}-${digits(4)}`, `011 15-${digits(4)}-${digits(4)}`, `(0351) ${digits(3)}-${digits(4)}`]);
const emailDe = (nombre: string) =>
  nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(' ', '.') + pick(['@gmail.com', '@hotmail.com', '@empresa.com.ar']);

// Pocas empresas que se repiten, para que se note la seudonimización consistente.
const clientes = EMPRESAS.map((e) => ({ nombre: `${e} ${pick(SOCIEDADES)}`, cuit: fakeCuit(pick(['30', '33'])), cbu: fakeCbu() }));

const headers = ['Fecha', 'Cliente', 'CUIT', 'Contacto', 'Email', 'Teléfono', 'DNI contacto', 'CBU', 'Provincia', 'Producto', 'Cantidad', 'Monto', 'Observaciones'];
const rows: (string | number | Date)[][] = [];
for (let i = 0; i < 80; i++) {
  const c = pick(clientes);
  const contacto = persona();
  const tel = telefono();
  const dni = String(20_000_000 + Math.floor(rand() * 25_000_000));
  const obs = pick([
    'Sin novedades',
    'Entrega en horario de mañana',
    `Llamar al ${tel} antes de despachar`,
    `Mandar factura a ${emailDe(contacto)}`,
    `Autorizado a retirar: DNI ${dni.replace(/(\d{2})(\d{3})(\d{3})/, '$1.$2.$3')}`,
    'Pidió descuento por volumen',
  ]);
  const cantidad = 1 + Math.floor(rand() * 200);
  rows.push([
    new Date(2025, Math.floor(rand() * 12), 1 + Math.floor(rand() * 28)),
    c.nombre,
    c.cuit,
    contacto,
    emailDe(contacto),
    tel,
    dni,
    c.cbu,
    pick(PROVINCIAS),
    pick(PRODUCTOS),
    cantidad,
    Math.round(cantidad * (800 + rand() * 4000) * 100) / 100,
    obs,
  ]);
}

mkdirSync('fixtures', { recursive: true });

const ws = XLSX.utils.aoa_to_sheet([headers, ...rows], { cellDates: true });
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Ventas 2025');
writeFileSync('fixtures/clientes_demo.xlsx', XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
copyFileSync('fixtures/clientes_demo.xlsx', 'apps/web/public/ejemplo_clientes.xlsx');

const csvRows = rows.map((r) => r.map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v))));
writeFileSync('fixtures/clientes_demo.csv', '﻿' + XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet([headers, ...csvRows]), { FS: ';' }));

const c0 = clientes[0]!;
writeFileSync(
  'fixtures/prompt_con_datos.txt',
  `Armame un mail de cobranza para ${c0.nombre} (CUIT ${c0.cuit}). El contacto es ${persona()}, DNI 30.456.789, ` +
    `tel +54 9 11 4567-8901, mail cobranzas@${c0.nombre.split(' ')[0]!.toLowerCase()}.com.ar. ` +
    `Que transfieran al CBU ${fakeCbu()} antes del viernes.\n`,
);

// ---------- Documentos (contrato en TXT, Word y PDF) ----------
const c1 = clientes[1]!;
const firmante = 'Martín Sosa';
const contrato = [
  'CONTRATO DE PRESTACIÓN DE SERVICIOS',
  '',
  `Entre ${c1.nombre}, CUIT ${c1.cuit}, con domicilio en Av. Corrientes 1234, CABA, en adelante "EL CLIENTE", ` +
    `representada por ${firmante}, DNI 30.456.789, y Logística Andina SA, CUIT ${fakeCuit('30')}, en adelante "EL PROVEEDOR", se acuerda lo siguiente:`,
  '',
  `PRIMERA: EL PROVEEDOR prestará servicios de distribución por un monto mensual de $ 1.250.000.`,
  `SEGUNDA: Los pagos se realizarán por transferencia al CBU ${c1.cbu}.`,
  `TERCERA: Las comunicaciones se enviarán a ${emailDe(firmante)} o al teléfono +54 9 11 4567-8901.`,
  `CUARTA: ${firmante} declara contar con facultades suficientes para firmar el presente.`,
  '',
  'Buenos Aires, 15 de marzo de 2025.',
];
writeFileSync('fixtures/contrato.txt', contrato.join('\n') + '\n');

const { Document, Packer, Paragraph, TextRun } = await import('docx');
const docx = new Document({
  sections: [{ children: contrato.map((line, i) => new Paragraph({ children: [new TextRun({ text: line, bold: i === 0 })] })) }],
});
writeFileSync('fixtures/contrato.docx', await Packer.toBuffer(docx));

const { PDFDocument, StandardFonts } = await import('pdf-lib');
const pdf = await PDFDocument.create();
const font = await pdf.embedFont(StandardFonts.Helvetica);
const page = pdf.addPage([595, 842]);
let y = 790;
for (const line of contrato) {
  // Corte de línea simple a ~95 caracteres.
  const words = line.split(' ');
  let current = '';
  for (const w of words) {
    if ((current + ' ' + w).length > 95) {
      page.drawText(current, { x: 50, y, size: 10, font });
      y -= 14;
      current = w;
    } else current = current ? `${current} ${w}` : w;
  }
  page.drawText(current, { x: 50, y, size: 10, font });
  y -= 14;
}
writeFileSync('fixtures/contrato.pdf', await pdf.save());

// ---------- JSON: lista de registros (se trata como tabla) y JSON anidado (se trata como documento) ----------
writeFileSync(
  'fixtures/clientes.json',
  JSON.stringify(
    rows.slice(0, 10).map((r) => ({ cliente: r[1], cuit: r[2], contacto: r[3], email: r[4], provincia: r[8], monto: r[11] })),
    null,
    2,
  ),
);
writeFileSync(
  'fixtures/pedido.json',
  JSON.stringify(
    {
      pedido: 4512,
      cliente: { razon_social: c1.nombre, cuit: c1.cuit, estado: 'Activo', contacto: { nombre: firmante, email: emailDe(firmante), telefono: '+54 9 11 4567-8901' } },
      items: [
        { producto: { nombre: 'Yerba 1kg' }, cantidad: 40 },
        { producto: { nombre: 'Azúcar 1kg' }, cantidad: 25 },
      ],
      notas: [`Entregar a ${firmante}, DNI 30.456.789`],
    },
    null,
    2,
  ),
);

console.log('Generados en fixtures/: clientes_demo.xlsx/.csv, prompt_con_datos.txt, contrato.txt/.docx/.pdf, clientes.json, pedido.json');
