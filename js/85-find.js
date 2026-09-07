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

    let index = null;      // ページごとの文字（ならし済み）。索引ができるまでは null
    let generation = 0;    // 索引を作っている途中に別の資料が読まれたら捨てるための世代
    let hits = [];         // [{page, nth}] nth＝そのページの中で何番目の一致か
    let current = -1;
    let query = '';
    let typeTimer = 0;

    // --- 文字をならす -------------------------------------------------------

    // 日本語のPDFは、同じ字が別のコード（康熙部首・全角英数など）で入っていることがある。
    // 例：「日本語」の「日」が U+2F47（⽇）になっていると、そのままでは見つからない。
    // NFKC でならせば揃うが、**1文字が2文字に化けるもの（㍿・①・合字）があると
    // 印を置く位置がずれる**ので、長さが変わらない置き換えだけを使う。
    // NFKC でも直らない字（部首の形をした別コード。⻑→長 など）の対応表。
    // 上下の並びが1文字ずつ対応している。Unicode の EquivalentUnifiedIdeograph から作った。
    const RADICALS_FROM = '⺁⺂⺃⺄⺅⺆⺈⺉⺊⺋⺌⺍⺎⺏⺐⺒⺓⺔⺖⺗⺘⺙⺛⺜⺝⺞⺠⺡⺢⺣⺤⺥⺦⺧⺨⺩⺫⺬⺭⺯⺰⺱⺲⺳⺴⺶⺹⺺⺻⺼⺾⺿⻀⻁⻂⻃⻄⻅⻆⻈⻉⻋⻌⻍⻎⻏⻐⻑⻒⻓⻔⻖⻗⻘⻙⻚⻛⻜⻝⻟⻠⻢⻣⻤⻥⻦⻧⻨⻩⻪⻫⻬⻭⻮⻯⻰⻱⻲㇏㇐㇑㇒㇓㇔㇖㇚㇝㇟㇠';
    const RADICALS_TO   = '厂乛乚乙亻冂刀刂卜㔾小小兀尣尢巳幺彑忄心扌攵旡日月歺民氵氺灬爫爫丬牛犭王目示礻糹纟罓罒㓁冗羊耂肀聿肉艹艹艹虎衤覀西见角讠贝车辶辶辶邑钅長镸长门阝雨青韦页风飞食飠饣马骨鬼鱼鸟卤麦黄黾斉齐歯齿竜龙龜亀乀一丨丿丿丶乛亅乀乚乙';

    const normCache = new Map();
    function normChar(ch) {
        let v = normCache.get(ch);
        if (v === undefined) {
            const at = RADICALS_FROM.indexOf(ch);
            if (at >= 0) {
                v = RADICALS_TO[at];
            } else {
                const n = ch.normalize('NFKC').toLowerCase();
                v = (n.length === ch.length) ? n : ch;
            }
            normCache.set(ch, v);
        }
        return v;
    }
    function normalizeText(s) {
        let out = '';
        for (const ch of s) out += normChar(ch);
        return out;
    }

    const SPACE_RE = /\s/;   // 全角スペースと NBSP も \s に含まれる
    const isSpace = ch => SPACE_RE.test(ch);

    // 本文の空白は読み飛ばして照合する。PDFは行の折り返しや字送りの都合で
    // 語の途中に空白が入る（「分 散 学 習」「学習の効率、 くりかえし」）。
    // 一致したら終わりの位置を返す。合わなければ -1。
    function matchAt(text, q, start) {
        let i = start, j = 0;
        while (j < q.length) {
            if (isSpace(q[j])) { while (i < text.length && isSpace(text[i])) i++; j++; continue; }
            while (i < text.length && isSpace(text[i])) i++;
            if (i >= text.length || text[i] !== q[j]) return -1;
            i++; j++;
        }
        return i;
    }

    // 1ページ分の一致をすべて拾う。索引でも画面でも同じ数え方をするので、
    // 「そのページの n 番目」で両者が突き合う。
    function eachMatch(text, q, fn) {
        if (!q) return;
        let n = 0;
        for (let at = 0; at < text.length; at++) {
            if (isSpace(text[at])) continue;
            const end = matchAt(text, q, at);
            if (end <= at) continue;
            fn(at, end, n);
            n++;
            at = end - 1;   // 重なりは数えない（Chrome と同じ）
        }
    }

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
                pages.push(normalizeText(tc.items.map(it => it.str).join('')));
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
            eachMatch(text, q, (at, end, n) => out.push({ page: i + 1, nth: n }));
        });
        return out;
    }

    function updateCount() {
        countEl.innerText = hits.length ? `${current + 1}/${hits.length}` : (query ? '0/0' : '0/0');
        bar.classList.toggle('no-hit', !!query && hits.length === 0);
    }

    async function runSearch(keepPosition) {
        const q = normalizeText(input.value);
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

    // 日本語のPDFは1文字ずつ区切られていることが多く、そのままだと文字の数だけ
    // 小さい四角が並んで見苦しい。**同じ行に並んでいるものは1つにつなぐ**。
    // 縦書きは上下がずれるのでまとまらず、これまでどおり文字ごとになる。
    function mergeRects(rects) {
        const rows = [];
        for (const r of rects) {
            if (r.width <= 0 || r.height <= 0) continue;
            const near = rows.find(x =>
                Math.abs(x.top - r.top) < r.height * 0.5 &&
                Math.abs(x.bottom - r.bottom) < r.height * 0.5);
            if (near) {
                near.left = Math.min(near.left, r.left);
                near.right = Math.max(near.right, r.right);
                near.top = Math.min(near.top, r.top);
                near.bottom = Math.max(near.bottom, r.bottom);
            } else {
                rows.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
            }
        }
        return rows;
    }

    // ページの中に印を置く。座標はページを基準にした拡大前の値なので、
    // 拡大・縮小しても紙と一緒に動く（描き直しは要らない）。
    function paintPage(pageDiv, currentNth) {
        const layer = pageDiv.querySelector('.textLayer');
        if (!layer || !query) return null;
        const { nodes, text } = textNodesOf(layer);
        const low = normalizeText(text);
        const base = pageDiv.getBoundingClientRect();
        const z = (typeof zoomLevel === 'number' && zoomLevel > 0) ? zoomLevel : 1;
        let currentTop = null;

        eachMatch(low, query, (at, end, n) => {
            const a = locate(nodes, at), b = locate(nodes, end);
            if (a && b) {
                const range = document.createRange();
                try {
                    range.setStart(a.node, a.offset);
                    range.setEnd(b.node, b.offset);
                    const isCurrent = (n === currentNth);
                    for (const r of mergeRects(range.getClientRects())) {
                        const mark = document.createElement('div');
                        mark.className = 'find-hit' + (isCurrent ? ' current' : '');
                        mark.style.left = ((r.left - base.left) / z) + 'px';
                        mark.style.top = ((r.top - base.top) / z) + 'px';
                        mark.style.width = ((r.right - r.left) / z) + 'px';
                        mark.style.height = ((r.bottom - r.top) / z) + 'px';
                        pageDiv.appendChild(mark);
                        if (isCurrent && currentTop === null) currentTop = (r.top - base.top) / z;
                    }
                } catch (_) { /* 文字の並びが変わっている時は飛ばす */ }
            }
        });
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
