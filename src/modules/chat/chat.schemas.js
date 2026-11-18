import { z } from '#src/core/validation.js';
import { CHAT_ROOM_SLUGS, MESSAGE_MAX_LENGTH } from './chat-rooms.js';

/**
 * Caracteres invisibles que se eliminan: controles C0 y C1 (salvo el salto de línea), espacios de
 * ancho cero y marcas de dirección del texto (que permiten disfrazar un mensaje, como en el ataque
 * "Trojan Source"). Se arma con códigos numéricos para que el archivo no contenga caracteres
 * invisibles.
 */
const INVISIBLE_RANGES = [
  [0x00, 0x09],
  [0x0b, 0x1f],
  [0x7f, 0x9f],
  [0x200b, 0x200f],
  [0x2028, 0x202e],
  [0x2060, 0x2064],
  [0xfeff, 0xfeff],
];
const INVISIBLE_CHARACTERS = new RegExp(
  `[${INVISIBLE_RANGES.map(([from, to]) => `${String.fromCharCode(from)}-${String.fromCharCode(to)}`).join('')}]`,
  'g',
);

/**
 * Saneamiento del texto de un mensaje ANTES de validarlo y guardarlo:
 * - Unicode normalizado (NFC) y saltos de línea uniformes (\n).
 * - Sin caracteres de control invisibles (salvo el salto de línea); el tabulador pasa a espacio.
 * - Como máximo una línea en blanco seguida, y sin espacios al principio ni al final.
 *
 * Contra XSS no se "limpia" HTML: el texto se guarda tal cual y SIEMPRE se muestra como texto
 * (EJS escapa con <%= %> y el navegador usa textContent). Así "<b>hola</b>" se ve literal.
 * @param {string} raw
 */
export function sanitizeMessage(raw) {
  return String(raw)
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    .replace(INVISIBLE_CHARACTERS, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const room = z.enum(CHAT_ROOM_SLUGS, { error: 'La sala no existe.' });

export const sendMessageSchema = z.object({
  room,
  body: z
    .string({ error: 'Escribe un mensaje.' })
    // Corte previo: no tiene sentido procesar un texto enorme para luego rechazarlo.
    .max(
      MESSAGE_MAX_LENGTH * 4,
      `El mensaje no puede superar los ${MESSAGE_MAX_LENGTH} caracteres.`,
    )
    .transform(sanitizeMessage)
    .pipe(
      z
        .string()
        .min(1, 'Escribe un mensaje.')
        .max(
          MESSAGE_MAX_LENGTH,
          `El mensaje no puede superar los ${MESSAGE_MAX_LENGTH} caracteres.`,
        ),
    ),
});

export const joinRoomSchema = z.object({
  room,
  afterId: z.coerce.number().int().min(0).optional(),
});

export const historySchema = z.object({
  room,
  beforeId: z.coerce.number().int().positive(),
});

export const markReadSchema = z.object({
  room,
  messageId: z.coerce.number().int().positive(),
});
