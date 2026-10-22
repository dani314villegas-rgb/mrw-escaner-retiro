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
