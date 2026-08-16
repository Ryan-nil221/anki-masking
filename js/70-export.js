// ===== 70-export.js : 画像/PDFへの書き出し（ベクター・ラスタ） =====
// app.js を分割したもの。素のスクリプトなので変数は全ファイルで共有される。
// index.html の読み込み順を変えると壊れる。

        function measuredLineHeightPx(fontSizePx) {
            const key = Math.round(fontSizePx * 100);
            if (__lhCache.has(key)) return __lhCache.get(key);
            const probe = document.createElement('div');
            probe.style.cssText = `position:absolute;left:-99999px;top:0;visibility:hidden;white-space:pre;line-height:normal;font-family:${TEXT_FONT_STACK};font-size:${fontSizePx}px;`;
            probe.textContent = 'Mgあ';
            (workspace || document.body).appendChild(probe);
            const lh = probe.getBoundingClientRect().height || fontSizePx * 1.2;
            probe.remove();
            __lhCache.set(key, lh);
            return lh;
        }

        async function drawDOMElementToCanvas(ctx, data) {
            if (window.isMasksHidden && (data.type === 'mask' || data.type === 'freehand-mask')) {
                return;
            }

            const left = parseFloat(data.left || 0);
            const top = parseFloat(data.top || 0);
            let width = parseFloat(data.width);
            if (isNaN(width)) width = 300; 
            let height = parseFloat(data.height);
            if (isNaN(height)) height = 100;

            ctx.save();
            ctx.translate(left, top);

            if (data.type === 'mask') {
                ctx.fillStyle = data.color || 'black';
                ctx.fillRect(0, 0, width, height);
            } else if (data.type === 'highlight') {
                ctx.globalCompositeOperation = 'multiply';
                ctx.fillStyle = data.backgroundColor;
                ctx.fillRect(0, 0, width, height);
            } else if (data.type === 'freehand-mask') {
                ctx.strokeStyle = data.color || 'black';
                ctx.lineWidth = parseFloat(data.strokeWidth || 15);
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.stroke(new Path2D(data.pathD));
            } else if (data.type === 'freehand-highlight') {
                ctx.globalCompositeOperation = 'multiply';
                ctx.strokeStyle = data.color;
                ctx.lineWidth = parseFloat(data.strokeWidth || 20);
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.stroke(new Path2D(data.pathD));
            } else if (data.type === 'shape') {
                ctx.strokeStyle = data.color;
                ctx.lineWidth = parseFloat(data.strokeWidth || 3);
                ctx.beginPath();
                if (data.shapeType === 'rect') {
                    ctx.strokeRect(0, 0, width, height);
                } else if (data.shapeType === 'circle') {
                    ctx.ellipse(width/2, height/2, width/2, height/2, 0, 0, Math.PI * 2);
                    ctx.stroke();
                } else if (data.shapeType === 'line') {
                    if (data.lineDir === '/') {
                        ctx.moveTo(0, height);
                        ctx.lineTo(width, 0);
                    } else {
                        ctx.moveTo(0, 0);
                        ctx.lineTo(width, height);
                    }
                    ctx.stroke();
                }
            } else if (data.type === 'image') {
                if (data._cachedImg) {
                    ctx.drawImage(data._cachedImg, 0, 0, width, height);
                }
            } else if (data.type === 'text') {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = sanitizeTextHTML(data.content);

                const baseFontSize = parseFloat(data.fontSize || 20);
                // 画面DOMを忠実に再現する。.text-wrapper の padding は上2px・左8px（固定）。
                ctx.translate(8, 2);

                // 行の高さは画面の line-height:normal を実測して合わせる（端末で 1.15〜1.5 と変わる）。
                const lineHeight = measuredLineHeightPx(baseFontSize);
                // 縦位置は「文字の基準線(ベースライン)」で合わせる。textBaseline='top' は canvas と
                // CSS で基準がずれる（フォントごとに数px）ため、実測のフォント上下幅(fontBoundingBox)から
                // 行ボックス内のベースライン位置を計算して alphabetic で描く（画面と一致）。
                ctx.font = `${baseFontSize}px ${TEXT_FONT_STACK}`;
                const __fm = ctx.measureText('あ');
                const fAscent = __fm.fontBoundingBoxAscent || baseFontSize * 0.88;
                const fDescent = __fm.fontBoundingBoxDescent || baseFontSize * 0.25;
                const leadTop = (lineHeight - (fAscent + fDescent)) / 2; // 行ボックス上端→文字content上端
                const firstBaseline = leadTop + fAscent;                 // 箱上端→1行目ベースライン
                ctx.textBaseline = 'alphabetic';
                // 旧コード互換の名残（縦書き分岐で使用）
                const halfLeading = (lineHeight - baseFontSize) / 2;

                const isVertical = data.writingMode === 'vertical-rl' || data.writingMode === 'vertical-lr';

                let lines = [];
                let currentLine = [];

                function parseNode(node, color, isBold, isUnderline, isStrike) {
                    if (node.nodeType === Node.TEXT_NODE) {
                        const texts = node.textContent.split(/\r?\n/);
                        texts.forEach((text, index) => {
                            if (index > 0) {
                                lines.push(currentLine);
                                currentLine = [];
                            }
                            if (text) currentLine.push({ text, color, isBold, isUnderline, isStrike });
                        });
                    } else if (node.nodeType === Node.ELEMENT_NODE) {
                        const tag = node.tagName.toLowerCase();
                        if (tag === 'br') {
                            lines.push(currentLine);
                            currentLine = [];
                        } else if (tag === 'div' || tag === 'p') {
                            if (currentLine.length > 0) {
                                lines.push(currentLine);
                                currentLine = [];
                            }
                        }

                        let nodeColor = color;
                        if (node.style && node.style.color) {
                            nodeColor = node.style.color;
                        } else if (node.hasAttribute('color')) {
                            let attrColor = node.getAttribute('color');
                            if (attrColor) {
                                // ★修正5: 空白や引用符などのゴミを除去し、Canvasが黒くなるのを完全ブロック
                                attrColor = attrColor.replace(/['"]/g, '').trim();
                                if (/^[0-9A-Fa-f]{3,6}$/.test(attrColor)) {
                                    attrColor = '#' + attrColor;
                                }
                                nodeColor = attrColor;
                            }
                        }

                        let nodeBold = isBold || tag === 'b' || tag === 'strong' || (node.style && node.style.fontWeight === 'bold');
                        let nodeUnderline = isUnderline || tag === 'u' || (node.style && node.style.textDecoration && node.style.textDecoration.includes('underline'));
                        let nodeStrike = isStrike || tag === 's' || tag === 'strike' || (node.style && node.style.textDecoration && node.style.textDecoration.includes('line-through'));

                        Array.from(node.childNodes).forEach(child => parseNode(child, nodeColor, nodeBold, nodeUnderline, nodeStrike));

                        if (tag === 'div' || tag === 'p') {
                            if (currentLine.length > 0) {
                                lines.push(currentLine);
                                currentLine = [];
                            }
                        }
                    }
                }

                parseNode(tempDiv, data.color || '#ef4444', false, false, false);
                if (currentLine.length > 0) lines.push(currentLine);

                if (isVertical) {
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top'; // 縦書きは字を上端基準で積む（横書きの alphabetic とは別）
                    const isRL = data.writingMode === 'vertical-rl';
                    // 保存された box 幅は 'max-content'(→NaN でフォールバック300px) になり得るため、
                    // 実際の列数から内容幅を求めて右端の基準にする（縦書きが画面外へ飛ぶのを防ぐ）
                    const vContentWidth = lines.length * lineHeight;
                    lines.forEach((line, i) => {
                        let lx = isRL ? (vContentWidth - (i * lineHeight) - baseFontSize / 2) : ((i * lineHeight) + baseFontSize / 2);
                        let ly = 0; // 縦書きの進行方向(下)は content 上端から。横方向の中央寄せは textAlign/lx が担う
                        line.forEach(seg => {
                            ctx.fillStyle = seg.color || data.color || '#ef4444'; // ★保険: 万が一色を見失っても元の色を維持
                            ctx.font = `${seg.isBold ? 'bold ' : ''}${baseFontSize}px ${TEXT_FONT_STACK}`;
                            for (let j = 0; j < seg.text.length; j++) {
                                const char = seg.text[j];
                                ctx.fillText(char, lx, ly);
                                ly += baseFontSize;
                            }
                        });
                    });
                } else {
                    ctx.textAlign = 'left';
                    lines.forEach((line, i) => {
                        let lx = 0;
                        let ly = firstBaseline + i * lineHeight; // 各行のベースライン（画面と一致）

                        if (data.textAlign === 'center' || data.textAlign === 'right') {
                            let totalLineWidth = 0;
                            line.forEach(seg => {
                                ctx.font = `${seg.isBold ? 'bold ' : ''}${baseFontSize}px ${TEXT_FONT_STACK}`;
                                totalLineWidth += ctx.measureText(seg.text).width;
                            });
                            if (data.textAlign === 'center') {
                                lx = (width - 16 - totalLineWidth) / 2;
                            } else if (data.textAlign === 'right') {
                                lx = width - 16 - totalLineWidth;
                            }
                        }

                        line.forEach(seg => {
                            ctx.fillStyle = seg.color || data.color || '#ef4444'; // ★保険: 万が一色を見失っても元の色を維持
                            ctx.font = `${seg.isBold ? 'bold ' : ''}${baseFontSize}px ${TEXT_FONT_STACK}`;
                            const segWidth = ctx.measureText(seg.text).width;
                            ctx.fillText(seg.text, lx, ly);

                            if (seg.isUnderline) {
                                // 下線はベースラインの少し下
                                ctx.fillRect(lx, ly + baseFontSize * 0.12, segWidth, Math.max(1, baseFontSize * 0.05));
                            }
                            if (seg.isStrike) {
                                // 取り消し線は文字の中ほど（ベースラインより上）
                                ctx.fillRect(lx, ly - baseFontSize * 0.30, segWidth, Math.max(1, baseFontSize * 0.05));
                            }
                            lx += segWidth;
                        });
                    });
                }
            }

            ctx.restore();
        }

        // 【改修】オリジナル画質での書き出し処理（PDF解像度対応）
        // 書き出しは1つだけ。今の画面の見た目（暗記マーカーを隠しているかどうか）そのままで出す。
        document.getElementById('btn-download-menu').addEventListener('click', () => runNativeExport());
        document.getElementById('btn-save-editable-pdf-menu').addEventListener('click', () => exportEditablePdf());

        async function runNativeExport() {
            saveDropdownMenu.classList.remove('show');
            if (uploadedImage.style.display === 'none' && pdfContainer.style.display === 'none') { alert('先に画像かPDFを新規作成で開いてください。'); return; }
            window.deselectCurrent(); brushCursor.style.display = 'none';
            
            const loadingOverlay = document.getElementById('loading-overlay');
            loadingOverlay.style.display = 'flex'; 
            setLoadingDetail('ネイティブ書き出し中...');
            
            await new Promise(resolve => setTimeout(resolve, 50)); 

            try {
                const state = window.historyArray[window.historyIndex] || { elements: [], canvasCommandsArray: [] };
                
                await Promise.all(state.elements.filter(el => el.type === 'image').map(el => {
                    return new Promise(res => {
                        const img = new Image();
                        img.onload = () => { el._cachedImg = img; res(); };
                        img.onerror = res;
                        img.src = el.dataUrl;
                    });
                }));
                
                if (uploadedImage.style.display === 'block') {
                    const natWidth = uploadedImage.naturalWidth;
                    const natHeight = uploadedImage.naturalHeight;
                    const cssWidth = parseFloat(uploadedImage.style.width);
                    const scaleRatio = natWidth / cssWidth; 

                    const exportCanvas = document.createElement('canvas');
                    exportCanvas.width = natWidth;
                    exportCanvas.height = natHeight;
                    const eCtx = exportCanvas.getContext('2d');
                    
                    eCtx.drawImage(uploadedImage, 0, 0, natWidth, natHeight);

                    // 手描き（ペン/消しゴム）は独立レイヤーで合成し、消しゴムが背景画像を削らないようにする
                    const cmds = state.canvasCommandsArray[0] || [];
                    if (cmds.length > 0) {
                        const penLayer = document.createElement('canvas');
                        penLayer.width = natWidth;
                        penLayer.height = natHeight;
                        const pCtx = penLayer.getContext('2d');
                        pCtx.scale(scaleRatio, scaleRatio);
                        await executeCanvasCommands(pCtx, cmds);
                        eCtx.drawImage(penLayer, 0, 0);
                    }

                    eCtx.scale(scaleRatio, scaleRatio);
                    for (const el of state.elements) {
                        await drawDOMElementToCanvas(eCtx, el);
                    }
                    
                    const link = document.createElement('a'); 
                    link.download = `${window.currentFileName}_マスキング.png`; 
                    link.href = exportCanvas.toDataURL('image/png'); 
                    link.click();
                    window.track('save_document', { method: 'export_image' });

                } else if (pdfContainer.style.display === 'block') {
                    // 本命＝元PDFをラスタ化せず注釈だけ重ねる（劣化ゼロ・文字選択も生きる・サイズも元PDFとほぼ同じ）。
                    // pdf-lib が読めない／元PDFのバイト列が取れない／暗号化などで load に失敗した時だけ、
                    // 従来のラスタ化書き出し（exportPdfRaster）に自動で退避して機能を落とさない。
                    let usedVector = false;
                    if (typeof PDFLib !== 'undefined' && currentBackground && currentBackground.type === 'pdf' && currentBackground.dataURL) {
                        try {
                            await exportPdfVector(state, loadingOverlay);
                            usedVector = true;
                        } catch (e) {
                            console.warn('ベクタ書き出しに失敗。ラスタ化へ退避します:', e);
                        }
                    }
                    if (!usedVector) {
                        await exportPdfRaster(state, loadingOverlay);
                    }
                    window.track('save_document', { method: 'export_pdf' });
                }
            } catch (error) {
                console.error("ダウンロードエラー:", error);
                alert("エラーが発生しました。");
            } finally {
                loadingOverlay.style.display = 'none';
            }
        }

        // 注釈だけを透明キャンバスに描き、元PDFのそのページへPNGとして重ねる。
        // page.render() を呼ばない＝元PDFの文字はベクタのまま残り、劣化ゼロ・文字選択も生きる。
        async function buildAnnotationCanvas(page, pageIndex, state) {
            // 注釈（暗記マーカー/図形/ペン/文字）の解像度。背景がベクタでくっきりな分、注釈のラスタが甘く見えるため
            // 従来の3.0から引き上げる。ただしキャンバスの最長辺を上限で抑えてメモリ暴走を防ぐ。
            const base1 = page.getViewport({ scale: 1.0 });
            const maxDim = Math.max(base1.width, base1.height);
            const OVERLAY_MAX_DIM = 4000; // 最長辺のピクセル上限
            const OVERLAY_SCALE = Math.max(3.0, Math.min(5.0, OVERLAY_MAX_DIM / maxDim));
            const renderViewport = page.getViewport({ scale: OVERLAY_SCALE }); // 表示と同じ向き（回転を含む）
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(renderViewport.width);
            canvas.height = Math.round(renderViewport.height);
            const ctx = canvas.getContext('2d'); // 背景は描かない＝透明のまま

            const drawScale = OVERLAY_SCALE / window.pdfBaseScale;

            // 手描き（ペン/消しゴム）は独立レイヤーで合成し、消しゴム(destination-out)が
            // 後続の描画へ残留しないようにする（従来のラスタ経路と同じ作法）。
            const cmds = state.canvasCommandsArray[pageIndex - 1] || [];
            if (cmds.length > 0) {
                const penLayer = document.createElement('canvas');
                penLayer.width = canvas.width;
                penLayer.height = canvas.height;
                const pCtx = penLayer.getContext('2d');
                pCtx.scale(drawScale, drawScale);
                await executeCanvasCommands(pCtx, cmds);
                ctx.drawImage(penLayer, 0, 0);
            }

            ctx.save();
            ctx.scale(drawScale, drawScale);
            const pageDiv = document.getElementById(`pdf-page-${pageIndex}`);
            const pageTop = pageDiv ? pageDiv.offsetTop : 0;
            ctx.translate(0, -pageTop);
            for (const el of state.elements) {
                await drawDOMElementToCanvas(ctx, el);
            }
            ctx.restore();
            return canvas;
        }

        // キャンバスが完全に透明（＝注釈が1つも乗っていない）かを、縮小版のアルファで安く判定する。
        function isCanvasBlank(canvas) {
            const probe = document.createElement('canvas');
            probe.width = 256;
            probe.height = 256;
            const pc = probe.getContext('2d');
            pc.drawImage(canvas, 0, 0, probe.width, probe.height);
            const data = pc.getImageData(0, 0, probe.width, probe.height).data;
            for (let i = 3; i < data.length; i += 4) {
                if (data[i] !== 0) return false;
            }
            return true;
        }

        // CSSの色文字列を pdf-lib の rgb(0..1) と alpha に変換（共有canvasで全形式に対応）。
        const _colorCtx = document.createElement('canvas').getContext('2d');
        function parseCssColor(css, fallback) {
            try {
                _colorCtx.clearRect(0, 0, 1, 1);
                _colorCtx.fillStyle = fallback || '#000000';
                _colorCtx.fillStyle = css || fallback || '#000000';
                _colorCtx.fillRect(0, 0, 1, 1);
                const d = _colorCtx.getImageData(0, 0, 1, 1).data;
                return { r: d[0] / 255, g: d[1] / 255, b: d[2] / 255, a: d[3] / 255 };
            } catch (e) { return { r: 0, g: 0, b: 0, a: 1 }; }
        }

        // SVGパス文字列（このアプリは M / L / Q / Z のみ生成）を pdf-lib の描画オペレータへ。原点(ox,oy)へ平行移動。
        function svgPathToOps(L, d, ox, oy) {
            const toks = (d || '').match(/[a-zA-Z]|-?\d*\.?\d+(?:[eE]-?\d+)?/g) || [];
            const ops = []; let i = 0, cmd = '';
            const num = () => parseFloat(toks[i++]);
            while (i < toks.length) {
                if (/[a-zA-Z]/.test(toks[i])) { cmd = toks[i++]; }
                if (cmd === 'M') { const x = num(), y = num(); ops.push(L.moveTo(ox + x, oy + y)); cmd = 'L'; }
                else if (cmd === 'L') { const x = num(), y = num(); ops.push(L.lineTo(ox + x, oy + y)); }
                else if (cmd === 'Q') { const cxp = num(), cyp = num(), x = num(), y = num(); ops.push(L.appendQuadraticCurve(ox + cxp, oy + cyp, ox + x, oy + y)); }
                else if (cmd === 'Z' || cmd === 'z') { ops.push(L.closePath()); }
                else { i++; }
            }
            return ops;
        }

        // 本命：元PDFはベクタのまま、注釈もできる限りベクタで描き込む（劣化ゼロ・拡大に強い）。
        // 暗記マーカー/図形/手描きマスク/ペン線＝ベクタ、テキストと消しゴム入りのペン層＝高精細画像、
        // 貼り込んだ画像＝原寸で埋め込み。回転・CropBoxはページ毎の1枚のCTMで吸収する。
        async function exportPdfVector(state, loadingOverlay) {
            const L = PDFLib;
            const srcBytes = await (await fetch(currentBackground.dataURL)).arrayBuffer();
            const outDoc = await L.PDFDocument.load(srcBytes, { ignoreEncryption: true });
            const outPages = outDoc.getPages();

            // dataURL を pdf-lib の画像に（PNG/JPEGはそのまま、その他はcanvas経由でPNG化）。
            async function embedDataUrl(dataUrl) {
                if (/^data:image\/(png)/i.test(dataUrl)) {
                    return await outDoc.embedPng(dataUrl);
                } else if (/^data:image\/(jpe?g)/i.test(dataUrl)) {
                    return await outDoc.embedJpg(dataUrl);
                }
                const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = dataUrl; });
                const cv = document.createElement('canvas'); cv.width = img.naturalWidth || 1; cv.height = img.naturalHeight || 1;
                cv.getContext('2d').drawImage(img, 0, 0);
                const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
                return await outDoc.embedPng(new Uint8Array(await blob.arrayBuffer()));
            }
            // canvas を PNG 埋め込みに。
            async function embedCanvas(cv) {
                const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
                return await outDoc.embedPng(new Uint8Array(await blob.arrayBuffer()));
            }
            // E空間(左上原点・px・y下向き)の矩形へ画像を上向きで貼るオペレータ。
            function imageOps(outPage, img, ox, oy, w, h) {
                const name = outPage.node.newXObject('Img', img.ref);
                return [L.pushGraphicsState(), L.concatTransformationMatrix(w, 0, 0, -h, ox, oy + h), L.drawObject(name), L.popGraphicsState()];
            }

            const ST = 5; // テキスト等のラスタ部分の解像度倍率

            for (let i = 1; i <= totalPdfPages; i++) {
                setLoadingDetail(`PDFを生成中... (${i}/${totalPdfPages})`);
                await new Promise(r => setTimeout(r, 10));

                const page = await window.currentPdfDoc.getPage(i);
                const outPage = outPages[i - 1];

                // E空間(要素のスクリーンpx・ページ左上原点・y下向き) → pdf-lib ページ座標 のCTMを作る。
                // pdf.js の viewport.transform(user→表示px) を逆にし、pdfBaseScale と MediaBox原点を織り込む。
                const vp1 = page.getViewport({ scale: 1.0 });
                const V = vp1.transform; // [a,b,c,d,e,f]
                const mb = outPage.getMediaBox();
                const s = 1 / window.pdfBaseScale;
                const det = V[0] * V[3] - V[1] * V[2];
                const ia = V[3] / det, ib = -V[1] / det, ic = -V[2] / det, id = V[0] / det;
                const ie = (V[2] * V[5] - V[3] * V[4]) / det, iff = (V[1] * V[4] - V[0] * V[5]) / det;
                const N = { a: ia * s, b: ib * s, c: ic * s, d: id * s, e: ie - mb.x, f: iff - mb.y };

                const pageDiv = document.getElementById(`pdf-page-${i}`);
                const pageTop = pageDiv ? pageDiv.offsetTop : 0;
                const dispW = vp1.width * window.pdfBaseScale;  // ページ表示幅(px)
                const dispH = vp1.height * window.pdfBaseScale; // ページ表示高(px)

                // multiply / 半透明 の ExtGState をページ毎に一度だけ登録して名前を再利用。
                let mulName = null; const getMul = () => { if (!mulName) mulName = outPage.node.newExtGState('GS', outDoc.context.register(outDoc.context.obj({ Type: 'ExtGState', BM: 'Multiply' }))); return mulName; };
                const alphaNames = {}; const getAlpha = (o) => { const k = o.toFixed(3); if (!alphaNames[k]) alphaNames[k] = outPage.node.newExtGState('GS', outDoc.context.register(outDoc.context.obj({ Type: 'ExtGState', ca: o, CA: o }))); return alphaNames[k]; };

                const body = []; // クリップの内側に積む描画オペレータ
                const yHit = (top, h) => !((top + h) < pageTop || top > (pageTop + dispH)); // このページに掛かるか

                // --- ペン層（最背面）。消しゴム/旧base64があれば正しく合成するため高精細ラスタ、無ければベクタ線。
                const cmds = state.canvasCommandsArray[i - 1] || [];
                if (cmds.length > 0) {
                    const needsRaster = cmds.some(c => c.tool && c.tool !== 'pen');
                    if (needsRaster) {
                        // ペン点はページ内ローカルpx。高精細のためスクリーンpxをST倍で焼く。
                        const pcv = document.createElement('canvas');
                        pcv.width = Math.max(1, Math.round(dispW * ST));
                        pcv.height = Math.max(1, Math.round(dispH * ST));
                        const pctx = pcv.getContext('2d');
                        pctx.scale(ST, ST);
                        await executeCanvasCommands(pctx, cmds);
                        const img = await embedCanvas(pcv);
                        body.push(...imageOps(outPage, img, 0, 0, dispW, dispH));
                    } else {
                        for (const cmd of cmds) {
                            const pts = cmd.points; if (!pts || pts.length === 0) continue;
                            const col = parseCssColor(cmd.color, '#000000');
                            const o = (cmd.opacity === undefined) ? 1 : parseFloat(cmd.opacity);
                            const seg = [L.pushGraphicsState()];
                            if (o < 1) seg.push(L.setGraphicsState(getAlpha(o)));
                            seg.push(L.setStrokingColor(L.rgb(col.r, col.g, col.b)), L.setLineWidth(cmd.width), L.setLineCap(L.LineCapStyle.Round), L.setLineJoin(L.LineJoinStyle.Round));
                            seg.push(L.moveTo(pts[0].x, pts[0].y));
                            if (pts.length < 3) {
                                seg.push(L.lineTo((pts[1] || pts[0]).x + 0.01, (pts[1] || pts[0]).y + 0.01));
                            } else {
                                for (let k = 1; k < pts.length - 1; k++) {
                                    const mx = (pts[k].x + pts[k + 1].x) / 2, my = (pts[k].y + pts[k + 1].y) / 2;
                                    seg.push(L.appendQuadraticCurve(pts[k].x, pts[k].y, mx, my));
                                }
                                seg.push(L.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y));
                            }
                            seg.push(L.stroke(), L.popGraphicsState());
                            body.push(...seg);
                        }
                    }
                }

                // --- 要素をz順に。ベクタで描けるものはベクタ、テキスト/画像はラスタ埋め込み。
                for (const data of state.elements) {
                    if (window.isMasksHidden && (data.type === 'mask' || data.type === 'freehand-mask')) continue;
                    const left = parseFloat(data.left || 0);
                    const top = parseFloat(data.top || 0);
                    let w = parseFloat(data.width); if (isNaN(w)) w = 300;
                    let h = parseFloat(data.height); if (isNaN(h)) h = 100;
                    if (!yHit(top, h)) continue;
                    const ox = left, oy = top - pageTop; // E空間の要素原点

                    if (data.type === 'mask') {
                        const c = parseCssColor(data.color, 'black');
                        body.push(L.pushGraphicsState(), L.setFillingColor(L.rgb(c.r, c.g, c.b)), L.rectangle(ox, oy, w, h), L.fill(), L.popGraphicsState());
                    } else if (data.type === 'highlight') {
                        const c = parseCssColor(data.backgroundColor, '#ffff00');
                        body.push(L.pushGraphicsState(), L.setGraphicsState(getMul()), L.setFillingColor(L.rgb(c.r, c.g, c.b)), L.rectangle(ox, oy, w, h), L.fill(), L.popGraphicsState());
                    } else if (data.type === 'freehand-mask') {
                        const c = parseCssColor(data.color, 'black');
                        body.push(L.pushGraphicsState(), L.setStrokingColor(L.rgb(c.r, c.g, c.b)), L.setLineWidth(parseFloat(data.strokeWidth || 15)), L.setLineCap(L.LineCapStyle.Round), L.setLineJoin(L.LineJoinStyle.Round), ...svgPathToOps(L, data.pathD, ox, oy), L.stroke(), L.popGraphicsState());
                    } else if (data.type === 'freehand-highlight') {
                        const c = parseCssColor(data.color, '#ffff00');
                        body.push(L.pushGraphicsState(), L.setGraphicsState(getMul()), L.setStrokingColor(L.rgb(c.r, c.g, c.b)), L.setLineWidth(parseFloat(data.strokeWidth || 20)), L.setLineCap(L.LineCapStyle.Round), L.setLineJoin(L.LineJoinStyle.Round), ...svgPathToOps(L, data.pathD, ox, oy), L.stroke(), L.popGraphicsState());
                    } else if (data.type === 'shape') {
                        const c = parseCssColor(data.color, '#ef4444');
                        const seg = [L.pushGraphicsState(), L.setStrokingColor(L.rgb(c.r, c.g, c.b)), L.setLineWidth(parseFloat(data.strokeWidth || 3))];
                        if (data.shapeType === 'rect') {
                            seg.push(L.rectangle(ox, oy, w, h), L.stroke());
                        } else if (data.shapeType === 'circle') {
                            const K = 0.5522847498, rx = w / 2, ry = h / 2, mxc = ox + rx, myc = oy + ry;
                            seg.push(L.moveTo(mxc, oy));
                            seg.push(L.appendBezierCurve(mxc + K * rx, oy, ox + w, myc - K * ry, ox + w, myc));
                            seg.push(L.appendBezierCurve(ox + w, myc + K * ry, mxc + K * rx, oy + h, mxc, oy + h));
                            seg.push(L.appendBezierCurve(mxc - K * rx, oy + h, ox, myc + K * ry, ox, myc));
                            seg.push(L.appendBezierCurve(ox, myc - K * ry, mxc - K * rx, oy, mxc, oy));
                            seg.push(L.stroke());
                        } else if (data.shapeType === 'line') {
                            if (data.lineDir === '/') { seg.push(L.moveTo(ox, oy + h), L.lineTo(ox + w, oy)); }
                            else { seg.push(L.moveTo(ox, oy), L.lineTo(ox + w, oy + h)); }
                            seg.push(L.stroke());
                        }
                        seg.push(L.popGraphicsState());
                        body.push(...seg);
                    } else if (data.type === 'image') {
                        if (data.dataUrl) {
                            const img = await embedDataUrl(data.dataUrl);
                            body.push(...imageOps(outPage, img, ox, oy, w, h));
                        }
                    } else if (data.type === 'text') {
                        const tcv = document.createElement('canvas');
                        tcv.width = Math.max(1, Math.round(w * ST));
                        tcv.height = Math.max(1, Math.round(h * ST));
                        const tctx = tcv.getContext('2d');
                        tctx.scale(ST, ST);
                        await drawDOMElementToCanvas(tctx, { ...data, left: 0, top: 0 });
                        const img = await embedCanvas(tcv);
                        body.push(...imageOps(outPage, img, ox, oy, w, h));
                    }
                }

                // このページに描くものが無ければ、元ページを一切触らない（サイズも増やさない）。
                if (body.length === 0) continue;

                const ops = [
                    L.pushGraphicsState(),
                    L.concatTransformationMatrix(N.a, N.b, N.c, N.d, N.e, N.f),
                    L.rectangle(0, 0, dispW, dispH), L.clip(), L.endPath(),
                    ...body,
                    L.popGraphicsState(),
                ];
                outPage.pushOperators(...ops);
            }

            const outBytes = await outDoc.save();
            const blob = new Blob([outBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.download = `${window.currentFileName}_マスキング.pdf`;
            link.href = url;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 10000);
        }

        // 退避経路：pdf-lib が使えない時だけ従来どおりページ全体をラスタ化して貼る（画質は落ちるが確実に出る）。
        async function exportPdfRaster(state, loadingOverlay) {
            const { jsPDF } = window.jspdf;
            let pdf = null;
            const EXPORT_RENDER_SCALE = 3.0;

            for (let i = 1; i <= totalPdfPages; i++) {
                setLoadingDetail(`PDFを生成中... (${i}/${totalPdfPages})`);
                await new Promise(r => setTimeout(r, 10));

                const page = await window.currentPdfDoc.getPage(i);
                const originalViewport = page.getViewport({ scale: 1.0 });
                const renderViewport = page.getViewport({ scale: EXPORT_RENDER_SCALE });

                const exportCanvas = document.createElement('canvas');
                exportCanvas.width = renderViewport.width;
                exportCanvas.height = renderViewport.height;
                const eCtx = exportCanvas.getContext('2d');

                await page.render({ canvasContext: eCtx, viewport: renderViewport }).promise;

                eCtx.save();
                const drawScale = EXPORT_RENDER_SCALE / window.pdfBaseScale;
                const cmds = state.canvasCommandsArray[i-1] || [];
                if (cmds.length > 0) {
                    const penLayer = document.createElement('canvas');
                    penLayer.width = exportCanvas.width;
                    penLayer.height = exportCanvas.height;
                    const pCtx = penLayer.getContext('2d');
                    pCtx.scale(drawScale, drawScale);
                    await executeCanvasCommands(pCtx, cmds);
                    eCtx.drawImage(penLayer, 0, 0);
                }

                eCtx.scale(drawScale, drawScale);
                const pageDiv = document.getElementById(`pdf-page-${i}`);
                const pageTop = pageDiv ? pageDiv.offsetTop : 0;
                eCtx.translate(0, -pageTop);
                for (const el of state.elements) {
                    await drawDOMElementToCanvas(eCtx, el);
                }
                eCtx.restore();

                const imgData = exportCanvas.toDataURL('image/jpeg', 0.9);
                if (!pdf) {
                    pdf = new jsPDF(originalViewport.width > originalViewport.height ? 'l' : 'p', 'pt', [originalViewport.width, originalViewport.height]);
                } else {
                    pdf.addPage([originalViewport.width, originalViewport.height], originalViewport.width > originalViewport.height ? 'l' : 'p');
                }
                pdf.addImage(imgData, 'JPEG', 0, 0, originalViewport.width, originalViewport.height);
            }
            pdf.save(`${window.currentFileName}_マスキング.pdf`);
        }

