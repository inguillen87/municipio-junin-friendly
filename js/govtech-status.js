document.addEventListener('DOMContentLoaded', function() {
    const statusWidget = document.createElement('div');
    statusWidget.id = 'govtech-status-widget';
    statusWidget.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: rgba(13,21,38,0.85);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(59,130,246,0.3);
        padding: 8px 14px;
        border-radius: 20px;
        display: flex;
        align-items: center;
        gap: 10px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 11px;
        color: #94a3b8;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        z-index: 9998;
        transition: all 0.3s ease;
        cursor: pointer;
    `;

    const pulseDot = document.createElement('div');
    pulseDot.style.cssText = `
        width: 8px;
        height: 8px;
        background-color: #10b981;
        border-radius: 50%;
        box-shadow: 0 0 8px #10b981;
        animation: pulseStatus 2s infinite;
    `;

    const statusText = document.createElement('span');
    statusText.innerHTML = `<strong>MuniCloud</strong> <span style="color:#10b981">Online</span>`;

    const latencyText = document.createElement('span');
    latencyText.style.cssText = `
        border-left: 1px solid rgba(255,255,255,0.1);
        padding-left: 10px;
        color: #60a5fa;
    `;
    
    statusWidget.appendChild(pulseDot);
    statusWidget.appendChild(statusText);
    statusWidget.appendChild(latencyText);
    document.body.appendChild(statusWidget);

    // Add animation styles
    const style = document.createElement('style');
    style.innerHTML = `
        @keyframes pulseStatus {
            0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
            70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
            100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
        #govtech-status-widget:hover {
            transform: translateY(-2px);
            background: rgba(13,21,38,0.95);
            border-color: rgba(59,130,246,0.6);
        }
        @media (max-width: 768px) {
            #govtech-status-widget {
                bottom: 70px; /* Above the mobile nav */
                right: 10px;
                padding: 6px 10px;
                font-size: 10px;
            }
        }
    `;
    document.head.appendChild(style);

    // Mock latency variations
    setInterval(() => {
        const ping = Math.floor(Math.random() * 15) + 8;
        latencyText.innerText = ping + 'ms';
        if (ping > 20) {
            pulseDot.style.backgroundColor = '#f59e0b';
            pulseDot.style.boxShadow = '0 0 8px #f59e0b';
        } else {
            pulseDot.style.backgroundColor = '#10b981';
            pulseDot.style.boxShadow = '0 0 8px #10b981';
        }
    }, 3500);
});
