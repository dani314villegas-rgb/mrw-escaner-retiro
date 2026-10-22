# MRW Envíos Venezuela - PWA de Retiro de Encomiendas y Notificaciones SMS

Web App Progresiva (PWA) de alto rendimiento para agencias de encomiendas en Venezuela (**MRW Envíos**). Permite escanear el código QR de un paquete o ingresar sus datos manualmente, notificando automáticamente al cliente vía SMS a través de una función serverless en Netlify (`/.netlify/functions/send-sms`) conectada a la REST API v3.2 de **Interconectados.net**.

---

## 📁 Estructura del Proyecto

```text
/
├── netlify/
│   └── functions/
│       └── send-sms.js        # Proxy Serverless de envío SMS con Interconectados.net
├── public/
│   ├── index.html             # Interfaz PWA con tabs de Escáner y Carga Manual
│   ├── styles.css             # Estilos adaptativos (Mobile & Desktop 1024px Grid)
│   └── app.js                 # Lógica de cliente, parser QR, Web Audio y LocalStorage
├── netlify.toml               # Configuración de Netlify (Publish, Functions, Node 18)
└── package.json               # Configuración básica CommonJS
```

---

## 🚀 Especificaciones y Reglas de Negocio Implementadas

### 1. Función Serverless (`netlify/functions/send-sms.js`)
- **Sanitización Telefónica en Venezuela**:
  - Si el número recibido inicia con `584`, se convierte al formato nacional `04` (ej. `584126901682` -> `04126901682`).
  - Validación estricta con Regex `^04(12|14|16|24|26)[0-9]{7}$` (exactamente 11 dígitos y prefijos móviles válidos en Venezuela). Si no cumple, responde con **HTTP 400**.
- **Mensaje SMS (Norma GSM-7)**:
  - Formato oficial: `"Hola {clientName}, tu paquete {tracking} ya esta listo para retirar en oficina. Te esperamos."`
  - Remueve tildes y diacríticos automáticamente (ej. `José Gregorio Hernández` ➔ `Jose Gregorio Hernandez`).
  - Aplica `encodeURIComponent()` al parámetro `Text`.
- **Conexión a Interconectados.net**:
  - Petición HTTP a `https://www.interconectados.net/api2/?phonenumber={phonenumber}&Text={text}&user=danipruebas&password=f-93ab255620ba12cf6f03b-a66f1c14`
  - Si la pasarela responde con código que inicia o contiene `200` (ej: `200 / 1`), retorna **HTTP 200** con `{ "success": true, "message": "SMS enviado con éxito", "raw": responseText }`.
  - Mapeo de códigos de error específicos: `401` (Credenciales), `402` (Saldo insuficiente), `400` (Falta texto), `405` (Falta destinatario) y `502` (Pasarela).

### 2. Interfaz Web PWA (`public/`)
- **Header Corporativo**: Marca `MRW | Envíos`, subtítulo `Escáner de Retiro - AGENCIA VENEZUELA` y badge `• SMS Activo`.
- **Navegación por Tabs**: Alterna dinámicamente entre `📷 Escáner QR` (`#sectionScan`) y `✍️ Carga Manual` (`#sectionManual`).
- **Lector QR (`html5-qrcode`)**: Contenedor `#reader` para lectura continua en cámara de tablets y móviles.
- **Parser de Formatos QR Soportados**:
  1. **JSON**: `{"tracking": "MRW-CCS-098214", "name": "Maria Perez", "phone": "04141234567"}`
  2. **Tubería (|)**: `MRW-VAL-448190|Carlos Mendoza|04121234567`
  3. **Coma (,)**: `MRW-MAR-331201,José Gregorio Hernández,04126901682`
- **Panel de Datos Detectados**: Muestra Guía, Cliente, Teléfono y Badge de origen (`Formato: JSON`, `TUBERÍA (|)`, `COMA (,)` o `MANUAL`).
- **Botón de Acción**: `✈️ Reintentar / Enviar SMS` con estado de carga y retroalimentación auditiva (Web Audio API).
- **Simulador de Códigos QR**: Botones rápidos para probar los formatos sin cámara física.
- **Historial Persistente**: Guarda los últimos 20 envíos en `localStorage` (`mrw_sms_history`) mostrando estado (`.badge-success` / `.badge-danger`) y hora exacta.
- **Diseño Adaptativo (Escritorio @media 1024px)**: Disposición de dos columnas lado a lado (área de captura a la izquierda y panel de datos detectados a la derecha).

---

## 🧪 Pruebas Automatizadas

```bash
npm test
```

Ejecuta:
- `test-sms.js`: Pruebas unitarias de sanitización `584` -> `04`, remoción de acentos GSM y envío real con código `200 / 1`.
- `test-qr.js`: Pruebas de decodificación y despacho para formatos JSON, Tuberías y Comas.

---

## 💻 Servidor de Desarrollo Local

```bash
npm start
```
Acceso: **http://localhost:3000**
