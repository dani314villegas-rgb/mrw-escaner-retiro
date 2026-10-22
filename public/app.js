/**
 * MRW Envíos Venezuela - PWA de Retiro de Encomiendas y Notificaciones SMS
 * Lógica del Cliente: Escáner QR, Tabs, Envío Serverless, Web Audio y LocalStorage
 */

document.addEventListener('DOMContentLoaded', () => {
  // Tabs y Secciones
  const tabScan = document.getElementById('tabScan');
  const tabManual = document.getElementById('tabManual');
  const sectionScan = document.getElementById('sectionScan');
  const sectionManual = document.getElementById('sectionManual');

  // Formulario Manual
  const formManual = document.getElementById('formManual');
  const inputTracking = document.getElementById('inputTracking');
  const inputClientName = document.getElementById('inputClientName');
  const inputPhone = document.getElementById('inputPhone');
  const btnManualSubmit = document.getElementById('btnManualSubmit');

  // Panel de Resultados (Datos Detectados)
  const originBadge = document.getElementById('originBadge');
  const valTracking = document.getElementById('valTracking');
  const valClientName = document.getElementById('valClientName');
  const valPhone = document.getElementById('valPhone');
  const statusBanner = document.getElementById('statusBanner');
  const statusIcon = document.getElementById('statusIcon');
  const statusTitle = document.getElementById('statusTitle');
  const statusDesc = document.getElementById('statusDesc');
  const btnActionSend = document.getElementById('btnActionSend');

  // Simulador de Pruebas
  const btnSimJson = document.getElementById('btnSimJson');
  const btnSimPipe = document.getElementById('btnSimPipe');
  const btnSimComma = document.getElementById('btnSimComma');

  // Historial
  const historyList = document.getElementById('historyList');
  const historyCount = document.getElementById('historyCount');
  const scanStatusHint = document.getElementById('scanStatusHint');

  // Estado en Memoria
  let currentPackage = null;
  let isSending = false;
  let qrScannerInstance = null;
  let isScanningActive = false;

  // Cargar Historial Persistente (mrw_sms_history)
  let historyData = [];
  try {
    historyData = JSON.parse(localStorage.getItem('mrw_sms_history') || '[]');
  } catch (e) {
    historyData = [];
  }
  renderHistory();

  // ==========================================================================
  // NAVEGACIÓN ENTRE TABS (Escáner QR / Carga Manual)
  // ==========================================================================

  tabScan.addEventListener('click', () => {
    tabScan.classList.add('active');
    tabManual.classList.remove('active');
    sectionScan.classList.remove('hidden');
    sectionManual.classList.add('hidden');
    if (!isScanningActive) {
      startQrScanner();
    }
  });

  tabManual.addEventListener('click', () => {
    tabManual.classList.add('active');
    tabScan.classList.remove('active');
    sectionManual.classList.remove('hidden');
    sectionScan.classList.add('hidden');
    stopQrScanner();
  });

  // ==========================================================================
  // SEÑAL AUDITIVA SINTÉTICA (Web Audio API)
  // ==========================================================================

  function playTone(freq = 880, duration = 0.15, type = 'sine') {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      console.warn('AudioContext no inicializado:', e);
    }
  }

  function playDetectionBeep() {
    playTone(784, 0.1, 'sine'); // G5
    setTimeout(() => playTone(1046.5, 0.18, 'sine'), 110); // C6
  }

  function playErrorBeep() {
    playTone(220, 0.25, 'sawtooth');
  }

  // ==========================================================================
  // PARSER DE CÓDIGOS QR (JSON, Tubería |, Coma ,)
  // ==========================================================================

  function parseQrText(rawText) {
    if (!rawText || typeof rawText !== 'string') return null;
    const text = rawText.trim();

    // 1. Formato JSON
    if (text.startsWith('{') && text.endsWith('}')) {
      try {
        const obj = JSON.parse(text);
        const tracking = (obj.tracking || obj.guia || obj.track || '').toString().trim();
        const clientName = (obj.name || obj.clientName || obj.nombre || obj.cliente || '').toString().trim();
        const phone = (obj.phone || obj.phonenumber || obj.telefono || obj.celular || '').toString().trim();

        if (tracking && clientName && phone) {
          return { tracking, clientName, phone, format: 'Formato: JSON' };
        }
      } catch (err) {}
    }

    // 2. Formato Tubería: TRACKING|NOMBRE|TELEFONO
    if (text.includes('|')) {
      const parts = text.split('|').map(s => s.trim());
      if (parts.length >= 3 && parts[0] && parts[1] && parts[2]) {
        return {
          tracking: parts[0],
          clientName: parts[1],
          phone: parts[2],
          format: 'TUBERÍA (|)'
        };
      }
    }

    // 3. Formato Coma: TRACKING,NOMBRE,TELEFONO
    if (text.includes(',')) {
      const parts = text.split(',').map(s => s.trim());
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

  // ==========================================================================
  // ACTUALIZACIÓN DE INTERFAZ Y DATOS DETECTADOS
  // ==========================================================================

  function displayDetectedPackage(pkg) {
    currentPackage = pkg;
    valTracking.textContent = pkg.tracking;
    valClientName.textContent = pkg.clientName;
    valPhone.textContent = pkg.phone;
    originBadge.textContent = pkg.format;
    btnActionSend.disabled = false;

    // Emite tono sintético breve de detección
    playDetectionBeep();
  }

  function setBannerStatus(type, title, desc) {
    statusBanner.className = `status-banner ${type}`;
    statusTitle.textContent = title;
    statusDesc.textContent = desc;

    if (type === 'idle') statusIcon.textContent = '📦';
    if (type === 'processing') statusIcon.textContent = '⏳';
    if (type === 'success') statusIcon.textContent = '✅';
    if (type === 'danger') statusIcon.textContent = '❌';
  }

  // ==========================================================================
  // LLAMADA HTTP A LA NETLIFY FUNCTION (send-sms)
  // ==========================================================================

  async function sendNotificationSms(pkg) {
    if (!pkg || isSending) return;

    isSending = true;
    btnActionSend.disabled = true;
    btnManualSubmit.disabled = true;
    setBannerStatus('processing', 'Enviando Notificación SMS...', `Despachando mensaje de retiro a ${pkg.clientName}...`);

    try {
      const response = await fetch('/.netlify/functions/send-sms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phonenumber: pkg.phone,
          tracking: pkg.tracking,
          clientName: pkg.clientName
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        const phoneFormatted = (data.data && data.data.phonenumber) || pkg.phone;
        setBannerStatus(
          'success',
          '¡SMS Enviado con Éxito!',
          `Notificación entregada al cliente ${pkg.clientName} (${phoneFormatted}). Gateway: ${data.raw || '200'}.`
        );

        // Guardar en Historial Local (Éxito)
        addHistoryRecord({
          tracking: pkg.tracking,
          clientName: pkg.clientName,
          phone: phoneFormatted,
          status: 'SMS OK',
          isSuccess: true,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        });

      } else {
        const errorMsg = data.message || 'Error al comunicar con la pasarela de SMS.';
        setBannerStatus('danger', 'Error en el Envío', errorMsg);
        playErrorBeep();

        // Guardar en Historial Local (Fallo)
        addHistoryRecord({
          tracking: pkg.tracking,
          clientName: pkg.clientName,
          phone: pkg.phone,
          status: 'ERROR',
          isSuccess: false,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        });
      }

    } catch (err) {
      console.error('Error de red al llamar a send-sms:', err);
      setBannerStatus('danger', 'Fallo de Conexión', 'No se pudo conectar con /.netlify/functions/send-sms.');
      playErrorBeep();
    } finally {
      isSending = false;
      btnActionSend.disabled = false;
      btnManualSubmit.disabled = false;
    }
  }

  // Botón Reintentar / Enviar SMS
  btnActionSend.addEventListener('click', () => {
    if (currentPackage) {
      sendNotificationSms(currentPackage);
    }
  });

  // Envío del Formulario Manual
  formManual.addEventListener('submit', (e) => {
    e.preventDefault();
    const tracking = inputTracking.value.trim();
    const clientName = inputClientName.value.trim();
    const phone = inputPhone.value.trim();

    if (!tracking || !clientName || !phone) return;

    const manualPkg = {
      tracking,
      clientName,
      phone,
      format: 'MANUAL'
    };

    displayDetectedPackage(manualPkg);
    sendNotificationSms(manualPkg);
  });

  // ==========================================================================
  // GESTIÓN DEL HISTORIAL LOCAL (localStorage: mrw_sms_history)
  // ==========================================================

  function addHistoryRecord(record) {
    historyData.unshift(record);
    if (historyData.length > 20) {
      historyData.pop();
    }
    localStorage.setItem('mrw_sms_history', JSON.stringify(historyData));
    renderHistory();
  }

  function renderHistory() {
    if (!historyList) return;
    historyCount.textContent = `${historyData.length} paquetes`;

    if (historyData.length === 0) {
      historyList.innerHTML = `
        <li style="text-align: center; color: var(--text-dim); padding: 1.5rem 0; font-size: 0.85rem;">
          No hay paquetes notificados en esta sesión.
        </li>
      `;
      return;
    }

    historyList.innerHTML = historyData.map(item => `
      <li class="history-item">
        <div>
          <span class="history-track">${escapeHtml(item.tracking)}</span>
          <span class="history-client">• ${escapeHtml(item.clientName)}</span>
          <span style="font-size: 0.75rem; color: var(--text-dim); margin-left: 0.25rem;">(${escapeHtml(item.phone)})</span>
        </div>
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span class="history-time">${escapeHtml(item.time)}</span>
          <span class="${item.isSuccess ? 'badge-success' : 'badge-danger'}">
            ${escapeHtml(item.status)}
          </span>
        </div>
      </li>
    `).join('');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ==========================================================================
  // SIMULADOR DE FORMATOS QR (Prueba Rápida)
  // ==========================================================================

  btnSimJson.addEventListener('click', () => {
    const rawJson = JSON.stringify({
      tracking: "MRW-CCS-098214",
      name: "Maria Perez",
      phone: "04141234567"
    });
    const parsed = parseQrText(rawJson);
    if (parsed) {
      displayDetectedPackage(parsed);
      sendNotificationSms(parsed);
    }
  });

  btnSimPipe.addEventListener('click', () => {
    const rawPipe = "MRW-VAL-448190|Carlos Mendoza|04121234567";
    const parsed = parseQrText(rawPipe);
    if (parsed) {
      displayDetectedPackage(parsed);
      sendNotificationSms(parsed);
    }
  });

  btnSimComma.addEventListener('click', () => {
    const rawComma = "MRW-MAR-331201,José Gregorio Hernández,04126901682";
    const parsed = parseQrText(rawComma);
    if (parsed) {
      displayDetectedPackage(parsed);
      sendNotificationSms(parsed);
    }
  });

  // ==========================================================================
  // INICIALIZACIÓN DEL ESCÁNER HTML5-QRCODE
  // ==========================================================================

  function onScanSuccess(decodedText) {
    if (isSending) return;
    const parsed = parseQrText(decodedText);
    if (parsed) {
      displayDetectedPackage(parsed);
      sendNotificationSms(parsed);
    } else {
      setBannerStatus('danger', 'Formato QR Inválido', 'El QR no contiene un formato reconocido (JSON, Tubería o Coma).');
    }
  }

  function startQrScanner() {
    if (typeof Html5Qrcode === 'undefined') {
      scanStatusHint.textContent = 'Librería no cargada';
      return;
    }

    if (!qrScannerInstance) {
      qrScannerInstance = new Html5Qrcode("reader");
    }

    const config = {
      fps: 15,
      qrbox: { width: 220, height: 220 },
      aspectRatio: 1.0
    };

    qrScannerInstance.start(
      { facingMode: "environment" },
      config,
      onScanSuccess,
      () => {
        // Frames continuos sin QR
      }
    ).then(() => {
      isScanningActive = true;
      scanStatusHint.textContent = 'Cámara Activa';
    }).catch(err => {
      console.warn('No se pudo acceder a la cámara trasera directa, intentando selector general:', err);
      // Fallback a primera cámara disponible
      Html5Qrcode.getCameras().then(cameras => {
        if (cameras && cameras.length) {
          qrScannerInstance.start(
            cameras[0].id,
            config,
            onScanSuccess,
            () => {}
          ).then(() => {
            isScanningActive = true;
            scanStatusHint.textContent = 'Cámara Activa';
          }).catch(e => {
            scanStatusHint.textContent = 'Permiso Requerido';
          });
        }
      }).catch(() => {
        scanStatusHint.textContent = 'Sin Permisos';
      });
    });
  }

  function stopQrScanner() {
    if (qrScannerInstance && isScanningActive) {
      qrScannerInstance.stop().then(() => {
        isScanningActive = false;
        scanStatusHint.textContent = 'En Pausa';
      }).catch(e => {
        console.warn('Error al detener escáner:', e);
      });
    }
  }

  // Iniciar escáner al cargar la app
  startQrScanner();
});
