# -*- coding: utf-8 -*-
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
admin = ROOT / "admin.html"
text = admin.read_text(encoding="utf-8")

snippet = """
                <h3 style="font-size: 15px; color: #555; margin: 24px 0 8px 0;">💰 成本總覽（預估）</h3>
                <p class="cost-note" id="cost-disclaimer">載入中…</p>
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px; flex-wrap:wrap;">
                    <label style="font-size:13px;">統計區間</label>
                    <select id="cost-period-days" style="padding:6px 10px; border:1px solid var(--border); border-radius:4px;">
                        <option value="7">近 7 天</option>
                        <option value="30" selected>近 30 天</option>
                        <option value="90">近 90 天</option>
                    </select>
                    <button class="btn-primary" type="button" onclick="loadCostOverview()">重新計算</button>
                </div>
                <div class="cost-grid">
                    <div class="cost-card ai"><div class="label">AI Token 成本（預估）</div><div class="value" id="cost-ai">--</div><div class="sub" id="cost-ai-sub"></div></div>
                    <div class="cost-card total"><motion class="label">期間總成本（預估）</div><div class="value" id="cost-total">--</div><div class="sub" id="cost-total-sub"></div></div>
                    <div class="cost-card revenue"><div class="label">期間儲值收入</div><div class="value" id="cost-revenue-period">--</div><div class="sub" id="cost-revenue-sub"></div></div>
                    <div class="cost-card margin"><div class="label">期間毛利（收入－成本）</div><div class="value" id="cost-margin">--</div><div class="sub">僅供營運參考</div></div>
                </div>
                <div style="display:flex; gap:20px; flex-wrap:wrap; margin-bottom:20px;">
                    <div style="flex:1; min-width:280px;">
                        <h4 style="margin:0 0 8px 0; font-size:13px;">依服務類型（Token / 台幣）</h4>
                        <table class="cost-table"><thead><tr><th>服務</th><th>次數</th><th>In</th><th>Out</th><th>預估 NT$</th></tr></thead><tbody id="cost-by-service"></tbody></table>
                    </div>
                    <div style="flex:1; min-width:280px;">
                        <h4 style="margin:0 0 8px 0; font-size:13px;">依模型</h4>
                        <table class="cost-table"><thead><tr><th>模型</th><th>次數</th><th>In</th><th>Out</th><th>預估 NT$</th></tr></thead><tbody id="cost-by-model"></tbody></table>
                    </div>
                </div>
                <h4 style="margin:0 0 8px 0; font-size:13px;">基礎設施月費預估（依區間按比例攤提）</h4>
                <table class="cost-table" style="margin-bottom:24px;"><thead><tr><th>項目</th><th>月預估 NT$</th><th>本期攤提 NT$</th><th>說明</th></tr></thead><tbody id="cost-infra-body"></tbody></table>

"""
snippet = snippet.replace("</motion>", "</div>").replace("<motion ", "<div ").replace("<motion>", "<motion>")

js = """
        const SERVICE_LABELS = { tarot: '塔羅', ziwei: '紫微', numerology: '律動', daily_draw: '每日一抽', face: '面手相', other: '其他' };

        function fmtTwd(n) { return 'NT$ ' + Number(n || 0).toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

        function fillCostTable(tbodyId, mapObj) {
            const tbody = document.getElementById(tbodyId);
            if (!tbody) return;
            tbody.innerHTML = '';
            const keys = Object.keys(mapObj || {}).sort((a, b) => (mapObj[b].costTwd || 0) - (mapObj[a].costTwd || 0));
            if (!keys.length) {
                tbody.innerHTML = '<tr><td colspan="5" style="color:#888;">此區間尚無 Token 紀錄</td></tr>';
                return;
            }
            keys.forEach((k) => {
                const row = mapObj[k];
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${SERVICE_LABELS[k] || k}</td><td>${row.calls}</td><td>${row.tokensIn.toLocaleString()}</td><td>${row.tokensOut.toLocaleString()}</td><td>${fmtTwd(row.costTwd)}</td>`;
                tbody.appendChild(tr);
            });
        }

        window.loadCostOverview = async function() {
            if (!currentIdToken || !API_URL) return;
            const days = document.getElementById('cost-period-days')?.value || '30';
            try {
                const response = await fetch(`${API_URL}/api/admin/cost-overview?days=${days}`, {
                    headers: { 'Authorization': `Bearer ${currentIdToken}` }
                });
                const result = await response.json();
                if (!result.success) throw new Error(result.msg || '載入失敗');
                const d = result.data;
                document.getElementById('cost-disclaimer').textContent = d.disclaimer || '';
                document.getElementById('cost-ai').textContent = fmtTwd(d.cost.aiTwd);
                document.getElementById('cost-ai-sub').textContent = `In ${d.ai.tokensIn.toLocaleString()} / Out ${d.ai.tokensOut.toLocaleString()} · ${d.ai.callsWithMetrics} 筆有 Token · 匯率 ${d.usdToTwd} TWD/USD`;
                document.getElementById('cost-total').textContent = fmtTwd(d.cost.totalPeriodTwd);
                document.getElementById('cost-total-sub').textContent = `含基礎設施攤提 · 掃描 ${d.scan.scanned} 筆日誌`;
                document.getElementById('cost-revenue-period').textContent = fmtTwd(d.revenue.totalTwd);
                document.getElementById('cost-revenue-sub').textContent = `${d.revenue.orderCount} 筆成功訂單`;
                const marginEl = document.getElementById('cost-margin');
                marginEl.textContent = fmtTwd(d.cost.marginTwd);
                marginEl.style.color = d.cost.marginTwd >= 0 ? 'var(--success)' : 'var(--danger)';
                fillCostTable('cost-by-service', d.ai.byService);
                fillCostTable('cost-by-model', d.ai.byModel);
                const infraBody = document.getElementById('cost-infra-body');
                infraBody.innerHTML = '';
                (d.infra || []).forEach((row) => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `<td>${row.name}</td><td>${row.dynamic ? fmtTwd(d.cost.aiTwd) : fmtTwd(row.monthlyTwd)}</td><td>${fmtTwd(row.periodTwd)}</td><td style="color:#888;font-size:11px;">${row.note || ''}</td>`;
                    infraBody.appendChild(tr);
                });
            } catch (e) {
                console.error(e);
                document.getElementById('cost-disclaimer').textContent = '成本資料載入失敗：' + e.message;
            }
        };

"""

anchor = '                <div class="chart-container">'
if snippet.strip() and anchor in text and "cost-disclaimer" not in text:
    text = text.replace(anchor, snippet + anchor, 1)

if "cost-grid" not in text and ".cost-grid" in text:
    pass

# table header
text = text.replace(
    "<th>摘要 / 用戶 ID</th>",
    "<th>AI / Token / 成本</th>\n                                <th>摘要 / 用戶 ID</th>",
    1,
)

# colspan empty logs
text = text.replace("colspan='4'", "colspan='5'", 1)

# renderLogTable token - use metricsNormalized
old_token = """                let tokenBadge = "";
                if (log.metrics && log.metrics.model) {
                    tokenBadge = `<br><span style="color:#8E24AA; font-size:11px; background:#F3E5F5; padding:2px 6px; border-radius:4px; margin-top:4px; display:inline-block;">
                        🤖 ${log.metrics.model} | Token消耗: ${log.metrics.tokens_in} In / ${log.metrics.tokens_out} Out
                    </span>`;
                }"""
new_token = """                let tokenBadge = "";
                const m = log.metricsNormalized || (log.metrics ? null : null);
                if (m && m.model) {
                    tokenBadge = `<br><span style="color:#8E24AA; font-size:11px; background:#F3E5F5; padding:2px 6px; border-radius:4px; margin-top:4px; display:inline-block;">
                        🤖 ${m.model} | In ${m.tokens_in} / Out ${m.tokens_out} / 計 ${m.tokens_total} · 預估 ${fmtTwd(m.cost_twd)}
                    </span>`;
                } else if (log.metrics && log.metrics.model) {
                    tokenBadge = `<br><span style="color:#888; font-size:11px;">🤖 ${log.metrics.model}（無 Token 明細）</span>`;
                }"""
if old_token in text:
    text = text.replace(old_token, new_token, 1)

# add fmtTwd before renderLogTable if needed
if "function fmtTwd" not in text:
    text = text.replace("function renderLogTable(logs) {", "function fmtTwd(n) { return 'NT$ ' + Number(n || 0).toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }\n\n        function renderLogTable(logs) {", 1)

# table row add ai column
old_row = """                tr.innerHTML = `
                    <td ${rowStyle}>${timeStr}</td>
                    <td ${rowStyle}>${typeBadge}</td>
                    <td ${rowStyle} class="${pointClass}">${pointText}</td>
                    <td ${rowStyle}>"""
new_row = """                tr.innerHTML = `
                    <td ${rowStyle}>${timeStr}</td>
                    <td ${rowStyle}>${typeBadge}</td>
                    <td ${rowStyle} class="${pointClass}">${pointText}</td>
                    <td ${rowStyle} style="font-size:11px;max-width:140px;">${tokenBadge || '-'}</td>
                    <td ${rowStyle}>"""
if old_row in text and "max-width:140px" not in text:
    text = text.replace(old_row, new_row, 1)

if "window.loadCostOverview" not in text:
    text = text.replace("window.loadOverview = async function() {", js + "\n        window.loadOverview = async function() {", 1)

if "loadCostOverview();" not in text:
    text = text.replace(
        'document.getElementById("kpi-revenue").innerText = `$ ${data.totalRevenue}`;',
        'document.getElementById("kpi-revenue").innerText = `$ ${data.totalRevenue}`;\n                    loadCostOverview();',
        1,
    )

admin.write_text(text, encoding="utf-8")
print("patched admin.html")
