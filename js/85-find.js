// 資料の中の語句を探す。見た目と操作は Chrome の Ctrl+F に合わせてある。
//   ・探せるのは文字の情報が入っているPDFだけ。写真や未読み込みでは虫眼鏡ごと消す（08-15 Rayan様の指示）
//   ・探す範囲は全ページ。まだ描いていないページも対象にするため、
//     一致の勘定は画面（DOM）ではなくPDFの中身から作った索引で行う
//   ・印はページの上に重ねるだけなので、紙にも書き出しにも残らない
(() => {
    const bar = document.getElementById('find-bar');
    const btnFind = document.getElementById('btn-find');
    const input = document.getElementById('find-input');
    const countEl = document.getElementById('find-count');
    if (!bar || !btnFind || !input) return;

    let index = null;      // ページごとの文字（小文字化済み）。索引ができるまでは null
    let generation = 0;    // 索引を作っている途中に別の資料が読まれたら捨てるための世代
    let hits = [];         // [{page, nth}] nth＝そのページの中で何番目の一致か
    let current = -1;
    let query = '';
    let typeTimer = 0;

    // --- 索引 ---------------------------------------------------------------

    // 画面に出ている文字（span）とここで作る文字を同じ並べ方にしておく。
    // そうしておけば「そのページの n 番目の一致」という数え方だけで両者が突き合う。
    async function buildIndex(pdf, gen) {
        const pages = [];
        for (let i = 1; i <= pdf.numPages; i++) {
            if (gen !== generation) return null;
            try {
                const page = await pdf.getPage(i);
                const tc = await page.getTextContent();
                pages.push(tc.items.map(it => it.str).join('').toLowerCase());
            } catch (_) {
                pages.push('');
            }
        }
        return pages;
    }

    // 資料を読み込み直すたびに呼ばれる。文字が1つも無ければ虫眼鏡を出さない。
    window.resetFind = async function resetFind(isPdf) {
        generation++;
        const gen = generation;
        close();
        index = null;
        btnFind.style.display = 'none';
        if (!isPdf || !window.currentPdfDoc) return;

        const built = await buildIndex(window.currentPdfDoc, gen);
        if (!built || gen !== generation) return;
        index = built;
        if (built.some(t => t.trim().length > 0)) btnFind.style.display = '';
    };

    // --- 探す ---------------------------------------------------------------

    function searchAll(q) {
        const out = [];
        if (!index || !q) return out;
        index.forEach((text, i) => {
            let from = 0, n = 0;
            for (;;) {
                const at = text.indexOf(q, from);
                if (at < 0) break;
                out.push({ page: i + 1, nth: n });
                n++;
                from = at + q.length;   // 重なりは数えない（Chrome と同じ）
            }
        });
        return out;
    }

    function updateCount() {
        countEl.innerText = hits.length ? `${current + 1}/${hits.length}` : (query ? '0/0' : '0/0');
        bar.classList.toggle('no-hit', !!query && hits.length === 0);
    }

    async function runSearch(keepPosition) {
        const q = input.value.toLowerCase();
        const same = q === query;
        query = q;
        hits = searchAll(q);
        if (!hits.length) { current = -1; clearMarks(); updateCount(); return; }
        if (!same || !keepPosition || current < 0 || current >= hits.length) current = 0;
        updateCount();
        await showCurrent();
    }

    // --- 印を描く -----------------------------------------------------------

    function clearMarks() {
        document.querySelectorAll('.find-hit').forEach(el => el.remove());
    }

    // ページが描き終わるまで待つ。遠くのページは、まだ文字も絵も用意されていない。
    async function ensurePageReady(pageNum) {
        const div = document.getElementById(`pdf-page-${pageNum}`);
        if (!div) return null;
        for (let i = 0; i < 120; i++) {
            if (div.dataset.rendered === 'true') return div;
            if (div.dataset.rendering !== 'true' && typeof renderPdfPageAsync === 'function') {
                await renderPdfPageAsync(div, zoomLevel);
            } else {
                await new Promise(r => setTimeout(r, 50));
            }
        }
        return div;
    }

    function textNodesOf(layer) {
        const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
        const nodes = [];
        let text = '';
        for (let n; (n = walker.nextNode());) {
            nodes.push({ node: n, start: text.length });
            text += n.nodeValue;
        }
        return { nodes, text };
    }

    function locate(nodes, pos) {
        for (let k = nodes.length - 1; k >= 0; k--) {
            if (nodes[k].start <= pos) return { node: nodes[k].node, offset: pos - nodes[k].start };
        }
        return null;
    }

    // ページの中に印を置く。座標はページを基準にした拡大前の値なので、
    // 拡大・縮小しても紙と一緒に動く（描き直しは要らない）。
    function paintPage(pageDiv, currentNth) {
        const layer = pageDiv.querySelector('.textLayer');
        if (!layer || !query) return null;
        const { nodes, text } = textNodesOf(layer);
        const low = text.toLowerCase();
        const base = pageDiv.getBoundingClientRect();
        const z = (typeof zoomLevel === 'number' && zoomLevel > 0) ? zoomLevel : 1;
        let from = 0, n = 0, currentTop = null;

        for (;;) {
            const at = low.indexOf(query, from);
            if (at < 0) break;
            const a = locate(nodes, at), b = locate(nodes, at + query.length);
            if (a && b) {
                const range = document.createRange();
                try {
                    range.setStart(a.node, a.offset);
                    range.setEnd(b.node, b.offset);
                    const isCurrent = (n === currentNth);
                    for (const r of range.getClientRects()) {
                        if (r.width <= 0 || r.height <= 0) continue;
                        const mark = document.createElement('div');
                        mark.className = 'find-hit' + (isCurrent ? ' current' : '');
                        mark.style.left = ((r.left - base.left) / z) + 'px';
                        mark.style.top = ((r.top - base.top) / z) + 'px';
                        mark.style.width = (r.width / z) + 'px';
                        mark.style.height = (r.height / z) + 'px';
                        pageDiv.appendChild(mark);
                        if (isCurrent && currentTop === null) currentTop = (r.top - base.top) / z;
                    }
                } catch (_) { /* 文字の並びが変わっている時は飛ばす */ }
            }
            n++;
            from = at + query.length;
        }
        return currentTop;
    }

    async function showCurrent() {
        const hit = hits[current];
        if (!hit) return;
        clearMarks();
        const pageDiv = await ensurePageReady(hit.page);
        if (!pageDiv) return;
        const topInPage = paintPage(pageDiv, hit.nth);

        // ページの頭ではなく、一致した所そのものへ寄せる。画面の3分の1あたりに置く。
        const z = (typeof zoomLevel === 'number' && zoomLevel > 0) ? zoomLevel : 1;
        const marginTop = parseFloat(workspaceWrapper.style.marginTop) || 0;
        const offset = (topInPage === null || topInPage === undefined) ? 0 : topInPage;
        const target = (pageDiv.offsetTop + offset) * z + marginTop - workspaceContainer.clientHeight / 3;
        workspaceContainer.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    }

    function step(delta) {
        if (!hits.length) return;
        current = (current + delta + hits.length) % hits.length;
        updateCount();
        showCurrent();
    }

    // --- 開け閉め -----------------------------------------------------------

    function open() {
        if (btnFind.style.display === 'none') return;
        bar.style.display = 'flex';
        input.focus();
        input.select();
        if (input.value) runSearch(true);
    }

    function close() {
        bar.style.display = 'none';
        bar.classList.remove('no-hit');
        clearMarks();
        hits = [];
        current = -1;
        query = '';
    }

    btnFind.addEventListener('click', () => {
        (bar.style.display === 'none') ? open() : close();
    });
    document.getElementById('btn-find-close').addEventListener('click', close);
    document.getElementById('btn-find-next').addEventListener('click', () => step(1));
    document.getElementById('btn-find-prev').addEventListener('click', () => step(-1));

    input.addEventListener('input', () => {
        clearTimeout(typeTimer);
        typeTimer = setTimeout(() => runSearch(false), 150);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? step(-1) : step(1); }
        else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });

    // 窓が開いている間は、入力欄から手が離れていても Esc で閉じる（Chrome と同じ）。
    // ただし文字を書いている最中の Esc は編集を終えるためのものなので、そちらを優先する。
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || bar.style.display === 'none') return;
        const a = document.activeElement;
        const tag = (a && a.tagName || '').toLowerCase();
        if (a && a !== input && (tag === 'input' || tag === 'textarea' || a.isContentEditable)) return;
        e.preventDefault();
        e.stopPropagation();
        close();
    }, true);

    // Ctrl+F はこちらが受け取る。ブラウザの検索窓は出さない（両方出ると混乱するため）。
    // 探せない資料の時は横取りせず、ブラウザに渡す。
    document.addEventListener('keydown', (e) => {
        const cmdOrCtrl = e.ctrlKey || e.metaKey;
        if (!cmdOrCtrl || e.key.toLowerCase() !== 'f') return;
        if (btnFind.style.display === 'none') return;
        e.preventDefault();
        open();
    }, true);
})();
