// ============================================================
// ONBOARDING-BOT.JS — MuniBot Floating AI & Interactive Tour
// MuniControl Enterprise v5.0 — Guiado en Pantalla Estilo Mercado Libre
// ============================================================

(function(global) {
  'use strict';

  const MANUALS = {
    INTENDENTE: `
      📌 <strong>Manual de Uso para el Intendente Municipal</strong><br><br>
      • <strong>Tablero Ejecutivo:</strong> Vea en 1 clic los KPIs de ejecución presupuestaria, masa salarial y obras.<br>
      • <strong>Barra de Gestión:</strong> Conmute entre la Gestión Actual (Dic 2023-2026) y la Comparativa de 8 Años.<br>
      • <strong>Paritarias:</strong> Simule aumentos porcentuales y su impacto proyectado antes de firmar dekrets.
    `,
    HACIENDA: `
      📌 <strong>Manual de Uso para Hacienda y Contaduría</strong><br><br>
      • <strong>Presupuesto:</strong> Monitoree el desfasaje presupuestario por partida (en más o en menos).<br>
      • <strong>Exportación:</strong> Exporte informes oficiales en PDF y Excel formateados con membrete municipal.<br>
      • <strong>Ingesta:</strong> Suba nuevas planillas Excel o CSV desde el Centro de Ingesta.
    `,
    RRHH: `
      📌 <strong>Manual de Uso para Recursos Humanos</strong><br><br>
      • <strong>Nómina Completa:</strong> Busque entre los 2.450 legajos reales por DNI, nombre o número de legajo.<br>
      • <strong>Recibo Digital:</strong> Abra la ficha de cualquier empleado y emita el Recibo Oficial con firma QR en 1 clic.<br>
      • <strong>Sectores:</strong> Filtre por las 30 reparticiones municipales reales sanitizadas.
    `
  };

  const TOUR_STEPS = [
    { target: 'gestionPeriodSelect', title: '1. Período de Gestión', text: 'Conmute aquí entre la Gestión Actual (2023-2026) y la Comparativa de 8 Años.' },
    { target: 'roleSwitcherWidget', title: '2. Selector Rápido de Roles', text: 'Haga clic aquí para cambiar en 1 clic entre Intendente, Hacienda, RRHH, Compras, Empleado o Vecino.' },
    { target: 'kpiDesfasaje', title: '3. Desvío Presupuestario', text: 'Monitoree el desfasaje presupuestario en más o en menos en tiempo real.' },
    { target: 'searchInput', title: '4. Búsqueda Instantánea', text: 'Busque empleados, decretos o partidas escribiendo un número o palabra clave.' }
  ];

  let currentTourIndex = 0;

  function initMuniBotWidget() {
    if (document.getElementById('munibotFloatingBtn')) return;

    const btn = document.createElement('button');
    btn.id = 'munibotFloatingBtn';
    btn.style.cssText = `
      position: fixed; bottom: 24px; right: 24px; z-index: 9999;
      background: linear-gradient(135deg, #3b82f6, #8b5cf6);
      border: 1px solid rgba(255,255,255,0.25);
      color: white; width: 56px; height: 56px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 26px; cursor: pointer;
      box-shadow: 0 10px 30px rgba(59,130,246,0.5);
      transition: all 0.25s ease;
    `;
    btn.title = 'MuniBot IA — Guiado Interactivo & Asistencia';
    btn.innerHTML = '🤖';
    btn.onmouseover = () => btn.style.transform = 'scale(1.1)';
    btn.onmouseout = () => btn.style.transform = 'scale(1)';
    btn.onclick = toggleMuniBotPanel;

    document.body.appendChild(btn);
  }

  function toggleMuniBotPanel() {
    let panel = document.getElementById('munibotPanel');
    if (panel) {
      panel.remove();
      return;
    }

    panel = document.createElement('div');
    panel.id = 'munibotPanel';
    panel.style.cssText = `
      position: fixed; bottom: 90px; right: 24px; z-index: 9999;
      width: 380px; max-width: calc(100vw - 48px);
      background: #060b18; border: 1px solid rgba(59,130,246,0.3);
      border-radius: 16px; padding: 20px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.8);
      backdrop-filter: blur(16px); color: #f8fafc;
      animation: fadeIn 0.2s ease-out;
    `;

    panel.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="width:36px; height:36px; border-radius:10px; background:linear-gradient(135deg,#3b82f6,#8b5cf6); display:flex; align-items:center; justify-content:center; font-size:20px;">🤖</div>
          <div>
            <h4 style="font-family:'Outfit',sans-serif; font-size:16px; font-weight:800; margin:0">MuniBot Guía IA</h4>
            <span style="font-size:11px; color:#34d399">● Online · Asistente Municipal</span>
          </div>
        </div>
        <button onclick="document.getElementById('munibotPanel').remove()" style="background:none; border:none; color:#94a3b8; font-size:20px; cursor:pointer">&times;</button>
      </div>

      <div style="display:flex; gap:6px; margin-bottom:14px; background:rgba(255,255,255,0.05); padding:4px; border-radius:10px;">
        <button onclick="window.MuniBot.switchTab('bot')" id="tabBotBtn" style="flex:1; background:rgba(59,130,246,0.3); border:none; color:#fff; padding:6px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer">💬 IA Chat</button>
        <button onclick="window.MuniBot.switchTab('tour')" id="tabTourBtn" style="flex:1; background:none; border:none; color:#94a3b8; padding:6px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer">🎯 Tour Guiado</button>
        <button onclick="window.MuniBot.switchTab('manual')" id="tabManualBtn" style="flex:1; background:none; border:none; color:#94a3b8; padding:6px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer">📘 Manuales</button>
      </div>

      <div id="munibotTabContent">
        <div id="contentBot">
          <div style="height:180px; overflow-y:auto; background:rgba(15,23,42,0.8); border:1px solid rgba(255,255,255,0.06); border-radius:10px; padding:10px; font-size:12px; margin-bottom:10px;" id="botMessages">
            <div style="margin-bottom:8px; color:#60a5fa"><strong>🤖 MuniBot:</strong> ¡Hola! Soy el asistente inteligente del Municipio de Junín. Podés preguntarme sobre el presupuesto 2026, recibos de sueldo, paritarias o licencias.</div>
          </div>
          <div style="display:flex; gap:6px;">
            <input type="text" id="botInput" placeholder="Escriba su consulta..." style="flex:1; background:#0f172a; border:1px solid rgba(255,255,255,0.15); color:#fff; padding:8px 12px; border-radius:8px; font-size:12px; outline:none;" onkeypress="if(event.key==='Enter') window.MuniBot.sendMessage()">
            <button onclick="window.MuniBot.sendMessage()" style="background:#3b82f6; color:#fff; border:none; padding:8px 14px; border-radius:8px; font-weight:700; font-size:12px; cursor:pointer">Enviar</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(panel);
  }

  function switchTab(tab) {
    const container = document.getElementById('munibotTabContent');
    if (!container) return;

    document.getElementById('tabBotBtn').style.background = tab === 'bot' ? 'rgba(59,130,246,0.3)' : 'none';
    document.getElementById('tabTourBtn').style.background = tab === 'tour' ? 'rgba(59,130,246,0.3)' : 'none';
    document.getElementById('tabManualBtn').style.background = tab === 'manual' ? 'rgba(59,130,246,0.3)' : 'none';

    if (tab === 'bot') {
      container.innerHTML = `
        <div style="height:180px; overflow-y:auto; background:rgba(15,23,42,0.8); border:1px solid rgba(255,255,255,0.06); border-radius:10px; padding:10px; font-size:12px; margin-bottom:10px;" id="botMessages">
          <div style="margin-bottom:8px; color:#60a5fa"><strong>🤖 MuniBot:</strong> Podés consultar sobre haberes, decretos, o paritarias.</div>
        </div>
        <div style="display:flex; gap:6px;">
          <input type="text" id="botInput" placeholder="Escriba su consulta..." style="flex:1; background:#0f172a; border:1px solid rgba(255,255,255,0.15); color:#fff; padding:8px 12px; border-radius:8px; font-size:12px; outline:none;" onkeypress="if(event.key==='Enter') window.MuniBot.sendMessage()">
          <button onclick="window.MuniBot.sendMessage()" style="background:#3b82f6; color:#fff; border:none; padding:8px 14px; border-radius:8px; font-weight:700; font-size:12px; cursor:pointer">Enviar</button>
        </div>
      `;
    } else if (tab === 'tour') {
      container.innerHTML = `
        <div style="text-align:center; padding:10px;">
          <h4 style="font-size:14px; font-weight:800; color:#f8fafc; margin-bottom:6px">🎯 Tour Guiado Interactivo</h4>
          <p style="font-size:12px; color:#94a3b8; margin-bottom:16px">Inicie el recorrido animado para aprender a usar la plataforma paso a paso.</p>
          <button onclick="window.MuniBot.startTour()" style="background:linear-gradient(135deg,#3b82f6,#8b5cf6); color:#fff; border:none; padding:10px 20px; border-radius:10px; font-weight:800; font-size:13px; cursor:pointer">⚡ Iniciar Tour en Pantalla</button>
        </div>
      `;
    } else if (tab === 'manual') {
      const user = window.AuthRoles ? window.AuthRoles.getCurrentUser() : { role: 'INTENDENTE' };
      const role = (user.role || 'INTENDENTE').toUpperCase();
      const text = MANUALS[role] || MANUALS.INTENDENTE;
      container.innerHTML = `
        <div style="max-height:210px; overflow-y:auto; font-size:12px; color:#cbd5e1; line-height:1.5; background:rgba(15,23,42,0.8); padding:12px; border-radius:10px; border:1px solid rgba(255,255,255,0.06);">
          ${text}
        </div>
      `;
    }
  }

  let chatHistory = [];

  async function sendMessage() {
    const input = document.getElementById('botInput');
    const box = document.getElementById('botMessages');
    if (!input || !box || !input.value.trim()) return;

    const q = input.value.trim();
    box.innerHTML += `<div style="margin-bottom:8px; text-align:right; color:#a78bfa"><strong>Usted:</strong> ${q}</div>`;
    input.value = '';
    
    // Add user message to history
    chatHistory.push({ role: "user", content: q });

    // Show loading indicator
    const loadingId = 'loading-' + Date.now();
    box.innerHTML += `<div id="${loadingId}" style="margin-bottom:8px; color:#60a5fa"><strong>🤖 MuniBot:</strong> <em>Escribiendo...</em></div>`;
    box.scrollTop = box.scrollHeight;

    try {
      const user = window.AuthRoles ? window.AuthRoles.getCurrentUser() : { role: 'INTENDENTE' };
      const roleStr = user.role || 'Ejecutivo';

      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: chatHistory,
          userRole: roleStr
        })
      });

      const data = await resp.json();
      document.getElementById(loadingId).remove();

      let botReply = data.response || data.fallback || "Error de conexión.";
      
      // format markdown to basic HTML bold/italic for the bot box
      botReply = botReply.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      botReply = botReply.replace(/\*(.*?)\*/g, '<em>$1</em>');
      botReply = botReply.replace(/\n/g, '<br>');

      box.innerHTML += `<div style="margin-bottom:8px; color:#60a5fa"><strong>🤖 MuniBot:</strong> ${botReply}</div>`;
      
      chatHistory.push({ role: "assistant", content: data.response || data.fallback });
      
    } catch (e) {
      document.getElementById(loadingId).remove();
      box.innerHTML += `<div style="margin-bottom:8px; color:#ef4444"><strong>🤖 MuniBot:</strong> Error de red al consultar la IA.</div>`;
    }
    
    box.scrollTop = box.scrollHeight;
  }

  function startTour() {
    currentTourIndex = 0;
    showTourStep();
  }

  function showTourStep() {
    if (currentTourIndex >= TOUR_STEPS.length) {
      if (window.showToast) window.showToast('¡Tour Completo! Ya conoce los puntos clave del sistema.', 'success');
      const pop = document.getElementById('tourPopover');
      if (pop) pop.remove();
      return;
    }

    const step = TOUR_STEPS[currentTourIndex];
    const el = document.getElementById(step.target);

    let pop = document.getElementById('tourPopover');
    if (!pop) {
      pop = document.createElement('div');
      pop.id = 'tourPopover';
      pop.style.cssText = `
        position: fixed; z-index: 99999;
        background: #0f172a; border: 2px solid #3b82f6;
        border-radius: 12px; padding: 16px; width: 280px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.8); color: #f8fafc;
        animation: fadeIn 0.2s ease-out;
      `;
      document.body.appendChild(pop);
    }

    if (el) {
      const rect = el.getBoundingClientRect();
      pop.style.top = (rect.bottom + 10) + 'px';
      pop.style.left = Math.max(10, rect.left) + 'px';
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      pop.style.top = '100px';
      pop.style.left = '100px';
    }

    pop.innerHTML = `
      <div style="font-weight:800; font-size:13px; color:#60a5fa; margin-bottom:4px">${step.title}</div>
      <div style="font-size:12px; color:#cbd5e1; margin-bottom:12px">${step.text}</div>
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:10px; color:#94a3b8">${currentTourIndex + 1} de ${TOUR_STEPS.length}</span>
        <button onclick="window.MuniBot.nextTourStep()" style="background:#3b82f6; color:#fff; border:none; padding:4px 10px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer">Siguiente ➔</button>
      </div>
    `;
  }

  function nextTourStep() {
    currentTourIndex++;
    showTourStep();
  }

  // Auto Init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMuniBotWidget);
  } else {
    initMuniBotWidget();
  }

  global.MuniBot = {
    toggleMuniBotPanel,
    switchTab,
    sendMessage,
    startTour,
    nextTourStep
  };

})(typeof window !== 'undefined' ? window : this);
