// ===== 50-pages.js : ページの組み立て・PDF描画・背景の読み込み・データの復元 =====
// app.js を分割したもの。素のスクリプトなので変数は全ファイルで共有される。
// index.html の読み込み順を変えると壊れる。

        function initWorkspace(isPdf = false) {
            workspace.querySelectorAll('.canvas-element').forEach(e => e.remove());
            window.deselectCurrent(); window.historyArray = []; window.historyIndex = -1; window.canvasDrawings = [];
            
            setTimeout(() => {
                if (!isPdf) {
                    let drawSvg = workspace.querySelector('.drawing-svg');
                    if (!drawSvg) {
                        drawSvg = createDrawSVG(workspace.offsetWidth, workspace.offsetHeight);
                        workspace.appendChild(drawSvg);
                    } else {
                        drawSvg.setAttribute('viewBox', `0 0 ${workspace.offsetWidth} ${workspace.offsetHeight}`);
                    }
                }

                workspace.querySelectorAll('.drawing-svg').forEach((c, i) => {
                    c.dataset.canvasIndex = i;
                    window.canvasDrawings[i] = [];
                    renderStrokesToSVG(c, []);
                });
                
                setZoom(1.0);
                window.centerWorkspace();   // 読み込み直後は紙を画面の中央に置く
                // 空の初期状態を履歴の起点(index 0)として必ず積む（undoで全消去される不具合の防止）
                window.historyArray = []; window.historyIndex = -1;
                window.saveState();
            }, 50);
        }

        // いま表示しているページ。表示を書き換えるのは変わった時だけにする
        // （毎フレーム書き換えると、一覧が滑り続けて操作を奪う）。
        let shownPage = 1;
        function markActivePage(p, scrollThumb) {
            if (p === shownPage) return;
            shownPage = p;
            // 打ちかけの数字だけは横から書き換えない（ただ触っているだけなら追随する）
            if (!(document.activeElement === pageInput && pageInputDirty)) pageInput.value = p;
            document.querySelectorAll('.pdf-thumb').forEach(t => t.classList.toggle('active', parseInt(t.dataset.page) === p));
            if (!scrollThumb) return;
            const activeThumb = document.querySelector(`.pdf-thumb[data-page="${p}"]`);
            // 一覧の中だけを動かす。`scrollIntoView` は親（本文側）まで動かしてしまう。
            if (activeThumb) {
                const top = activeThumb.offsetTop - (pdfSidebar.clientHeight - activeThumb.offsetHeight) / 2;
                pdfSidebar.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
            }
        }

        // 「いま飛んでいる先」。決まっている間は、通過するページで番号や印を書き換えない。
        // これが無いと、飛んでいる途中のページ番号が入力欄に入り、次の1回がその数字から
        // 始まる＝矢印を押しているのに戻っていく（Rayan様の報告・08-03）。
        // 以前は「1200ms のあいだ」という時間で抑えていたが、抑えていたのは一覧の追従だけで
        // 番号は素通りしていた。目的地そのものを持たせて、着くまで一切触らせない。
        let jumpTarget = null;
        let jumpIdleTimer = 0;
        let jumpScrollTimer = 0;

        // スクロールが止まってから少し待って「着いた」とみなす（時間の決め打ちをやめる）
        // 着いた時点で必ず実際の位置から番号を引き直す。飛んでいる途中に人が手で
        // スクロールして割り込むと、番号が飛び先のまま古く残るため。
        function endJumpWhenSettled() {
            clearTimeout(jumpIdleTimer);
            jumpIdleTimer = setTimeout(() => {
                jumpTarget = null;
                syncPageFromScroll();
            }, 220);
        }

        function goToPage(p) {
            if (!Number.isFinite(p)) { pageInput.value = shownPage; return; }
            p = Math.min(Math.max(Math.round(p), 1), totalPdfPages || 1);
            if (!document.getElementById(`pdf-page-${p}`)) return;

            jumpTarget = p;
            pageInput.value = p;
            markActivePage(p, true);
            endJumpWhenSettled();

            // 連打の途中で毎回スクロールをやり直すとガタつく。押し終わってから1回だけ飛ぶ。
            clearTimeout(jumpScrollTimer);
            jumpScrollTimer = setTimeout(() => {
                const targetPage = document.getElementById(`pdf-page-${jumpTarget}`);
                if (!targetPage) return;
                const currentMarginTop = parseFloat(workspaceWrapper.style.marginTop) || 0;
                workspaceContainer.scrollTo({
                    top: (targetPage.offsetTop * zoomLevel) + currentMarginTop,
                    behavior: 'smooth'
                });
                endJumpWhenSettled();
            }, 160);
        }

        // 矢印は紙の動く向きに合わせる：↑＝前のページ、↓＝次のページ。
        // 入力欄でのキーボードの上下も同じ向きに揃える（ボタンと食い違わないように）。
        document.getElementById('btn-page-prev').addEventListener('click', () => goToPage((jumpTarget ?? shownPage) - 1));
        document.getElementById('btn-page-next').addEventListener('click', () => goToPage((jumpTarget ?? shownPage) + 1));

        let pageInputDirty = false;
        pageInput.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowUp') { e.preventDefault(); goToPage((jumpTarget ?? shownPage) - 1); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); goToPage((jumpTarget ?? shownPage) + 1); }
        });
        pageInput.addEventListener('input', () => { pageInputDirty = true; });
        pageInput.addEventListener('blur', () => { pageInputDirty = false; });
        pageInput.addEventListener('change', () => { pageInputDirty = false; goToPage(parseInt(pageInput.value)); });

        // いまのスクロール位置から現在ページを割り出して表示に反映する
        function syncPageFromScroll() {
            if (pdfContainer.style.display !== 'block') return;
            const currentMarginTop = parseFloat(workspaceWrapper.style.marginTop) || 0;
            const containerCenter = (workspaceContainer.scrollTop - currentMarginTop + workspaceContainer.clientHeight / 2) / zoomLevel;
            // 画面の真ん中にいちばん近いページを今のページとする。
            // 「真ん中を含むページ」だけを見ると、ページの隙間に来た時に
            // 1ページ目へ跳ね返っていた。
            let currentP = shownPage, best = Infinity;
            document.querySelectorAll('.pdf-page').forEach(p => {
                const top = p.offsetTop, bottom = top + p.offsetHeight;
                const d = containerCenter < top ? top - containerCenter
                        : containerCenter > bottom ? containerCenter - bottom : 0;
                if (d < best) { best = d; currentP = parseInt(p.dataset.page); }
            });
            markActivePage(currentP, true);
        }

        let scrollRafPending = false;
        workspaceContainer.addEventListener('scroll', () => {
            if (pdfContainer.style.display !== 'block') return;
            if (scrollRafPending) return; // 1フレームに1回だけ処理（大量ページでのジャンク防止）
            scrollRafPending = true;
            requestAnimationFrame(() => {
                scrollRafPending = false;
                // 指定ページへ飛んでいる最中は、通過するページで番号も一覧も動かさない
                if (jumpTarget !== null) { endJumpWhenSettled(); return; }
                syncPageFromScroll();
            });
        });

        let isSidebarOpen = false;
        btnToggleSidebar.addEventListener('click', () => {
            isSidebarOpen = !isSidebarOpen;
            pdfSidebar.style.display = isSidebarOpen ? 'flex' : 'none';
        });

        async function renderPdfPageAsync(pageDiv, targetZoom = 1.0) {
            pageDiv.dataset.rendering = "true";
            const pageNum = parseInt(pageDiv.dataset.page);
            try {
                const page = await window.currentPdfDoc.getPage(pageNum);
                const viewport = page.getViewport({ scale: window.pdfBaseScale });
                
                pageDiv.style.width = viewport.width + 'px'; 
                pageDiv.style.height = viewport.height + 'px';
                
                const dynamicScale = Math.min(RENDER_SCALE * targetZoom, 4.0);
                
                const canvas = pageDiv.querySelector('canvas:not(.drawing-canvas)');
                canvas.width = viewport.width * dynamicScale; 
                canvas.height = viewport.height * dynamicScale; 
                
                const textLayerDiv = pageDiv.querySelector('.textLayer');
                textLayerDiv.style.width = viewport.width + 'px'; 
                textLayerDiv.style.height = viewport.height + 'px'; 
                textLayerDiv.style.setProperty('--scale-factor', viewport.scale);
                
                const scaledViewport = page.getViewport({ scale: window.pdfBaseScale * dynamicScale });
                await page.render({ canvasContext: canvas.getContext('2d'), viewport: scaledViewport }).promise;

                const textContent = await page.getTextContent();
                textLayerDiv.textContent = ''; // 再描画（ズーム時など）で既存spanが二重に累積するのを防ぐ
                pdfjsLib.renderTextLayer({ textContentSource: textContent, container: textLayerDiv, viewport: viewport, textDivs: [] });

                // 手描きレイヤー（SVG）はベクターなのでズームで再描画不要。viewBoxだけ保証し、内容を再構築。
                const drawSvg = pageDiv.querySelector('.drawing-svg');
                if (drawSvg) {
                    drawSvg.setAttribute('viewBox', `0 0 ${viewport.width} ${viewport.height}`);
                    const canvasIndex = parseInt(drawSvg.dataset.canvasIndex);
                    renderStrokesToSVG(drawSvg, window.canvasDrawings[canvasIndex] || []);
                }
                pageDiv.dataset.rendered = "true";
            } catch(e) {
                console.error("Page rendering failed", e);
                // 失敗したページは未描画に戻し、次に視界へ入った時に描き直せるようにする
                pageDiv.dataset.rendered = "false";
            } finally {
                pageDiv.dataset.rendering = "false";
            }
        }

        async function renderPdfThumbAsync(thumbDiv) {
            thumbDiv.dataset.rendering = "true";
            const pageNum = parseInt(thumbDiv.dataset.page);
            try {
                const page = await window.currentPdfDoc.getPage(pageNum);
                const thumbScale = 150 / window.pdfViewport1.width; 
                const thumbViewport = page.getViewport({ scale: thumbScale });
                
                const thumbCanvas = thumbDiv.querySelector('canvas');
                thumbCanvas.width = thumbViewport.width; 
                thumbCanvas.height = thumbViewport.height;
                await page.render({ canvasContext: thumbCanvas.getContext('2d'), viewport: thumbViewport }).promise;
                thumbDiv.dataset.rendered = "true";
            } catch(e) {
                console.error("Thumb rendering failed", e);
                thumbDiv.dataset.rendered = "false";
            } finally {
                thumbDiv.dataset.rendering = "false";
            }
        }

        async function loadBackground(bgData) {
            pdfSidebar.innerHTML = ''; document.getElementById('floating-top-left').style.display = 'none';
            isSidebarOpen = false; pdfSidebar.style.display = 'none';
            workspace.querySelectorAll('.drawing-canvas, .drawing-svg').forEach(c => c.remove());
            
            return new Promise(async (resolve, reject) => {
                if (bgData.type === 'pdf') {
                    if (typeof pdfjsLib === 'undefined') {
                        alert('PDF機能の読み込みに失敗しました。通信環境を確認して再読み込みしてください。');
                        return reject(new Error('pdfjsLib unavailable'));
                    }
                    uploadedImage.style.display = 'none'; pdfContainer.style.display = 'block';
                    const loadingOverlay = document.getElementById('loading-overlay');
                    loadingOverlay.style.display = 'flex';
                    setLoadingDetail('PDFを読み込み中...');
                    
                    try {
                        // 旧 PDF を破棄してから新しいものを読む（destroy しないとワーカ/バッファが積み上がる・08-02 修正）
                        if (window.currentPdfDoc) { try { await window.currentPdfDoc.destroy(); } catch (_) {} window.currentPdfDoc = null; }
                        const res = await fetch(bgData.dataURL);
                        const arrayBuffer = await res.arrayBuffer();
                        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
                        pdfContainer.innerHTML = ''; 
                        
                        totalPdfPages = pdf.numPages; pageTotal.innerText = totalPdfPages; pageInput.max = totalPdfPages; pageInput.value = 1;
                        document.getElementById('floating-top-left').style.display = 'flex';

                        const page1 = await pdf.getPage(1); 
                        const viewport1 = page1.getViewport({ scale: 1.0 });
                        const containerW = workspaceContainer.clientWidth; 
                        const baseScale = (containerW * 0.9) / viewport1.width;
                        const defaultViewport = page1.getViewport({ scale: baseScale });
                        
                        window.currentPdfDoc = pdf;
                        window.pdfBaseScale = baseScale;
                        window.pdfViewport1 = viewport1;
                        shownPage = 1; jumpTarget = null; // 新しいPDFなので現在ページを1に戻す
                        
                        if (window.pageObserver) window.pageObserver.disconnect();
                        if (window.thumbObserver) window.thumbObserver.disconnect();
                        
                        window.pageObserver = new IntersectionObserver((entries) => {
                            entries.forEach(entry => {
                                if (entry.isIntersecting && entry.target.dataset.rendered !== "true" && entry.target.dataset.rendering !== "true") {
                                    renderPdfPageAsync(entry.target, zoomLevel);
                                }
                            });
                        }, { root: workspaceContainer, rootMargin: '800px 0px' });

                        window.thumbObserver = new IntersectionObserver((entries) => {
                            entries.forEach(entry => {
                                if (entry.isIntersecting && entry.target.dataset.rendered !== "true" && entry.target.dataset.rendering !== "true") {
                                    renderPdfThumbAsync(entry.target);
                                }
                            });
                        }, { root: pdfSidebar, rootMargin: '300px 0px' });

                        for (let i = 1; i <= pdf.numPages; i++) {
                            const pageDiv = document.createElement('div'); 
                            pageDiv.className = 'pdf-page'; 
                            pageDiv.id = `pdf-page-${i}`; 
                            pageDiv.dataset.page = i;
                            pageDiv.dataset.rendered = "false";
                            pageDiv.style.width = defaultViewport.width + 'px'; 
                            pageDiv.style.height = defaultViewport.height + 'px';
                            
                            const canvas = document.createElement('canvas'); 
                            canvas.style.display = 'block'; 
                            canvas.style.width = '100%'; 
                            canvas.style.height = '100%';
                            pageDiv.appendChild(canvas);
                            
                            const textLayerDiv = document.createElement('div'); 
                            textLayerDiv.className = 'textLayer'; 
                            textLayerDiv.style.width = defaultViewport.width + 'px'; 
                            textLayerDiv.style.height = defaultViewport.height + 'px';
                            pageDiv.appendChild(textLayerDiv);
                            
                            const drawSvg = createDrawSVG(defaultViewport.width, defaultViewport.height);
                            pageDiv.appendChild(drawSvg);
                            
                            pdfContainer.appendChild(pageDiv);
                            window.pageObserver.observe(pageDiv);

                            const thumbDiv = document.createElement('div'); 
                            thumbDiv.className = 'pdf-thumb'; 
                            if (i === 1) thumbDiv.classList.add('active');
                            thumbDiv.dataset.page = i; 
                            thumbDiv.dataset.rendered = "false";
                            
                            const thumbCanvas = document.createElement('canvas'); 
                            const thumbScale = 150 / viewport1.width; 
                            thumbCanvas.width = viewport1.width * thumbScale; 
                            thumbCanvas.height = viewport1.height * thumbScale;
                            thumbDiv.appendChild(thumbCanvas);
                            
                            const thumbSpan = document.createElement('span');
                            thumbSpan.innerText = `Page ${i}`;
                            thumbDiv.appendChild(thumbSpan);
                            
                            pdfSidebar.appendChild(thumbDiv);
                            window.thumbObserver.observe(thumbDiv);
                            
                            thumbDiv.addEventListener('click', () => goToPage(i));
                        }
                        
                        loadingOverlay.style.display = 'none'; 
                        initWorkspace(true);
                        setTimeout(resolve, 100);
                    } catch (error) {
                        // 知らせるのは呼んだ側の仕事。ここで alert すると二重に出る
                        console.error("PDFの読み込みに失敗:", error); loadingOverlay.style.display = 'none';
                        reject(error);
                    }
                } else {
                    pdfContainer.style.display = 'none';
                    const tempImg = new Image();
                    tempImg.onload = function() {
                        const containerW = workspaceContainer.clientWidth; 
                        const finalScale = (containerW * 0.72) / tempImg.naturalWidth;
                        uploadedImage.style.width = (tempImg.naturalWidth * finalScale) + 'px'; uploadedImage.style.height = (tempImg.naturalHeight * finalScale) + 'px';
                        uploadedImage.src = tempImg.src; uploadedImage.style.display = 'block';
                        initWorkspace(false);
                        setTimeout(resolve, 100);
                    };
                    tempImg.onerror = reject;
                    tempImg.src = bgData.dataURL;
                }
            });
        }

        imageInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;

            const lastDotIndex = file.name.lastIndexOf('.');
            window.setCurrentFileName(lastDotIndex > 0 ? file.name.substring(0, lastDotIndex) : file.name);

            const isPdfFile = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
            const reader = new FileReader();
            reader.onload = async function(event) {
                const loadingOverlay = document.getElementById('loading-overlay');
                try {
                    currentBackground = {
                        type: isPdfFile ? 'pdf' : 'image',
                        dataURL: event.target.result
                    };
                    await loadBackground(currentBackground);
                    await persistBackground(); // 新しい背景を自動保存に反映
                    scheduleAutosave();
                    // 開けた時だけ数える（失敗した回を混ぜない）
                    window.track('create_document', { file_type: isPdfFile ? 'pdf' : 'image' });
                } catch (error) {
                    console.error(error);
                    currentBackground = null;
                    loadingOverlay.style.display = 'none';
                    alert(isPdfFile
                        ? 'このPDFを開けませんでした。\nファイルが壊れているか、パスワードで保護されている可能性があります。'
                        : 'この画像を開けませんでした。\n対応していない形式か、ファイルが壊れている可能性があります。');
                } finally {
                    // 失敗した時こそ空にする。空にしないと同じファイルを選び直しても反応しない
                    e.target.value = '';
                }
            };
            reader.onerror = () => {
                console.error(reader.error);
                e.target.value = '';
                alert('ファイルを読み取れませんでした。もう一度選び直してください。');
            };
            reader.readAsDataURL(file);
        });

        document.getElementById('btn-save-project-menu').addEventListener('click', () => {
            saveDropdownMenu.classList.remove('show');
            if (!currentBackground) {
                alert("まずは画像かPDFを新規作成で開いてください。");
                return;
            }
            
            const loadingOverlay = document.getElementById('loading-overlay');
            setLoadingDetail('プロジェクトを保存中...');
            loadingOverlay.style.display = 'flex';
            
            try {
                const projectData = buildProjectData();
                const jsonStr = JSON.stringify(projectData);
                const blob = new Blob([jsonStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                
                a.download = `${window.currentFileName}.amk`;
                a.href = url;
                a.click();
                // すぐ捨てると保存が途中で切られることがある。他の書き出しと同じく遅らせる
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                window.track('save_document', { method: 'amk' });
            } catch (e) {
                console.error(e);
                alert("保存エラーが発生しました。");
            } finally {
                loadingOverlay.style.display = 'none';
            }
        });

        function loadDataToWorkspace(projectData) {
            workspace.querySelectorAll('.canvas-element').forEach(el => el.remove());
            window.deselectCurrent();

            if (projectData.elements && projectData.elements.length > 0) {
                projectData.elements.forEach(data => {
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
            }

            if (projectData.canvasCommandsArray) {
                window.canvasDrawings = projectData.canvasCommandsArray;
            } else if (projectData.canvasDataArray) {
                window.canvasDrawings = projectData.canvasDataArray.map(data => 
                    data ? [{ tool: 'legacy_base64', dataURL: data }] : []
                );
            }

            const svgs = Array.from(workspace.querySelectorAll('.drawing-svg'));
            svgs.forEach((svg, i) => {
                if (projectData.canvasZIndexes && projectData.canvasZIndexes[i]) {
                    svg.style.zIndex = projectData.canvasZIndexes[i];
                }
                renderStrokesToSVG(svg, window.canvasDrawings[i] || []);
            });

            window.historyArray = [];
            window.historyIndex = -1;
            window.saveState();
        }

        document.getElementById('projectInput').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const lastDotIndex = file.name.lastIndexOf('.');
            window.setCurrentFileName(lastDotIndex > 0 ? file.name.substring(0, lastDotIndex) : file.name);

            // 「編集用」として書き出したPDFなら、中の作業データを取り出して続きから開く
            const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
            if (isPdf) {
                const r = new FileReader();
                r.onload = async (ev) => {
                    const loadingOverlay = document.getElementById('loading-overlay');
                    try {
                        setLoadingDetail('データを復元中...');
                        loadingOverlay.style.display = 'flex';
                        await new Promise(res => setTimeout(res, 50));

                        const buf = ev.target.result;
                        const embedded = await readEmbeddedProject(buf);
                        const dataURL = 'data:application/pdf;base64,' + bytesToBase64(new Uint8Array(buf));

                        if (embedded) {
                            await applyProjectData({ ...embedded, background: { type: 'pdf', dataURL } });
                        } else {
                            // 作業データが入っていないPDF＝ただのPDF。新規として開く
                            currentBackground = { type: 'pdf', dataURL };
                            await loadBackground(currentBackground);
                            alert('このPDFには作業データが入っていません。新しいPDFとして開きました。\n（続きから編集するには「編集できるPDFで保存」で出したファイルを選んでください）');
                        }
                        await persistBackground();
                        scheduleAutosave();
                    } catch (error) {
                        console.error(error);
                        alert('このPDFを開けませんでした。\nファイルが壊れているか、パスワードで保護されている可能性があります。');
                    } finally {
                        loadingOverlay.style.display = 'none';
                        // 失敗した時こそ空にする。空にしないと同じファイルを選び直しても反応しない
                        e.target.value = '';
                    }
                };
                r.onerror = () => {
                    console.error(r.error);
                    e.target.value = '';
                    alert('ファイルを読み取れませんでした。もう一度選び直してください。');
                };
                r.readAsArrayBuffer(file);
                return;
            }

            const reader = new FileReader();
            reader.onload = async (event) => {
                const loadingOverlay = document.getElementById('loading-overlay');
                try {
                    loadingOverlay.style.display = 'flex';
                    setLoadingDetail('データを復元中...');

                    let projectData = JSON.parse(event.target.result);
                    await applyProjectData(projectData);
                } catch (error) {
                    console.error(error);
                    alert("ファイルの読み込みに失敗しました。正しいデータを選択してください。");
                } finally {
                    loadingOverlay.style.display = 'none';
                    // 失敗した時こそ空にする。空にしないと同じファイルを選び直しても反応しない
                    e.target.value = '';
                }
            };
            reader.onerror = () => {
                console.error(reader.error);
                e.target.value = '';
                alert('ファイルを読み取れませんでした。もう一度選び直してください。');
            };
            reader.readAsText(file);
        });

        // .amk読込・自動保存復元で共通のプロジェクト適用処理（背景ロード＋スケール補正＋要素復元）
        async function applyProjectData(projectData) {
            if (!projectData || !projectData.background) throw new Error("無効なデータです");

            currentBackground = projectData.background;
            await loadBackground(currentBackground);

            const bgScale = currentBgScale();
            const savedScale = projectData.bgScale || bgScale;
            const scaleRatio = bgScale / savedScale;

            let originalPageHeight = 0;
            const GAP = 20;
            if (currentBackground.type === 'pdf') {
                originalPageHeight = window.pdfViewport1.height * savedScale;
            }

            if (projectData.elements) {
                projectData.elements = projectData.elements.map(el => {
                    if (el.left) el.left = (parseFloat(el.left) * scaleRatio) + 'px';
                    if (el.top) {
                        let oldTop = parseFloat(el.top);
                        if (currentBackground.type === 'pdf' && originalPageHeight > 0) {
                            const k = Math.floor(oldTop / (originalPageHeight + GAP));
                            const oldTopWithoutGaps = oldTop - (k * GAP);
                            const newTopWithoutGaps = oldTopWithoutGaps * scaleRatio;
                            el.top = (newTopWithoutGaps + (k * GAP)) + 'px';
                        } else {
                            el.top = (oldTop * scaleRatio) + 'px';
                        }
                    }
                    if (el.width) el.width = (parseFloat(el.width) * scaleRatio) + 'px';
                    if (el.height) el.height = (parseFloat(el.height) * scaleRatio) + 'px';
                    if (el.fontSize) el.fontSize = (parseFloat(el.fontSize) * scaleRatio) + 'px';
                    if (el.strokeWidth) el.strokeWidth = parseFloat(el.strokeWidth) * scaleRatio;
                    if (el.pathD) {
                        el.pathD = el.pathD.replace(/([\d.-]+)/g, match => (parseFloat(match) * scaleRatio).toFixed(2));
                    }
                    return el;
                });
            }

            if (projectData.canvasCommandsArray) {
                projectData.canvasCommandsArray = projectData.canvasCommandsArray.map(cmds => {
                    return cmds.map(cmd => {
                        if (cmd.tool === 'legacy_base64') return cmd;
                        return {
                            ...cmd,
                            width: cmd.width * scaleRatio,
                            points: cmd.points.map(p => ({ x: p.x * scaleRatio, y: p.y * scaleRatio }))
                        };
                    });
                });
            }

            await new Promise(r => setTimeout(r, 500));
            loadDataToWorkspace(projectData);
            await persistBackground(); // 復元後、以降の自動保存のため背景を確実に保存
        }

        /* =========================================================
           指での操作（スマホ・タブレット）
           - #workspace-container は touch-action:none（1本指で描くために必須）なので、
             拡大・縮小・スクロールはブラウザ任せにできない。ここで自前で実装する。
           - 2本目の指が触れた時点で、描きかけの操作を畳んでピンチへ移る。
           - リスナーは document の capture（捕捉）側に置く。document は常に祖先なので、
             要素側の pointerdown/move/up より必ず先に走り、割り込める。
           ========================================================= */
        const activeTouches = new Map();   // pointerId -> {x, y}
        let touchGesture = null;           // {startDist, startZoom, prevMidX, prevMidY}
        let touchGestureActive = false;    // 2本指中は要素側の処理を止める
        // 指のタップは数px ぶれる。マウスより広い許容量を使う
        const TAP_SLOP = (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) ? 12 : 5;
        let focusTapMask = null;           // 学習モードでタップした暗記マーカー
        let focusTapStart = null;

