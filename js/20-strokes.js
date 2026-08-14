// ===== 20-strokes.js : 手描きレイヤー(SVG)・消しゴム・ペン線の選択と範囲選択 =====
// app.js を分割したもの。素のスクリプトなので変数は全ファイルで共有される。
// index.html の読み込み順を変えると壊れる。

        // ===== 手描きレイヤー（ベクターSVG） =====
        const SVGNS = 'http://www.w3.org/2000/svg';
        let drawSvgUid = 0;

        // 座標配列から、canvas描画と同じ曲線ロジックでSVGパス文字列を生成
        function strokePathD(pts) {
            if (!pts || pts.length === 0) return '';
            if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y} L ${pts[0].x + 0.01} ${pts[0].y + 0.01}`;
            let d = `M ${pts[0].x} ${pts[0].y}`;
            if (pts.length < 3) {
                d += ` L ${pts[1].x} ${pts[1].y}`;
            } else {
                for (let i = 1; i < pts.length - 1; i++) {
                    const midX = (pts[i].x + pts[i + 1].x) / 2;
                    const midY = (pts[i].y + pts[i + 1].y) / 2;
                    d += ` Q ${pts[i].x} ${pts[i].y} ${midX} ${midY}`;
                }
                d += ` L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`;
            }
            return d;
        }

        // ドラッグ中は点が増えるたびに全点からパスを作り直すと点の数の2乗で重くなる。
        // 末尾の "L 最後の点" を除いた部分を持ち回り、増えたぶんだけ継ぎ足す。
        let livePathPrefix = '';
        function livePathStart(p) {
            livePathPrefix = `M ${p.x} ${p.y}`;
            return strokePathD([p]);
        }
        // pts は追加後の配列（末尾が新しい点）
        function livePathAppend(pts) {
            const n = pts.length;
            const p = pts[n - 1];
            if (n >= 3) {
                const q = pts[n - 2];
                livePathPrefix += ` Q ${q.x} ${q.y} ${(q.x + p.x) / 2} ${(q.y + p.y) / 2}`;
            }
            return `${livePathPrefix} L ${p.x} ${p.y}`;
        }

        // 手描きSVGレイヤーを生成（viewBoxはページのCSS座標系）
        function createDrawSVG(vw, vh) {
            const svg = document.createElementNS(SVGNS, 'svg');
            svg.setAttribute('class', 'drawing-svg');
            svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
            svg.setAttribute('preserveAspectRatio', 'none');
            svg.dataset.uid = (drawSvgUid++);
            return svg;
        }

        // コマンド列からSVGを再構築。消しゴムは時系列マスクで扱い、
        // 「消した後に引いた線は消えない」というラスターと同じ挙動を保つ。
        function renderStrokesToSVG(svg, cmds) {
            if (!svg) return;
            while (svg.firstChild) svg.removeChild(svg.firstChild);
            const vb = svg.viewBox.baseVal;
            const vw = vb.width, vh = vb.height;
            const defs = document.createElementNS(SVGNS, 'defs');
            svg.appendChild(defs);
            const uid = svg.dataset.uid;

            const layers = [];
            let layerCount = 0;
            function addLayer() {
                const maskId = `dm-${uid}-${layerCount++}`;
                const mask = document.createElementNS(SVGNS, 'mask');
                mask.setAttribute('id', maskId);
                mask.setAttribute('maskUnits', 'userSpaceOnUse');
                mask.setAttribute('x', 0); mask.setAttribute('y', 0);
                mask.setAttribute('width', vw); mask.setAttribute('height', vh);
                const base = document.createElementNS(SVGNS, 'rect');
                base.setAttribute('x', 0); base.setAttribute('y', 0);
                base.setAttribute('width', vw); base.setAttribute('height', vh);
                base.setAttribute('fill', 'white');
                mask.appendChild(base);
                defs.appendChild(mask);
                const g = document.createElementNS(SVGNS, 'g');
                g.setAttribute('mask', `url(#${maskId})`);
                svg.appendChild(g);
                const layer = { g, mask };
                layers.push(layer);
                return layer;
            }
            let current = addLayer();

            function makePath(d, w, stroke, opacity) {
                const p = document.createElementNS(SVGNS, 'path');
                p.setAttribute('d', d);
                p.setAttribute('fill', 'none');
                p.setAttribute('stroke-linecap', 'round');
                p.setAttribute('stroke-linejoin', 'round');
                p.setAttribute('stroke-width', w);
                p.setAttribute('stroke', stroke);
                if (opacity != null) p.setAttribute('stroke-opacity', opacity);
                return p;
            }

            (cmds || []).forEach(cmd => {
                if (cmd.tool === 'legacy_base64') {
                    const img = document.createElementNS(SVGNS, 'image');
                    img.setAttribute('href', cmd.dataURL);
                    img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', cmd.dataURL);
                    img.setAttribute('x', 0); img.setAttribute('y', 0);
                    img.setAttribute('width', vw); img.setAttribute('height', vh);
                    img.setAttribute('preserveAspectRatio', 'none');
                    current.g.appendChild(img);
                    return;
                }
                if (!cmd.points || cmd.points.length === 0) return;
                const d = strokePathD(cmd.points);
                if (cmd.tool === 'pen') {
                    current.g.appendChild(makePath(d, cmd.width, cmd.color, cmd.opacity));
                } else {
                    // 消しゴム：既存の全レイヤーを黒で削り、以後の描画は新レイヤーへ
                    layers.forEach(layer => layer.mask.appendChild(makePath(d, cmd.width, 'black', 1)));
                    current = addLayer();
                }
            });
        }

        // ===== 消しゴム：その場でペン線を切る（消しゴムの跡を残さない） =====
        // 消しゴムを「命令」として残す作りだと3つの実害が出た：
        //   ①消した線を後で動かすと、切り跡が置き去りになって線が丸ごと復活する
        //   ②消しゴムが通った場所に新しく引いた線まで切れて見える
        //   ③範囲選択で「見えない消しゴムの線」まで選べてしまう
        // なので消した時点でペン線の点列そのものを切り分け、消しゴムは何も残さない。
        // （古い .amk に入っている eraser 命令は renderStrokesToSVG 側で従来どおり描ける）
        function densifyPoints(pts, maxGap) {
            if (!pts || pts.length < 2) return (pts || []).slice();
            const out = [pts[0]];
            for (let i = 1; i < pts.length; i++) {
                const a = pts[i - 1], b = pts[i];
                const n = Math.floor(Math.hypot(b.x - a.x, b.y - a.y) / maxGap);
                for (let k = 1; k <= n; k++) {
                    const t = k / (n + 1);
                    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
                }
                out.push(b);
            }
            return out;
        }
        function distToPolyline(p, pts) {
            if (!pts || !pts.length) return Infinity;
            if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y);
            let m = Infinity;
            for (let i = 0; i < pts.length - 1; i++) {
                m = Math.min(m, distToSeg(p.x, p.y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y));
            }
            return m;
        }
        function pointsBBox(pts, pad) {
            let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
            pts.forEach(p => { l = Math.min(l, p.x); t = Math.min(t, p.y); r = Math.max(r, p.x); b = Math.max(b, p.y); });
            return { left: l - pad, top: t - pad, right: r + pad, bottom: b + pad };
        }
        function bboxOverlap(a, b) {
            return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
        }
        // 判定用に増やした点をそのまま残すとデータが膨らむので、見た目を変えない範囲で間引く
        function simplifyPoints(pts, eps) {
            if (pts.length < 3) return pts;
            let maxD = -1, maxI = 0;
            const a = pts[0], b = pts[pts.length - 1];
            for (let i = 1; i < pts.length - 1; i++) {
                const d = distToSeg(pts[i].x, pts[i].y, a.x, a.y, b.x, b.y);
                if (d > maxD) { maxD = d; maxI = i; }
            }
            if (maxD <= eps) return [a, b];
            const left = simplifyPoints(pts.slice(0, maxI + 1), eps);
            const right = simplifyPoints(pts.slice(maxI), eps);
            return left.slice(0, -1).concat(right);
        }
        // 1本のペン線を消しゴムの通り道で切り、残った断片の命令を返す
        function splitStrokeByEraser(cmd, eraserPts, radius) {
            const pts = densifyPoints(cmd.points, 2);
            const segs = [];
            let run = [];
            pts.forEach(p => {
                if (distToPolyline(p, eraserPts) > radius) run.push(p);
                else { if (run.length) segs.push(run); run = []; }
            });
            if (run.length) segs.push(run);
            const wasDot = cmd.points.length === 1;
            return segs
                .filter(seg => seg.length >= 2 || wasDot)   // 1点だけの断片は消し残りのゴミになるので捨てる
                .map(seg => Object.assign({}, cmd, { points: simplifyPoints(seg, 0.35) }));
        }
        function applyEraser(idx, eraserPts, radius) {
            const cmds = window.canvasDrawings[idx] || [];
            // 画像として取り込んだ古い手描きが混じっている時だけ、従来のマスク方式へ退避する
            // （画像は幾何的に切れないため）
            if (cmds.some(c => c.tool === 'legacy_base64')) {
                cmds.push({ tool: 'eraser', points: eraserPts, width: radius * 2 });
                window.canvasDrawings[idx] = cmds;
                return;
            }
            const eb = pointsBBox(eraserPts, radius);
            const next = [];
            cmds.forEach(cmd => {
                if (cmd.tool !== 'pen' || !cmd.points || !cmd.points.length) { next.push(cmd); return; }
                const cb = pointsBBox(cmd.points, (parseFloat(cmd.width) || 1) / 2);
                if (!bboxOverlap(cb, eb)) { next.push(cmd); return; }
                next.push(...splitStrokeByEraser(cmd, eraserPts, radius));
            });
            window.canvasDrawings[idx] = next;
        }
        // 引き終わった1本を確定する（ペンは足す、消しゴムは切る）
        function commitPenStroke(idx, actualTool) {
            if (!window.canvasDrawings[idx]) window.canvasDrawings[idx] = [];
            if (actualTool === 'eraser') {
                if (rawPenPoints.length) applyEraser(idx, rawPenPoints, parseFloat(penWidthInput.value) / 2);
                // 番号がずれるので、線の選択は畳んでおく
                if (typeof deselectStroke === 'function') deselectStroke();
                if (typeof clearMultiStrokeSelection === 'function') clearMultiStrokeSelection();
            } else {
                window.canvasDrawings[idx].push({
                    tool: actualTool,
                    points: rawPenPoints,
                    width: parseFloat(penWidthInput.value),
                    color: toolColors['pen'],
                    opacity: penOpacityInput.value
                });
            }
        }

        // ===== ペン線の選択（JSによる距離判定。消しゴムの部分削りは不変） =====
        function eventToSvgLocal(svg, e) {
            const rect = svg.getBoundingClientRect();
            const vb = svg.viewBox.baseVal;
            const sx = rect.width ? vb.width / rect.width : 1;
            const sy = rect.height ? vb.height / rect.height : 1;
            return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
        }
        function distToSeg(px, py, ax, ay, bx, by) {
            const dx = bx - ax, dy = by - ay;
            const len2 = dx * dx + dy * dy;
            let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
            t = Math.max(0, Math.min(1, t));
            const cx = ax + t * dx, cy = ay + t * dy;
            return Math.hypot(px - cx, py - cy);
        }
        // クリック位置にあるペン線を探す（上に描いた線を優先）
        function findStrokeAt(e) {
            const page = e.target.closest('.pdf-page');
            const svg = page ? page.querySelector('.drawing-svg') : workspace.querySelector('.drawing-svg');
            if (!svg) return null;
            const loc = eventToSvgLocal(svg, e);
            const idx = parseInt(svg.dataset.canvasIndex);
            const cmds = window.canvasDrawings[idx] || [];
            for (let i = cmds.length - 1; i >= 0; i--) {
                const cmd = cmds[i];
                if (cmd.tool !== 'pen' || !cmd.points || !cmd.points.length) continue;
                const thresh = (parseFloat(cmd.width) || 4) / 2 + 6;
                let hit = false;
                if (cmd.points.length === 1) {
                    const p = cmd.points[0];
                    if (Math.hypot(loc.x - p.x, loc.y - p.y) <= thresh) hit = true;
                } else {
                    for (let j = 0; j < cmd.points.length - 1; j++) {
                        if (distToSeg(loc.x, loc.y, cmd.points[j].x, cmd.points[j].y, cmd.points[j + 1].x, cmd.points[j + 1].y) <= thresh) { hit = true; break; }
                    }
                }
                if (hit) return { svg, index: i };
            }
            return null;
        }
        function currentStrokeCmd() {
            if (!selectedStroke) return null;
            const idx = parseInt(selectedStroke.svg.dataset.canvasIndex);
            return (window.canvasDrawings[idx] || [])[selectedStroke.index] || null;
        }
        function clearStrokeHighlight() {
            document.querySelectorAll('.stroke-sel-box, .stroke-center, .stroke-handle').forEach(n => n.remove());
        }
        // 選択中のペン線には、中心線と両端のつまみを出す（外接四角形は出さない）
        function showStrokeHighlight() {
            clearStrokeHighlight();
            const cmd = currentStrokeCmd();
            if (!cmd || !cmd.points || !cmd.points.length) return;
            const svg = selectedStroke.svg;

            const center = document.createElementNS(SVGNS, 'path');
            center.setAttribute('class', 'stroke-center');
            center.setAttribute('d', cmd.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' '));
            center.setAttribute('fill', 'none');
            center.setAttribute('stroke', centerLineColorFor(hexToRgba(cmd.color || '#000000', cmd.opacity === undefined ? 1 : cmd.opacity)));
            center.setAttribute('stroke-width', '1');
            center.setAttribute('vector-effect', 'non-scaling-stroke');
            center.setAttribute('pointer-events', 'none');
            svg.appendChild(center);

            // つまみの見た目の大きさを画面上で一定に保つ
            const rect = svg.getBoundingClientRect();
            const vb = svg.viewBox.baseVal;
            const unit = rect.width ? vb.width / rect.width : 1;
            const ends = [{ pos: 'start', p: cmd.points[0] }, { pos: 'end', p: cmd.points[cmd.points.length - 1] }];
            ends.forEach(({ pos, p }) => {
                const c = document.createElementNS(SVGNS, 'circle');
                c.setAttribute('class', 'stroke-handle');
                c.dataset.end = pos;
                c.setAttribute('cx', p.x); c.setAttribute('cy', p.y);
                c.setAttribute('r', 2.5 * unit);
                c.setAttribute('fill', '#ffffff');
                c.setAttribute('stroke', '#3b82f6');
                c.setAttribute('stroke-width', '1');
                c.setAttribute('vector-effect', 'non-scaling-stroke');
                c.style.pointerEvents = 'auto';
                c.style.cursor = 'crosshair';
                svg.appendChild(c);
            });
        }
        function selectStroke(hit) {
            window.deselectCurrent();
            selectedStroke = hit;
            showStrokeHighlight();
            updateToolbar();
        }
        function deselectStroke() {
            selectedStroke = null;
            clearStrokeHighlight();
        }
        function reRenderStrokeSvg() {
            if (!selectedStroke) return;
            const idx = parseInt(selectedStroke.svg.dataset.canvasIndex);
            renderStrokesToSVG(selectedStroke.svg, window.canvasDrawings[idx] || []);
            showStrokeHighlight();
        }
        function deleteSelectedStroke() {
            if (!selectedStroke) return false;
            const idx = parseInt(selectedStroke.svg.dataset.canvasIndex);
            const cmds = window.canvasDrawings[idx];
            if (cmds && selectedStroke.index < cmds.length) cmds.splice(selectedStroke.index, 1);
            const svg = selectedStroke.svg;
            deselectStroke();
            renderStrokesToSVG(svg, window.canvasDrawings[idx] || []);
            window.saveState();
            return true;
        }
        // ===== ペン線の範囲選択（box_select で複数のストロークをまとめて選ぶ） =====
        // 1本のストロークの外接矩形を workspace 座標（ズーム前）で返す
        function strokeWorkspaceBBox(sel) {
            const idx = parseInt(sel.svg.dataset.canvasIndex);
            const cmd = (window.canvasDrawings[idx] || [])[sel.index];
            if (!cmd || !cmd.points || !cmd.points.length) return null;
            const xs = cmd.points.map(p => p.x), ys = cmd.points.map(p => p.y);
            const pad = (cmd.width || 2) / 2 + 3;
            const wsRect = workspace.getBoundingClientRect();
            const sRect = sel.svg.getBoundingClientRect();
            const z = zoomLevel || 1;
            const offX = (sRect.left - wsRect.left) / z;
            const offY = (sRect.top - wsRect.top) / z;
            const minX = Math.min(...xs), maxX = Math.max(...xs);
            const minY = Math.min(...ys), maxY = Math.max(...ys);
            return { left: minX + offX - pad, top: minY + offY - pad, right: maxX + offX + pad, bottom: maxY + offY + pad };
        }
        function clearMultiStrokeSelection() {
            document.querySelectorAll('.stroke-multi-sel').forEach(n => n.remove());
            selectedStrokes = [];
        }
        function renderMultiStrokeSelection() {
            document.querySelectorAll('.stroke-multi-sel').forEach(n => n.remove());
            selectedStrokes.forEach(sel => {
                const bb = strokeWorkspaceBBox(sel);
                if (!bb) return;
                const box = document.createElement('div');
                box.className = 'stroke-multi-sel';
                box.style.left = bb.left + 'px';
                box.style.top = bb.top + 'px';
                box.style.width = (bb.right - bb.left) + 'px';
                box.style.height = (bb.bottom - bb.top) + 'px';
                workspace.appendChild(box);
            });
        }
        // 範囲選択した線をまとめて動かすための下ごしらえ。
        // 今の点を控えておき、ドラッグ中は「控え＋ずれ」で置き直す。
        function beginStrokesDrag() {
            if (!selectedStrokes.length) return null;
            const items = [];
            selectedStrokes.forEach(s => {
                const idx = parseInt(s.svg.dataset.canvasIndex);
                const cmd = (window.canvasDrawings[idx] || [])[s.index];
                if (cmd && cmd.points) items.push({ svg: s.svg, cmd, orig: cmd.points.map(p => ({ ...p })) });
            });
            return items.length ? items : null;
        }
        function applyStrokesDrag(items, dx, dy) {
            const svgs = new Set();
            items.forEach(it => {
                it.cmd.points = it.orig.map(p => ({ x: p.x + dx, y: p.y + dy }));
                svgs.add(it.svg);
            });
            svgs.forEach(svg => {
                const idx = parseInt(svg.dataset.canvasIndex);
                renderStrokesToSVG(svg, window.canvasDrawings[idx] || []);
            });
            renderMultiStrokeSelection();
        }
        // 押した場所が、範囲選択した線の囲みの中か
        function insideSelectedStrokes(x, y) {
            return selectedStrokes.some(s => {
                const bb = strokeWorkspaceBBox(s);
                return bb && x >= bb.left && x <= bb.right && y >= bb.top && y <= bb.bottom;
            });
        }
        function deleteMultiStrokes() {
            if (!selectedStrokes.length) return false;
            const bySvg = new Map();
            selectedStrokes.forEach(s => { const a = bySvg.get(s.svg) || []; a.push(s.index); bySvg.set(s.svg, a); });
            bySvg.forEach((indices, svg) => {
                const idx = parseInt(svg.dataset.canvasIndex);
                const cmds = window.canvasDrawings[idx];
                if (!cmds) return;
                indices.sort((a, b) => b - a).forEach(i => { if (i < cmds.length) cmds.splice(i, 1); });
                renderStrokesToSVG(svg, window.canvasDrawings[idx] || []);
            });
            clearMultiStrokeSelection();
            return true;
        }
        function nudgeSelectedStroke(dx, dy) {
            const cmd = currentStrokeCmd();
            if (!cmd) return;
            cmd.points = cmd.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
            reRenderStrokeSvg();
            clearTimeout(nudgeSaveTimer);
            nudgeSaveTimer = setTimeout(() => window.saveState(), 400);
        }
        function duplicateSelectedStroke() {
            const cmd = currentStrokeCmd();
            if (!cmd) return;
            const idx = parseInt(selectedStroke.svg.dataset.canvasIndex);
            const copy = JSON.parse(JSON.stringify(cmd));
            // 貼り付けと同じく、線の左上をカーソル位置に合わせる
            let dx = 12, dy = 12;
            if (lastMouseWs && copy.points.length) {
                dx = lastMouseWs.x - Math.min(...copy.points.map(p => p.x));
                dy = lastMouseWs.y - Math.min(...copy.points.map(p => p.y));
            }
            copy.points = copy.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
            window.canvasDrawings[idx].push(copy);
            const svg = selectedStroke.svg;
            selectedStroke = { svg, index: window.canvasDrawings[idx].length - 1 };
            renderStrokesToSVG(svg, window.canvasDrawings[idx]);
            showStrokeHighlight();
            window.saveState();
        }

        /* 古い .amk の手描きは1枚の画像として入っている。画像は読み込みを待たないと描けないので、
           この場合だけ Promise を返す。呼ぶ側は executeCanvasCommands で待つこと
           （待たずに合成すると、書き出しに手描きが1本も写らない）。 */
        function executeCanvasCommand(ctx, cmd) {
            if (cmd.tool === 'legacy_base64') {
                return new Promise(resolve => {
                    const img = new Image();
                    const draw = () => {
                        ctx.save();
                        ctx.setTransform(1, 0, 0, 1, 0, 0);
                        ctx.globalCompositeOperation = 'source-over';
                        // 画面と同じく、描く面いっぱいに引き伸ばす（元は当時の表示サイズで撮った画像）
                        ctx.drawImage(img, 0, 0, ctx.canvas.width, ctx.canvas.height);
                        ctx.restore();
                        resolve();
                    };
                    img.onload = draw;
                    img.onerror = () => { console.error('古い手描き画像を読めませんでした'); resolve(); };
                    img.src = cmd.dataURL;
                });
            }

            const pts = cmd.points;
            if (!pts || pts.length === 0) return;

            ctx.beginPath();
            ctx.lineWidth = cmd.width;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            if (cmd.tool === 'pen') {
                ctx.globalCompositeOperation = 'source-over';
                ctx.strokeStyle = hexToRgba(cmd.color, cmd.opacity);
            } else { 
                ctx.globalCompositeOperation = 'destination-out';
                ctx.strokeStyle = 'rgba(0,0,0,1)';
            }

            ctx.moveTo(pts[0].x, pts[0].y);
            if (pts.length < 3) {
                ctx.lineTo((pts[1] || pts[0]).x + 0.01, (pts[1] || pts[0]).y + 0.01);
            } else {
                for (let i = 1; i < pts.length - 1; i++) {
                    const midX = (pts[i].x + pts[i + 1].x) / 2;
                    const midY = (pts[i].y + pts[i + 1].y) / 2;
                    ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
                }
                ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
            }
            ctx.stroke();
        }

        // 手描きを順に描く。画像（古い .amk）が混じっていれば、その読み込みを待ってから次へ進む
        async function executeCanvasCommands(ctx, cmds) {
            for (const cmd of (cmds || [])) {
                const pending = executeCanvasCommand(ctx, cmd);
                if (pending && typeof pending.then === 'function') await pending;
            }
        }

