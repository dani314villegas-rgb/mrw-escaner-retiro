/**
 * test-sms.js - Suite de pruebas unitarias para send-sms.js
 */

const assert = require('assert');
const {
  handler,
  sanitizeGsmText,
  sanitizeVenezuelaPhone,
  buildSmsText
} = require('./netlify/functions/send-sms.js');

async function runTests() {
  console.log('🧪 Iniciando pruebas de send-sms.js (MRW Envíos)...\n');

  // Test 1: Sanitización de teléfonos venezolanos (584 -> 04)
  console.log('1. Probando sanitización de teléfonos venezolanos...');
  assert.strictEqual(
    sanitizeVenezuelaPhone('584126901682'),
    '04126901682',
    'Debe convertir 584126901682 a formato nacional 04126901682'
  );
  assert.strictEqual(
    sanitizeVenezuelaPhone('+584141234567'),
    '04141234567',
    'Debe limpiar el + inicial y convertir +58414 a 0414'
  );
  assert.strictEqual(
    sanitizeVenezuelaPhone('0416-333-4455'),
    '04163334455',
    'Debe limpiar guiones y conservar formato 0416'
  );
  assert.strictEqual(
    sanitizeVenezuelaPhone('4245551234'),
    '04245551234',
    'Debe anteponer 0 si tiene 10 dígitos iniciando en 4'
  );
  assert.strictEqual(
    sanitizeVenezuelaPhone('04267778899'),
    '04267778899',
    'Debe mantener 0426 válido'
  );
  assert.strictEqual(
    sanitizeVenezuelaPhone('04991234567'),
    null,
    'Debe rechazar prefijos no venezolanos'
  );
  assert.strictEqual(
    sanitizeVenezuelaPhone('02129998877'),
    null,
    'Debe rechazar números fijos'
  );
  console.log('   ✅ Sanitización y validación telefónica aprobada.');

  // Test 2: Sanitización de texto GSM (Remoción de acentos)
  console.log('2. Probando remoción de acentos y caracteres GSM...');
  const rawName = 'José Gregorio Hernández';
  const cleanName = sanitizeGsmText(rawName);
  assert.strictEqual(cleanName, 'Jose Gregorio Hernandez');
  console.log(`   ✅ "${rawName}" -> "${cleanName}"`);

  // Test 3: Construcción de la plantilla SMS
  console.log('3. Probando texto exacto del mensaje SMS...');
  const sms = buildSmsText('José Gregorio Hernández', 'MRW-MAR-331201');
  const expectedSms = 'Hola Jose Gregorio Hernandez, tu paquete MRW-MAR-331201 ya esta listo para retirar en oficina. Te esperamos.';
  assert.strictEqual(sms, expectedSms);
  console.log(`   ✅ Mensaje SMS generado: "${sms}"`);

  // Test 4: Preflight CORS (OPTIONS)
  console.log('4. Probando OPTIONS preflight...');
  const optionsRes = await handler({ httpMethod: 'OPTIONS' });
  assert.strictEqual(optionsRes.statusCode, 204);
  console.log('   ✅ Responde 204 con CORS headers.');

  // Test 5: Validación de campos faltantes
  console.log('5. Probando validación de campos vacíos...');
  const missingRes = await handler({
    httpMethod: 'POST',
    body: JSON.stringify({ phonenumber: '04126901682' })
  });
  assert.strictEqual(missingRes.statusCode, 400);
  console.log('   ✅ Rechaza campos incompletos con 400.');

  // Test 6: Validación de teléfono inválido
  console.log('6. Probando teléfono inválido...');
  const invalidRes = await handler({
    httpMethod: 'POST',
    body: JSON.stringify({
      phonenumber: '04991234567',
      tracking: 'MRW-001',
      clientName: 'Juan'
    })
  });
  assert.strictEqual(invalidRes.statusCode, 400);
  console.log('   ✅ Rechaza teléfono no válido con 400.');

  // Test 7: Envío real a la API de Interconectados.net
  console.log('7. Probando envío oficial a Interconectados.net...');
  const sendRes = await handler({
    httpMethod: 'POST',
    body: JSON.stringify({
      phonenumber: '04126901682',
      tracking: 'MRW-MAR-331201',
      clientName: 'José Gregorio Hernández'
    })
  });
  console.log('   Status Code recibido:', sendRes.statusCode);
  const sendBody = JSON.parse(sendRes.body);
  console.log('   Respuesta:', sendBody);
  assert.strictEqual(sendRes.statusCode, 200);
  assert.strictEqual(sendBody.success, true);
  assert.strictEqual(sendBody.data.phonenumber, '04126901682');
  console.log('   ✅ Envío oficial exitoso a Interconectados.net.');

  console.log('\n🎉 ¡TODAS LAS PRUEBAS DE SEND-SMS PASARON EXITOSAMENTE!');
}

runTests().catch(err => {
  console.error('\n❌ ERROR EN LAS PRUEBAS:', err);
  process.exit(1);
});
