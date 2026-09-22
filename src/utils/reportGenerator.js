/**
 * EnviroX Executive Report Generator
 * Captures live Chart.js canvases, KPI metrics, and agronomic insights
 * Generates high-resolution, printable HTML/PDF reports with graphs.
 */

export const generateExecutiveReport = ({
    title,
    subtitle,
    reportType = 'daily',
    systemNode = 'EnviroX IoT Station Alpha',
    kpiMetrics = [],
    chartConfigs = [],
    telemetryRows = [],
    recommendations = [],
    alertStatus = 'OPTIMAL'
}) => {
    const reportTypeUpper = reportType.toUpperCase();
    const generatedDate = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    const generatedTime = new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    // Capture chart images from DOM canvases
    const capturedCharts = chartConfigs.map(cfg => {
        const canvas = typeof cfg.canvasId === 'string' ? document.getElementById(cfg.canvasId) : cfg.canvasId;
        let dataUrl = null;
        if (canvas && typeof canvas.toDataURL === 'function') {
            try {
                dataUrl = canvas.toDataURL('image/png', 1.0);
            } catch (err) {
                console.warn(`[Report] Failed to capture canvas #${cfg.canvasId}:`, err);
            }
        }
        return {
            id: cfg.canvasId,
            title: cfg.title || 'Telemetry Chart',
            description: cfg.description || 'Time-series sensor telemetry',
            dataUrl
        };
    }).filter(c => c.dataUrl !== null);

    // Build KPI Cards HTML
    const kpiCardsHtml = kpiMetrics.map(m => `
        <div class="kpi-card ${m.variant || ''}">
            <div class="kpi-label">${m.label}</div>
            <div class="kpi-value">${m.value} <span class="kpi-unit">${m.unit || ''}</span></div>
            ${m.subtext ? `<div class="kpi-subtext">${m.subtext}</div>` : ''}
            ${m.status ? `<span class="kpi-status-chip ${m.statusLevel || 'normal'}">${m.status}</span>` : ''}
        </div>
    `).join('');

    // Build Graphs Grid HTML
    const graphsHtml = capturedCharts.length > 0 ? capturedCharts.map(c => `
        <div class="graph-card">
            <div class="graph-header">
                <div>
                    <h3 class="graph-title">${c.title}</h3>
                    <p class="graph-desc">${c.description}</p>
                </div>
                <span class="graph-badge">Live Sensor Data</span>
            </div>
            <div class="graph-img-container">
                <img src="${c.dataUrl}" alt="${c.title}" class="graph-img" />
            </div>
            <div class="graph-footer">
                <span>Frequency: ${reportTypeUpper} Resolution</span>
                <span>Rendered at: ${generatedTime}</span>
            </div>
        </div>
    `).join('') : `
        <div class="no-graphs-box" style="padding: 24px; text-align: center; color: #64748b; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; grid-column: 1 / -1;">
            <p>No active graph canvases detected at the time of report generation.</p>
        </div>
    `;

    // Build Telemetry Rows HTML
    const telemetryRowsHtml = telemetryRows.map((r, idx) => `
        <tr class="${idx % 2 === 0 ? 'row-even' : 'row-odd'}">
            <td class="col-param"><strong>${r.parameter}</strong></td>
            <td class="col-val"><span class="badge-val">${r.recordedValue}</span></td>
            <td class="col-bench">${r.benchmark || 'N/A'}</td>
            <td class="col-status"><span class="status-tag ${(r.status || 'optimal').toLowerCase()}">${r.status || 'Normal'}</span></td>
            <td class="col-notes">${r.notes || 'Telemetry nominal'}</td>
        </tr>
    `).join('');

    // Build Recommendations HTML
    const recsHtml = recommendations.length > 0 ? `
        <div class="report-section recs-section">
            <div class="section-header">
                <h2>Agronomic & Environmental Intelligence</h2>
                <span class="badge-green">Actionable Directives</span>
            </div>
            <ul class="recs-list">
                ${recommendations.map(rec => `
                    <li class="rec-item">
                        <span class="rec-bullet"></span>
                        <div class="rec-content">
                            <p>${rec}</p>
                        </div>
                    </li>
                `).join('')}
            </ul>
        </div>
    ` : '';

    // Full Report HTML Template
    const reportHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>EnviroX_${reportTypeUpper}_Report_${Date.now()}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #10b981;
            --primary-dark: #059669;
            --primary-light: #ecfdf5;
            --surface: #ffffff;
            --surface-subtle: #f8fafc;
            --border: #e2e8f0;
            --text-main: #0f172a;
            --text-muted: #64748b;
            --accent: #3b82f6;
            --danger: #ef4444;
            --warning: #f59e0b;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background-color: #f1f5f9;
            color: var(--text-main);
            line-height: 1.5;
            padding: 24px 16px;
        }

        .report-toolbar {
            max-width: 1100px;
            margin: 0 auto 20px auto;
            background: #ffffff;
            padding: 12px 20px;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.06);
            display: flex;
            justify-content: space-between;
            align-items: center;
            border: 1px solid var(--border);
        }

        .toolbar-title {
            font-size: 13px;
            font-weight: 700;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .toolbar-actions {
            display: flex;
            gap: 10px;
        }

        .btn-action {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 8px 16px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            border: none;
        }

        .btn-print {
            background: linear-gradient(135deg, #10b981, #059669);
            color: #ffffff;
            box-shadow: 0 2px 8px rgba(16,185,129,0.3);
        }

        .btn-print:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(16,185,129,0.4);
        }

        .btn-download {
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            color: #334155;
        }

        .btn-download:hover {
            background: #e2e8f0;
        }

        .report-page {
            max-width: 1100px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 16px;
            border: 1px solid var(--border);
            box-shadow: 0 10px 30px rgba(0,0,0,0.05);
            padding: 40px;
        }

        /* Header */
        .report-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding-bottom: 24px;
            border-bottom: 2px solid #f1f5f9;
            margin-bottom: 30px;
        }

        .brand-box h1 {
            font-size: 26px;
            font-weight: 800;
            color: #064e3b;
            letter-spacing: -0.5px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .brand-box .badge-station {
            display: inline-block;
            font-size: 11px;
            font-weight: 700;
            background: #ecfdf5;
            color: #047857;
            padding: 3px 8px;
            border-radius: 6px;
            margin-top: 6px;
            border: 1px solid #a7f3d0;
        }

        .brand-box p {
            font-size: 14px;
            color: var(--text-muted);
            margin-top: 4px;
        }

        .meta-box {
            text-align: right;
        }

        .report-type-badge {
            display: inline-block;
            background: linear-gradient(135deg, #0f172a, #1e293b);
            color: #ffffff;
            font-size: 12px;
            font-weight: 800;
            padding: 6px 14px;
            border-radius: 8px;
            letter-spacing: 0.5px;
            text-transform: uppercase;
        }

        .meta-timestamp {
            font-size: 12px;
            color: var(--text-muted);
            margin-top: 8px;
            font-family: 'JetBrains Mono', monospace;
        }

        /* Section Headings */
        .section-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            padding-bottom: 8px;
            border-bottom: 1px solid #f1f5f9;
        }

        .section-header h2 {
            font-size: 16px;
            font-weight: 700;
            color: #1e293b;
            letter-spacing: -0.2px;
        }

        .badge-green {
            font-size: 11px;
            font-weight: 700;
            background: #ecfdf5;
            color: #059669;
            padding: 3px 8px;
            border-radius: 6px;
        }

        /* KPI Grid */
        .kpi-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 16px;
            margin-bottom: 32px;
        }

        .kpi-card {
            background: var(--surface-subtle);
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 16px;
            position: relative;
            transition: all 0.2s;
        }

        .kpi-card.highlight {
            background: #f0fdf4;
            border-color: #bbf7d0;
        }

        .kpi-label {
            font-size: 11px;
            font-weight: 700;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 6px;
        }

        .kpi-value {
            font-size: 24px;
            font-weight: 800;
            color: #0f172a;
            letter-spacing: -0.5px;
        }

        .kpi-unit {
            font-size: 13px;
            font-weight: 600;
            color: var(--text-muted);
        }

        .kpi-subtext {
            font-size: 12px;
            color: var(--text-muted);
            margin-top: 4px;
        }

        .kpi-status-chip {
            display: inline-block;
            font-size: 10px;
            font-weight: 700;
            padding: 2px 6px;
            border-radius: 4px;
            margin-top: 8px;
            text-transform: uppercase;
        }

        .kpi-status-chip.normal, .kpi-status-chip.optimal { background: #dcfce7; color: #15803d; }
        .kpi-status-chip.warning, .kpi-status-chip.medium { background: #fef3c7; color: #b45309; }
        .kpi-status-chip.danger, .kpi-status-chip.high { background: #fee2e2; color: #b91c1c; }

        /* Graphs Grid */
        .graphs-section {
            margin-bottom: 32px;
        }

        .graphs-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 20px;
        }

        @media (max-width: 800px) {
            .graphs-grid {
                grid-template-columns: 1fr;
            }
        }

        .graph-card {
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 16px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.02);
            page-break-inside: avoid;
        }

        .graph-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 12px;
        }

        .graph-title {
            font-size: 14px;
            font-weight: 700;
            color: #1e293b;
        }

        .graph-desc {
            font-size: 11px;
            color: var(--text-muted);
            margin-top: 2px;
        }

        .graph-badge {
            font-size: 10px;
            font-weight: 700;
            background: #f1f5f9;
            color: #475569;
            padding: 2px 6px;
            border-radius: 4px;
        }

        .graph-img-container {
            width: 100%;
            background: #f8fafc;
            border-radius: 8px;
            border: 1px solid #f1f5f9;
            padding: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
        }

        .graph-img {
            width: 100%;
            height: auto;
            max-height: 230px;
            object-fit: contain;
            display: block;
        }

        .graph-footer {
            display: flex;
            justify-content: space-between;
            font-size: 10px;
            color: #94a3b8;
            margin-top: 8px;
            font-family: 'JetBrains Mono', monospace;
        }

        /* Telemetry Table */
        .telemetry-section {
            margin-bottom: 32px;
            page-break-inside: avoid;
        }

        .telemetry-table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            overflow: hidden;
            font-size: 13px;
        }

        .telemetry-table th {
            background: #f8fafc;
            color: #475569;
            font-weight: 700;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            text-align: left;
            padding: 12px 16px;
            border-bottom: 1px solid #e2e8f0;
        }

        .telemetry-table td {
            padding: 10px 16px;
            border-bottom: 1px solid #f1f5f9;
            color: #334155;
        }

        .row-even { background: #ffffff; }
        .row-odd { background: #fafbfc; }

        .col-param { font-weight: 600; color: #0f172a; }
        
        .badge-val {
            font-family: 'JetBrains Mono', monospace;
            font-weight: 700;
            color: #0f172a;
            background: #f1f5f9;
            padding: 2px 6px;
            border-radius: 4px;
        }

        .status-tag {
            display: inline-block;
            font-size: 10px;
            font-weight: 700;
            padding: 2px 6px;
            border-radius: 4px;
            text-transform: uppercase;
        }

        .status-tag.optimal, .status-tag.normal, .status-tag.low { background: #dcfce7; color: #15803d; }
        .status-tag.warning, .status-tag.medium { background: #fef3c7; color: #b45309; }
        .status-tag.high, .status-tag.critical { background: #fee2e2; color: #b91c1c; }

        /* Recommendations */
        .recs-section {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 32px;
            page-break-inside: avoid;
        }

        .recs-list {
            list-style: none;
            display: flex;
            flex-direction: column;
            gap: 10px;
            margin-top: 10px;
        }

        .rec-item {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            font-size: 13px;
            color: #334155;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            padding: 10px 14px;
            border-radius: 8px;
        }

        .rec-bullet {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #10b981;
            margin-top: 6px;
            flex-shrink: 0;
        }

        /* Footer */
        .report-footer {
            border-top: 2px solid #f1f5f9;
            padding-top: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 11px;
            color: #94a3b8;
        }

        .footer-compliance {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .compliance-badge {
            background: #ecfdf5;
            color: #047857;
            font-weight: 700;
            padding: 2px 6px;
            border-radius: 4px;
            border: 1px solid #a7f3d0;
        }

        /* Print Media Styles */
        @media print {
            body {
                background: #ffffff;
                padding: 0;
            }

            .report-toolbar {
                display: none !important;
            }

            .report-page {
                border: none !important;
                box-shadow: none !important;
                padding: 10px !important;
                max-width: 100% !important;
            }

            .graph-card {
                box-shadow: none !important;
                border: 1px solid #cbd5e1 !important;
            }

            .graphs-grid {
                grid-template-columns: repeat(2, 1fr) !important;
                gap: 12px !important;
            }

            .graph-img {
                max-height: 190px !important;
            }
        }
    </style>
</head>
<body>

    <div class="report-toolbar">
        <span class="toolbar-title">EnviroX Executive Telemetry Document • ${reportTypeUpper} Audit</span>
        <div class="toolbar-actions">
            <button class="btn-action btn-print" onclick="window.print()">
                Print / Save as PDF
            </button>
            <button class="btn-action btn-download" id="btnDownloadHtml">
                Save HTML Report
            </button>
        </div>
    </div>

    <div class="report-page">

        <header class="report-header">
            <div class="brand-box">
                <h1>ENVIROX SMART AGRICULTURE</h1>
                <span class="badge-station">${systemNode}</span>
                <p>${title} — ${subtitle}</p>
            </div>
            <div class="meta-box">
                <span class="report-type-badge">${reportTypeUpper} AUDIT REPORT</span>
                <div class="meta-timestamp">${generatedDate}</div>
                <div class="meta-timestamp">${generatedTime}</div>
            </div>
        </header>

        <section class="kpi-section">
            <div class="section-header">
                <h2>Key Telemetry & Operational Indicators</h2>
                <span class="badge-green">Status: ${alertStatus}</span>
            </div>
            <div class="kpi-grid">
                ${kpiCardsHtml}
            </div>
        </section>

        <section class="graphs-section">
            <div class="section-header">
                <h2>Visual Trend Analytics & High-Resolution Sensor Graphs</h2>
                <span class="badge-green">${capturedCharts.length} Charts Captured</span>
            </div>
            <div class="graphs-grid">
                ${graphsHtml}
            </div>
        </section>

        <section class="telemetry-section">
            <div class="section-header">
                <h2>Comprehensive Sensor & Actuator Telemetry Log</h2>
                <span class="badge-green">Calibrated Data</span>
            </div>
            <table class="telemetry-table">
                <thead>
                    <tr>
                        <th>Parameter</th>
                        <th>Recorded Reading</th>
                        <th>Target / Benchmark</th>
                        <th>Condition</th>
                        <th>Analytical Assessment</th>
                    </tr>
                </thead>
                <tbody>
                    ${telemetryRowsHtml}
                </tbody>
            </table>
        </section>

        ${recsHtml}

        <footer class="report-footer">
            <div class="footer-compliance">
                <span class="compliance-badge">VERIFIED</span>
                <span>EnviroX Telemetry System v2.4 • Automated Agricultural Intelligence Node</span>
            </div>
            <div>
                Generated on ${generatedDate} ${generatedTime} | Station: ${systemNode}
            </div>
        </footer>

    </div>

    <script>
        document.getElementById('btnDownloadHtml')?.addEventListener('click', function() {
            const blob = new Blob([document.documentElement.outerHTML], { type: 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'EnviroX_${reportTypeUpper}_Executive_Report.html';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    </script>
</body>
</html>`;

    // Open Report in a new window/tab
    try {
        const reportWindow = window.open('', '_blank');
        if (reportWindow) {
            reportWindow.document.open();
            reportWindow.document.write(reportHtml);
            reportWindow.document.close();
            return true;
        }
    } catch (e) {
        console.warn('[Report] Popup blocked or failed to open window, falling back to download:', e);
    }

    // Fallback: Download HTML file if popup was blocked
    const blob = new Blob([reportHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `EnviroX_${reportTypeUpper}_Report.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
};
