/**
 * Netlify Function: send-sms.js
 * 
 * Proxy Serverless seguro para el envío de notificaciones SMS de retiro de paquetes
 * conectada a la REST API v3.2 de Interconectados.net (Venezuela).
 * 
 * Especificaciones:
 * - Método: POST
 * - Payload: { "phonenumber": "04126901682", "tracking": "MRW-MAR-331201", "clientName": "José Gregorio Hernández" }
 * - Sanitización: Si inicia con 584 -> 04. Valida 11 dígitos y prefijos (0412, 0414, 0416, 0424, 0426).
 * - Mensaje: "Hola {clientName}, tu paquete {tracking} ya esta listo para retirar en oficina. Te esperamos."
 * - Remueve acentos/tildes (GSM-7) y aplica encodeURIComponent(Text).
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

/**
 * Sanitiza texto eliminando acentos, tildes y caracteres no conformes con GSM
 */
function sanitizeGsmText(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Elimina acentos y tildes
    .replace(/[^\x20-\x7E]/g, '')   // Deja caracteres ASCII estándar imprimibles
    .trim();
}

/**
 * Sanitiza y valida números telefónicos en Venezuela:
 * - Si inicia con '584', se convierte al formato nacional '04' (ej: 584126901682 -> 04126901682)
 * - Valida exactamente 11 dígitos y prefijos venezolanos válidos: 0412, 0414, 0416, 0424, 0426
 * - Retorna el número sanitizado o null si es inválido
 */
function sanitizeVenezuelaPhone(phone) {
  if (!phone || typeof phone !== 'string') return null;

  // Eliminar espacios, guiones, puntos y caracteres que no sean dígitos ni '+'
  let cleaned = phone.trim().replace(/[^\d+]/g, '');

  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }

  // Si inicia con '584', convertir a '04'
  if (cleaned.startsWith('584')) {
    cleaned = '04' + cleaned.substring(3);
  } else if (cleaned.startsWith('4') && cleaned.length === 10) {
    // Si omiten el cero inicial (ej: 4126901682 -> 04126901682)
    cleaned = '0' + cleaned;
  }

  // Validación estricta: exactamente 11 dígitos y prefijo válido
  const vePhoneRegex = /^04(12|14|16|24|26)[0-9]{7}$/;
  if (!vePhoneRegex.test(cleaned)) {
    return null;
  }

  return cleaned;
}

/**
 * Genera el texto formateado para el SMS
 */
function buildSmsText(clientName, tracking) {
  const cleanName = sanitizeGsmText(clientName);
  const cleanTrack = sanitizeGsmText(tracking);
  return `Hola ${cleanName}, tu paquete ${cleanTrack} ya esta listo para retirar en oficina. Te esperamos.`;
}

/**
 * Handler principal de Netlify Function
 */
const handler = async (event) => {
  // Manejo de preflight CORS (OPTIONS)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: ''
    };
  }

  // Solo permitir peticiones POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        error: 'METHOD_NOT_ALLOWED',
        message: `El método ${event.httpMethod} no está permitido. Utiliza POST.`
      })
    };
  }

  // Parseo del cuerpo JSON
  let body;
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body || {});
  } catch (err) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        error: 'INVALID_JSON',
        message: 'El cuerpo de la solicitud debe ser un JSON válido.',
        details: err.message
      })
    };
  }

  const rawPhone = body.phonenumber || body.phone;
  const rawTracking = body.tracking || body.guia;
  const rawClientName = body.clientName || body.name;

  // Validación de campos requeridos
  const missing = [];
  if (!rawPhone || typeof rawPhone !== 'string' || !rawPhone.trim()) missing.push('phonenumber');
  if (!rawTracking || typeof rawTracking !== 'string' || !rawTracking.trim()) missing.push('tracking');
  if (!rawClientName || typeof rawClientName !== 'string' || !rawClientName.trim()) missing.push('clientName');

  if (missing.length > 0) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        error: 'MISSING_FIELDS',
        message: `Faltan campos obligatorios: ${missing.join(', ')}.`,
        expectedPayload: {
          phonenumber: 'string (Ej: "04126901682")',
          tracking: 'string (Ej: "MRW-MAR-331201")',
          clientName: 'string (Ej: "José Gregorio Hernández")'
        }
      })
    };
  }

  // Sanitización y validación estricta del número telefónico de Venezuela
  const cleanPhone = sanitizeVenezuelaPhone(rawPhone);
  if (!cleanPhone) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        error: 'INVALID_PHONE_NUMBER',
        message: `El número "${rawPhone}" no es un teléfono móvil válido de Venezuela. Debe comenzar con 0412, 0414, 0416, 0424 o 0426 y tener exactamente 11 dígitos.`,
        received: rawPhone
      })
    };
  }

  // Construcción del mensaje SMS sanitizado (norma GSM)
  const smsText = buildSmsText(rawClientName, rawTracking);

  // Credenciales y endpoint oficial de Interconectados.net
  const user = process.env.INTERCONECTADOS_USER || 'danipruebas';
  const password = process.env.INTERCONECTADOS_PASSWORD || 'f-93ab255620ba12cf6f03b-a66f1c14';
  const baseUrl = process.env.INTERCONECTADOS_BASE_URL || 'https://www.interconectados.net/api2/';

  // Petición a Interconectados.net
  try {
    const encodedText = encodeURIComponent(smsText);
    const targetUrl = `${baseUrl}?phonenumber=${encodeURIComponent(cleanPhone)}&Text=${encodedText}&user=${encodeURIComponent(user)}&password=${encodeURIComponent(password)}`;

    const response = await fetch(targetUrl, {
      method: 'GET'
    });

    const responseText = (await response.text()).trim();

    // Análisis de la respuesta de Interconectados.net
    if (responseText.includes('200') || responseText.startsWith('200')) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: true,
          message: 'SMS enviado con éxito',
          raw: responseText,
          data: {
            phonenumber: cleanPhone,
            tracking: sanitizeGsmText(rawTracking),
            clientName: sanitizeGsmText(rawClientName),
            text: smsText
          }
        })
      };
    }

    if (responseText === '401') {
      return {
        statusCode: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: false,
          error: 'AUTH_ERROR',
          message: 'Error de credenciales en Interconectados.net (Usuario o Password inválido)',
          raw: responseText
        })
      };
    }

    if (responseText === '402') {
      return {
        statusCode: 402,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: false,
          error: 'INSUFFICIENT_CREDITS',
          message: 'Saldo o créditos insuficientes en la cuenta de Interconectados.net',
          raw: responseText
        })
      };
    }

    if (responseText === '400') {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: false,
          error: 'MISSING_TEXT',
          message: 'Falta texto en el mensaje SMS',
          raw: responseText
        })
      };
    }

    if (responseText === '405') {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: false,
          error: 'INVALID_DESTINATION',
          message: 'Falta destinatario o número telefónico no reconocido',
          raw: responseText
        })
      };
    }

    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        error: 'GATEWAY_ERROR',
        message: `Error en la pasarela de SMS de Interconectados (Código ${responseText})`,
        raw: responseText
      })
    };

  } catch (networkErr) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        error: 'NETWORK_ERROR',
        message: 'Error de conexión con la pasarela de Interconectados.net',
        details: networkErr.message
      })
    };
  }
};

module.exports = {
  handler,
  sanitizeGsmText,
  sanitizeVenezuelaPhone,
  buildSmsText
};
