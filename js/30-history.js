// ===== 30-history.js : シリアライズ・自動保存(IndexedDB)・元に戻す/やり直す・線の色 =====
// app.js を分割したもの。素のスクリプトなので変数は全ファイルで共有される。
// index.html の読み込み順を変えると壊れる。

        // --- ワークスペースのシリアライズ（履歴・.amk保存・自動保存で共通利用） ---
        function serializeElements() {
            return Array.from(workspace.querySelectorAll('.canvas-element')).map(el => {
                const isText = el.classList.contains('text-wrapper');
                const isFreehandHighlight = el.classList.contains('highlight-freehand-wrapper');
                const isHighlight = el.classList.contains('highlight-box') && !isFreehandHighlight;
                const isFreehandMask = el.classList.contains('mask-freehand-wrapper');
                const isShape = el.classList.contains('shape-element');
                const isImage = el.classList.contains('image-element');
                const isMaskRect = el.classList.contains('mask-rect');

                return {
                    type: isText ? 'text' : (isFreehandHighlight ? 'freehand-highlight' : (isHighlight ? 'highlight' : (isFreehandMask ? 'freehand-mask' : (isShape ? 'shape' : (isImage ? 'image' : 'mask'))))),
                    left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height,
                    content: isText ? el.querySelector('.text-content').innerHTML : null,
                    fontSize: isText ? el.style.fontSize : null,
                    color: isText ? el.style.color
                        : (isShape ? el.querySelector('svg > *')?.getAttribute('stroke')
                        : (isMaskRect ? (el.style.backgroundColor || null)
                        : ((isFreehandMask || isFreehandHighlight) ? (el.querySelector('path').style.stroke || null)
                        : null))),
                    backgroundColor: isHighlight ? el.style.backgroundColor : null,
                    zIndex: el.style.zIndex,
                    textAlign: isText ? (el.style.textAlign || el.querySelector('.text-content').style.textAlign || 'left') : null,
                    writingMode: isText ? (el.style.writingMode || el.querySelector('.text-content').style.writingMode || 'horizontal-tb') : null,
                    pathD: (isFreehandMask || isFreehandHighlight) ? el.querySelector('path').getAttribute('d') : null,
                    strokeWidth: (isFreehandMask || isFreehandHighlight) ? el.querySelector('path').getAttribute('stroke-width') : (isShape ? el.querySelector('svg > *')?.getAttribute('stroke-width') : null),
                    shapeType: isShape ? el.dataset.shapeType : null,
                    lineDir: isShape ? el.dataset.lineDir : null,
                    dataUrl: isImage ? el.querySelector('img').src : null
                };
            });
        }

        function currentBgScale() {
            if (!currentBackground) return 1;
            return currentBackground.type === 'pdf'
                ? window.pdfBaseScale
                : (parseFloat(uploadedImage.style.width) / uploadedImage.naturalWidth);
        }

        // 背景を除いた軽量セッション（自動保存で頻繁に書き込む部分）
        function buildSessionData() {
            return {
                version: 1,
                fileName: window.currentFileName || 'project',
                bgScale: currentBgScale(),
                elements: serializeElements(),
                canvasCommandsArray: window.canvasDrawings.map(cmds => [...cmds]),
                canvasZIndexes: Array.from(workspace.querySelectorAll('.drawing-svg')).map(c => c.style.zIndex)
            };
        }

        // .amk書き出し用（背景データを含む完全なプロジェクト）
        function buildProjectData() {
            return { ...buildSessionData(), background: currentBackground };
        }

        /* ── 編集できるPDF（PDFの中に作業データを忍ばせる）─────────────────
           暗記マーカーを焼き込まないPDFを出し、PDFの情報欄に作業データを入れておく。
           人の目には出ず、他のソフトで開いても普通のPDFに見える。
           容量は元PDF＋数十KB程度（作業データは gzip で圧縮して入れる）。
           焼き込み版と違って、これを開き直せば続きから編集できる。
           ※注意：他のPDFソフトで開いて保存し直すと、情報欄が捨てられることがある。 */
        const AMK_PDF_KEY = 'AnkiMaskingData';

        function bytesToBase64(bytes) {
            let s = ''; const chunk = 0x8000;
            for (let i = 0; i < bytes.length; i += chunk) {
                s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
            }
            return btoa(s);
        }
        function base64ToBytes(b64) {
            const bin = atob(b64); const out = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
            return out;
        }
        // 印は先頭に付ける。gz: は圧縮あり、raw: は圧縮なし（古いブラウザ向けの退避）
        async function packProjectPayload(obj) {
            const bytes = new TextEncoder().encode(JSON.stringify(obj));
            if (typeof CompressionStream === 'undefined') return 'raw:' + bytesToBase64(bytes);
            const cs = new CompressionStream('gzip');
            const w = cs.writable.getWriter(); w.write(bytes); w.close();
            const buf = await new Response(cs.readable).arrayBuffer();
            return 'gz:' + bytesToBase64(new Uint8Array(buf));
        }
        async function unpackProjectPayload(payload) {
            const isGz = payload.startsWith('gz:');
            const bytes = base64ToBytes(payload.replace(/^(gz|raw):/, ''));
            if (!isGz) return JSON.parse(new TextDecoder().decode(bytes));
            const ds = new DecompressionStream('gzip');
            const w = ds.writable.getWriter(); w.write(bytes); w.close();
            const buf = await new Response(ds.readable).arrayBuffer();
            return JSON.parse(new TextDecoder().decode(buf));
        }

        // 元PDF（または画像を入れた1ページのPDF）に作業データを刻んで書き出す
        async function exportEditablePdf() {
            saveDropdownMenu.classList.remove('show');
            if (!currentBackground) { alert('まずは画像かPDFを新規作成で開いてください。'); return; }
            if (typeof PDFLib === 'undefined') { alert('PDFの部品が読み込めていません。ページを開き直してください。'); return; }

            const loadingOverlay = document.getElementById('loading-overlay');
            setLoadingDetail('編集できるPDFを作成中...');
            loadingOverlay.style.display = 'flex';
            await new Promise(r => setTimeout(r, 50));

            try {
                let doc;
                if (currentBackground.type === 'pdf') {
                    const bytes = await (await fetch(currentBackground.dataURL)).arrayBuffer();
                    doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
                } else {
                    // 画像は1ページのPDFに入れる。原寸のまま入れるので画質は落ちない
                    doc = await PDFLib.PDFDocument.create();
                    const bytes = await (await fetch(currentBackground.dataURL)).arrayBuffer();
                    const isPng = /^data:image\/png/i.test(currentBackground.dataURL);
                    const img = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
                    const page = doc.addPage([img.width, img.height]);
                    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
                }

                const payload = await packProjectPayload(buildSessionData());
                let info = doc.context.trailerInfo.Info ? doc.context.lookup(doc.context.trailerInfo.Info) : null;
                if (!info || typeof info.set !== 'function') {
                    info = doc.context.obj({});
                    doc.context.trailerInfo.Info = doc.context.register(info);
                }
                info.set(PDFLib.PDFName.of(AMK_PDF_KEY), PDFLib.PDFString.of(payload));

                const out = await doc.save({ updateMetadata: false });
                const blob = new Blob([out], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.download = `${window.currentFileName}_編集用.pdf`;
                a.href = url; a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            } catch (err) {
                console.error(err);
                alert('編集できるPDFの作成に失敗しました。');
            } finally {
                loadingOverlay.style.display = 'none';
            }
        }

        /* PDFの文字列オブジェクトから中身を取り出す。
           pdf-lib の decodeText() は内部で String.fromCharCode(...配列) を使うため、
           数百KBを超えると「Maximum call stack size exceeded」で落ちる
           （写真を貼ると作業データがその大きさになる）。
           刻む中身は必ず Base64＋印だけ＝エスケープが起きない文字なので、
           生の value をそのまま使う。念のため、印の付いていない時だけ従来の方法に戻す。 */
        function readPdfStringValue(v) {
            if (!v) return null;
            const val = v.value;
            if (typeof val === 'string' && /^(gz|raw):/.test(val)) return val;
            try {
                if (typeof v.decodeText === 'function') return v.decodeText();
            } catch (e) {
                console.error(e);
            }
            return typeof val === 'string' ? val : null;
        }

        // PDFに作業データが刻まれていれば取り出す。無ければ null
        async function readEmbeddedProject(arrayBuffer) {
            if (typeof PDFLib === 'undefined') return null;
            try {
                const doc = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true, updateMetadata: false });
                const infoRef = doc.context.trailerInfo.Info;
                if (!infoRef) return null;
                const info = doc.context.lookup(infoRef);
                if (!info || typeof info.get !== 'function') return null;
                const v = info.get(PDFLib.PDFName.of(AMK_PDF_KEY));
                if (!v) return null;
                const raw = readPdfStringValue(v);
                if (!raw) return null;
                return await unpackProjectPayload(raw);
            } catch (e) {
                console.error(e);
                return null;
            }
        }

        // --- 自動保存（IndexedDB） ---
        const AUTOSAVE_DB = 'ankimasking', AUTOSAVE_STORE = 'autosave';
        function idbOpen() {
            return new Promise((res, rej) => {
                const req = indexedDB.open(AUTOSAVE_DB, 1);
                req.onupgradeneeded = () => req.result.createObjectStore(AUTOSAVE_STORE);
                req.onsuccess = () => res(req.result);
                req.onerror = () => rej(req.error);
            });
        }
        async function idbSet(key, val) {
            const db = await idbOpen();
            return new Promise((res, rej) => {
                const tx = db.transaction(AUTOSAVE_STORE, 'readwrite');
                tx.objectStore(AUTOSAVE_STORE).put(val, key);
                tx.oncomplete = () => { db.close(); res(); };
                tx.onerror = () => { db.close(); rej(tx.error); };
            });
        }
        async function idbGet(key) {
            const db = await idbOpen();
            return new Promise((res, rej) => {
                const tx = db.transaction(AUTOSAVE_STORE, 'readonly');
                const r = tx.objectStore(AUTOSAVE_STORE).get(key);
                r.onsuccess = () => { db.close(); res(r.result); };
                r.onerror = () => { db.close(); rej(r.error); };
            });
        }
        async function idbDel(key) {
            const db = await idbOpen();
            return new Promise((res, rej) => {
                const tx = db.transaction(AUTOSAVE_STORE, 'readwrite');
                tx.objectStore(AUTOSAVE_STORE).delete(key);
                tx.oncomplete = () => { db.close(); res(); };
                tx.onerror = () => { db.close(); rej(tx.error); };
            });
        }

        let autosaveTimer = null;
        let isDirty = false;
        function scheduleAutosave() {
            if (!currentBackground) return;
            isDirty = true;
            clearTimeout(autosaveTimer);
            autosaveTimer = setTimeout(async () => {
                try {
                    await idbSet('session', buildSessionData());
                    isDirty = false;
                } catch (err) { console.error('自動保存に失敗しました', err); }
            }, 800);
        }
        // 背景（大きいデータ）はファイルを開いた時だけ書き込む
        async function persistBackground() {
            if (!currentBackground) return;
            try { await idbSet('background', currentBackground); }
            catch (err) { console.error('背景の保存に失敗しました', err); }
        }

        // 履歴に積む控えは、後で命令を書き換えても（例：色の付け替え）過去に影響しないよう
        // 深い複製にする必要がある。JSON の往復は文字列を経由するぶん重いので、
        // 使える環境では structuredClone を使う。
        function deepCloneCommands(v) {
            return (typeof structuredClone === 'function') ? structuredClone(v) : JSON.parse(JSON.stringify(v));
        }

        window.saveState = function() {
            const elements = serializeElements();
            const canvasCommandsArray = deepCloneCommands(window.canvasDrawings);
            const canvasZIndexes = Array.from(workspace.querySelectorAll('.drawing-svg')).map(c => c.style.zIndex);

            window.historyArray = window.historyArray.slice(0, window.historyIndex + 1);
            window.historyArray.push({ elements, canvasCommandsArray, canvasZIndexes });
            window.historyIndex++;

            const MAX_HISTORY = 50;
            if (window.historyArray.length > MAX_HISTORY) {
                window.historyArray.shift();
                window.historyIndex--;
            }

            scheduleAutosave();
            updateHistoryButtons();
        }

        function restoreState(index) {
            if (index < 0 || index >= window.historyArray.length) return;
            workspace.querySelectorAll('.canvas-element').forEach(el => el.remove()); window.deselectCurrent();
            const state = window.historyArray[index];
            state.elements.forEach(data => {
                let el;
                if (data.type === 'mask') el = window.createMaskElement(data.left, data.top, data.width, data.height, data.color);
                else if (data.type === 'shape') el = window.createShapeElement(data.left, data.top, data.width, data.height, data.shapeType, data.color, data.strokeWidth, data.lineDir);
                else if (data.type === 'freehand-mask') el = window.createFreehandMaskElement(data.left, data.top, data.width, data.height, data.pathD, data.strokeWidth, data.color);
                    else if (data.type === 'freehand-highlight') el = window.createFreehandHighlightElement(data.left, data.top, data.width, data.height, data.pathD, data.strokeWidth, data.color);
                else if (data.type === 'highlight') el = window.createHighlightElement(data.left, data.top, data.width, data.height, data.backgroundColor);
                else if (data.type === 'image') el = window.createImageElement(data.left, data.top, data.width, data.height, data.dataUrl);
                else el = window.createTextElement(data.left, data.top, data.width, data.height, data.content, data.fontSize, data.color, data.textAlign, data.writingMode); 
                
                if (data.zIndex) {
                    el.style.zIndex = data.zIndex;
                    if (parseInt(data.zIndex) > window.globalZIndex) window.globalZIndex = parseInt(data.zIndex);
                }
            });
            
            window.canvasDrawings = deepCloneCommands(state.canvasCommandsArray);
            const svgs = Array.from(workspace.querySelectorAll('.drawing-svg'));

            svgs.forEach((svg, i) => {
                if (state.canvasZIndexes && state.canvasZIndexes[i]) {
                    svg.style.zIndex = state.canvasZIndexes[i];
                }
                renderStrokesToSVG(svg, window.canvasDrawings[i] || []);
            });
            updateHistoryButtons();
        }

        // 図形の「掴める太さ」。見た目の線が細くても最低14pxぶんは掴めるようにする。
        function shapeHitWidth(strokeWidth) {
            return Math.max(parseFloat(strokeWidth) || 2, 14);
        }

        window.createShapeElement = function(left, top, width, height, shapeType, color, strokeWidth, lineDir) {
            const wrapper = document.createElement('div');
            wrapper.className = `canvas-element shape-element`;
            wrapper.dataset.shapeType = shapeType;
            wrapper.dataset.lineDir = lineDir || '\\';
            wrapper.style.left = left; wrapper.style.top = top;
            wrapper.style.width = width; wrapper.style.height = height;
            
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.style.width = '100%'; svg.style.height = '100%';
            svg.setAttribute('preserveAspectRatio', 'none');
            
            let shapeNode;
            if (shapeType === 'rect') {
                shapeNode = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                shapeNode.setAttribute('x', '0'); shapeNode.setAttribute('y', '0');
                shapeNode.setAttribute('width', '100%'); shapeNode.setAttribute('height', '100%');
            } else if (shapeType === 'circle') {
                shapeNode = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
                shapeNode.setAttribute('cx', '50%'); shapeNode.setAttribute('cy', '50%');
                shapeNode.setAttribute('rx', '50%'); shapeNode.setAttribute('ry', '50%');
            } else if (shapeType === 'line') {
                shapeNode = document.createElementNS("http://www.w3.org/2000/svg", "line");
                if (lineDir === '/') {
                    shapeNode.setAttribute('x1', '0'); shapeNode.setAttribute('y1', '100%');
                    shapeNode.setAttribute('x2', '100%'); shapeNode.setAttribute('y2', '0');
                } else {
                    shapeNode.setAttribute('x1', '0'); shapeNode.setAttribute('y1', '0');
                    shapeNode.setAttribute('x2', '100%'); shapeNode.setAttribute('y2', '100%');
                }
            }
            
            shapeNode.setAttribute('fill', 'none');
            shapeNode.setAttribute('stroke', color);
            shapeNode.setAttribute('stroke-width', strokeWidth);
            shapeNode.setAttribute('vector-effect', 'non-scaling-stroke');
            
            svg.appendChild(shapeNode);

            // 当たり判定は「線の上だけ」。ただし細い線は掴みにくいので、
            // 透明で太い同じ形をもう1枚重ねて、それだけで判定を取る（見た目には出ない）。
            const hitNode = shapeNode.cloneNode(false);
            hitNode.setAttribute('class', 'shape-hit');
            hitNode.setAttribute('fill', 'none');
            hitNode.setAttribute('stroke', 'rgba(0,0,0,0)');
            hitNode.setAttribute('stroke-width', shapeHitWidth(strokeWidth));
            hitNode.setAttribute('vector-effect', 'non-scaling-stroke');
            svg.appendChild(hitNode);

            wrapper.appendChild(svg);
            addResizeHandles(wrapper);
            window.bringToFront(wrapper);
            workspace.appendChild(wrapper);
            return wrapper;
        }

        window.createMaskElement = function(left, top, width, height, color) {
            const mask = document.createElement('div'); mask.className = 'canvas-element mask mask-rect';
            mask.style.left = left; mask.style.top = top; mask.style.width = width; mask.style.height = height;
            if (color) mask.style.backgroundColor = color;
            addResizeHandles(mask);
            window.bringToFront(mask);
            workspace.appendChild(mask); return mask;
        }

        // 手書き線（マスキング／ハイライト共通）の組み立て。
        // 線本体・選択時に出す中心線・両端のつまみをまとめて作る
        function buildFreehandElement(className, left, top, width, height, pathD, strokeWidth, color, defaultStroke) {
            const wrapper = document.createElement('div');
            wrapper.className = className;
            wrapper.style.left = left;
            wrapper.style.top = top;
            wrapper.style.width = width;
            wrapper.style.height = height;

            const svg = document.createElementNS(SVGNS, "svg");
            svg.style.width = '100%';
            svg.style.height = '100%';
            svg.style.pointerEvents = 'none';
            svg.setAttribute('preserveAspectRatio', 'none');
            svg.setAttribute('viewBox', `0 0 ${parseFloat(width)} ${parseFloat(height)}`);

            const path = document.createElementNS(SVGNS, "path");
            path.setAttribute('class', 'fh-stroke');
            path.setAttribute('d', pathD);
            if (defaultStroke) path.setAttribute('stroke', defaultStroke);
            if (color) path.style.stroke = color;
            path.setAttribute('stroke-width', strokeWidth);
            path.setAttribute('stroke-linecap', 'round');
            path.setAttribute('stroke-linejoin', 'round');
            path.setAttribute('fill', 'none');
            path.setAttribute('vector-effect', 'non-scaling-stroke');

            // 選択したときだけ見える中心線
            const center = document.createElementNS(SVGNS, "path");
            center.setAttribute('class', 'fh-center');
            center.setAttribute('d', pathD);
            center.setAttribute('stroke-width', '1');
            center.setAttribute('fill', 'none');
            center.setAttribute('vector-effect', 'non-scaling-stroke');

            svg.appendChild(path);
            svg.appendChild(center);
            wrapper.appendChild(svg);

            ['start', 'end'].forEach(pos => {
                const h = document.createElement('div');
                h.className = 'fh-handle fh-handle-' + pos;
                h.dataset.end = pos;
                wrapper.appendChild(h);
            });

            window.bringToFront(wrapper);
            workspace.appendChild(wrapper);
            updateFreehandUI(wrapper);
            return wrapper;
        }

        window.createFreehandMaskElement = function(left, top, width, height, pathD, strokeWidth, color) {
            return buildFreehandElement('canvas-element mask mask-freehand-wrapper',
                left, top, width, height, pathD, strokeWidth, color, 'black');
        }

        // 手書きハイライト（蛍光ペンの線）。マスキングの手書きと同じ作りだが、乗算で重ねる
        window.createFreehandHighlightElement = function(left, top, width, height, pathD, strokeWidth, color) {
            return buildFreehandElement('canvas-element highlight-box highlight-freehand-wrapper',
                left, top, width, height, pathD, strokeWidth, color, null);
        }

        // --- 線の明るさに応じて中心線の色（黒 or 白）を決める ---
        // 名前が後段の parseCssColor（0〜1を返す・PDF書き出し用）とぶつかると
        // 巻き上げで後者が勝ち、明度判定が常に同じ側へ倒れる。名前を分けておく。
        const colorProbeCtx = document.createElement('canvas').getContext('2d');
        function parseCssColor255(c) {
            if (!c) return null;
            colorProbeCtx.fillStyle = '#000';
            colorProbeCtx.fillStyle = c;              // 不正な値なら黒のまま残る
            const s = colorProbeCtx.fillStyle;
            if (s.startsWith('#')) {
                const h = s.length === 4
                    ? s.slice(1).split('').map(x => parseInt(x + x, 16))
                    : [1, 3, 5].map(i => parseInt(s.substr(i, 2), 16));
                return { r: h[0], g: h[1], b: h[2], a: 1 };
            }
            const n = s.match(/-?\d*\.?\d+/g);
            if (!n) return null;
            return { r: +n[0], g: +n[1], b: +n[2], a: n[3] === undefined ? 1 : +n[3] };
        }
        // 白い紙の上に置いたときの見た目の明るさで判定する
        function centerLineColorFor(cssColor) {
            const c = parseCssColor255(cssColor);
            if (!c) return '#ffffff';
            const r = c.a * c.r + (1 - c.a) * 255;
            const g = c.a * c.g + (1 - c.a) * 255;
            const b = c.a * c.b + (1 - c.a) * 255;
            const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            return lum > 0.55 ? '#000000' : '#ffffff';
        }

        // 端をドラッグしたときの変形。掴んだ端がカーソルにそのまま付いてくるよう、
        // 反対の端を固定点として「拡大・縮小＋回転」をまとめてかける（線の形は崩れない）
        function endpointTransform(anchor, baseDx, baseDy, curX, curY) {
            const len2 = baseDx * baseDx + baseDy * baseDy;
            const vx = curX - anchor.x, vy = curY - anchor.y;
            if (len2 < 0.0001) return p => ({ x: p.x, y: p.y });
            let a = (baseDx * vx + baseDy * vy) / len2;   // 拡大率（回転を含む複素数の実部）
            let b = (baseDx * vy - baseDy * vx) / len2;   // 同じく虚部＝回転成分
            const mag = Math.hypot(a, b);
            if (mag > 20) { a = a / mag * 20; b = b / mag * 20; }
            return p => {
                const dx = p.x - anchor.x, dy = p.y - anchor.y;
                return { x: anchor.x + a * dx - b * dy, y: anchor.y + b * dx + a * dy };
            };
        }

