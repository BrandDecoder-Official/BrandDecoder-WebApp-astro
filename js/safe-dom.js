/**
 * 將字串轉為可安全插入 HTML 的內容（屬性值或 text 節點仍建議用 textContent）。
 */
function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
