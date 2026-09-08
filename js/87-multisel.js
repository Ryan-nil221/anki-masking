// 複数選んだ時に、選んだもの全部を1つの枠で囲む（09-08 Rayan様）。
// 枠の中の空いた所を掴むと、まとめて動かせる。
// 枠は要素より下に敷くので、中の物を直接掴む今までの操作はそのまま効く。
(() => {
    const PAD = 4;          // 中身に少しだけ余白を持たせる
    let box = null;

    function ensure() {
        if (box && box.isConnected) return box;
        box = document.createElement('div');
        box.id = 'multi-sel-box';
        workspace.appendChild(box);
        return box;
    }

    // 選んでいるもの全部を包む四角（workspace の座標）。2つ以上ある時だけ返す。
    function bounds() {
        const wsRect = workspace.getBoundingClientRect();
        const z = zoomLevel || 1;
        let n = 0, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const add = (l, t, r, b) => {
            n++;
            if (l < minX) minX = l; if (t < minY) minY = t;
            if (r > maxX) maxX = r; if (b > maxY) maxY = b;
        };
        selectedElements.forEach(el => {
            const r = el.getBoundingClientRect();
            add((r.left - wsRect.left) / z, (r.top - wsRect.top) / z,
                (r.right - wsRect.left) / z, (r.bottom - wsRect.top) / z);
        });
        // 範囲選択に入った手書き線も同じ枠に入れる
        if (typeof selectedStrokes !== 'undefined' && selectedStrokes.length
            && typeof strokeWorkspaceBBox === 'function') {
            selectedStrokes.forEach(s => {
                const bb = strokeWorkspaceBBox(s);
                if (bb) add(bb.left, bb.top, bb.right, bb.bottom);
            });
        }
        return n >= 2 ? { minX, minY, maxX, maxY } : null;
    }

    function update() {
        const b = (typeof selectedElements !== 'undefined') ? bounds() : null;
        if (!b) { if (box) box.style.display = 'none'; return; }
        const el = ensure();
        el.style.display = 'block';
        el.style.left = (b.minX - PAD) + 'px';
        el.style.top = (b.minY - PAD) + 'px';
        el.style.width = (b.maxX - b.minX + PAD * 2) + 'px';
        el.style.height = (b.maxY - b.minY + PAD * 2) + 'px';
    }
    window.updateMultiSelBox = update;

    // 押した所がこの枠か（60-input.js から見る）
    window.isMultiSelBox = (node) => !!node && node.id === 'multi-sel-box';
})();
