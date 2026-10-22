const { handler } = require('./netlify/functions/send-sms.js');

function parseQRCodeData(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;
  const text = rawText.trim();

  // a) Formato JSON
  if (text.startsWith('{') && text.endsWith('}')) {
    try {
      const data = JSON.parse(text);
      const tracking = (data.tracking || data.guia || data.track || '').toString().trim();
      const clientName = (data.name || data.clientName || data.nombre || data.cliente || '').toString().trim();
      const phone = (data.phone || data.phonenumber || data.telefono || data.celular || '').toString().trim();

      if (tracking && clientName && phone) {
        return { tracking, clientName, phone, format: 'Formato: JSON' };
      }
    } catch (err) {}
  }

  // b1) Separado por tuberías: TRACKING|NOMBRE|TELEFONO
  if (text.includes('|')) {
    const parts = text.split('|').map(p => p.trim());
    if (parts.length >= 3 && parts[0] && parts[1] && parts[2]) {
      return {
        tracking: parts[0],
        clientName: parts[1],
        phone: parts[2],
        format: 'TUBERÍA (|)'
      };
    }
  }

  // b2) Separado por comas: TRACKING,NOMBRE,TELEFONO
  if (text.includes(',')) {
    const parts = text.split(',').map(p => p.trim());
    if (parts.length >= 3 && parts[0] && parts[1] && parts[2]) {
      return {
        tracking: parts[0],
        clientName: parts[1],
        phone: parts[2],
        format: 'COMA (,)'
      };
    }
  }

  return null;
}

async function runQrTests() {
  console.log('🔍 Probando compatibilidad de formatos QR con send-sms.js (MRW Envíos)...\n');

  const samples = [
    {
      name: 'Formato a) JSON',
      qr: '{"tracking": "MRW-CCS-098214", "name": "Maria Perez", "phone": "04141234567"}'
    },
    {
      name: 'Formato b1) Tuberías (|)',
      qr: 'MRW-VAL-448190|Carlos Mendoza|04121234567'
    },
    {
      name: 'Formato b2) Comas (,)',
      qr: 'MRW-MAR-331201,José Gregorio Hernández,584126901682'
    }
  ];

  for (const s of samples) {
    console.log(`➡️ ${s.name}:`);
    const parsed = parseQRCodeData(s.qr);
    if (!parsed) {
      throw new Error(`Fallo al parsear QR: ${s.qr}`);
    }
    console.log(`   Parseado: Tracking=${parsed.tracking}, Cliente=${parsed.clientName}, Teléfono=${parsed.phone} [${parsed.format}]`);

    const res = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({
        phonenumber: parsed.phone,
        tracking: parsed.tracking,
        clientName: parsed.clientName
      })
    });

    if (res.statusCode !== 200) {
      throw new Error(`Error en send-sms: status ${res.statusCode} - ${res.body}`);
    }

    const resBody = JSON.parse(res.body);
    console.log(`   ✅ Éxito: Teléfono sanitizado: ${resBody.data.phonenumber}`);
    console.log(`   Mensaje GSM: "${resBody.data.text}"\n`);
  }

  console.log('🎉 ¡Todos los formatos de códigos QR fueron procesados y validados con éxito!');
}

runQrTests().catch(err => {
  console.error('❌ Error en pruebas QR:', err);
  process.exit(1);
});
