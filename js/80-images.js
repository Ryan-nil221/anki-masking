// ===== 80-images.js : 画像の貼り付け・ドラッグ&ドロップ・離脱警告・前回作業の復元 =====
// app.js を分割したもの。素のスクリプトなので変数は全ファイルで共有される。
// index.html の読み込み順を変えると壊れる。

        // --- 画像貼り付け・生成機能 ---
        window.createImageElement = function(left, top, width, height, dataUrl) {
            const wrapper = document.createElement('div');
            wrapper.className = 'canvas-element image-element';
            wrapper.style.left = left; wrapper.style.top = top;
            wrapper.style.width = width; wrapper.style.height = height;

            const img = document.createElement('img');
            img.src = dataUrl;
            img.draggable = false;
            wrapper.appendChild(img);

            addResizeHandles(wrapper);
            window.bringToFront(wrapper);
            workspace.appendChild(wrapper);
            return wrapper;
        };

        // at を渡すと、その位置（ワークスペース座標）を画像の左上に合わせる。
        // 渡さなければ従来どおり表示中の領域の中央に置く。
        function insertImageToWorkspace(dataUrl, at) {
            const img = new Image();
            img.onload = () => {
                let w = img.width; let h = img.height;
                const maxDim = 300; 
                if (w > maxDim || h > maxDim) {
                    if (w > h) { h = h * (maxDim / w); w = maxDim; }
                    else { w = w * (maxDim / h); h = maxDim; }
                }
                const containerW = workspaceContainer.clientWidth;
                const containerH = workspaceContainer.clientHeight;
                const oldMarginLeft = parseFloat(workspaceWrapper.style.marginLeft) || 0;
                const oldMarginTop = parseFloat(workspaceWrapper.style.marginTop) || 0;
                const centerX = (workspaceContainer.scrollLeft + containerW / 2 - oldMarginLeft) / zoomLevel;
                const centerY = (workspaceContainer.scrollTop + containerH / 2 - oldMarginTop) / zoomLevel;

                const left = (at ? at.x : centerX - w / 2) + 'px';
                const top = (at ? at.y : centerY - h / 2) + 'px';

                const newImgEl = window.createImageElement(left, top, w + 'px', h + 'px', dataUrl);
                window.deselectCurrent();
                selectedElements = [newImgEl];
                newImgEl.classList.add('selected');
                
                document.getElementById('tool-select').checked = true;
                currentTool = 'select';
                updateToolbar();
                workspaceContainer.className = ''; 
                workspaceContainer.classList.add('tool-select');
                
                window.saveState();
            };
            img.src = dataUrl;
        }

        const overlayImageInput = document.getElementById('overlayImageInput');
        if (document.getElementById('btn-add-image')) {
            document.getElementById('btn-add-image').addEventListener('click', () => { overlayImageInput.click(); });
        }
        if (overlayImageInput) {
            overlayImageInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (event) => { insertImageToWorkspace(event.target.result); e.target.value = ''; };
                reader.readAsDataURL(file);
            });
        }

        // クリップボードからのペースト(Ctrl+V)に対応
        document.addEventListener('paste', (e) => {
            if (isTypingTarget(e.target)) return;
            const data = e.clipboardData || e.originalEvent.clipboardData;
            // 直前のコピーがアプリ内なら、OS クリップボードに古い画像が残っていても
            // そちらを見ない（見てしまうと「コピーしたはずの図形が貼れない」ことになる）
            if (hasClipboard() && isOwnClipboard(data)) {
                e.preventDefault(); pasteClipboard(); return;
            }
            const items = data.items;
            let handledImage = false;
            for (let index in items) {
                const item = items[index];
                if (item.kind === 'file' && item.type.startsWith('image/')) {
                    const blob = item.getAsFile();
                    const at = lastMouseWs ? { x: lastMouseWs.x, y: lastMouseWs.y } : null;
                    const reader = new FileReader();
                    reader.onload = (event) => { insertImageToWorkspace(event.target.result, at); };
                    reader.readAsDataURL(blob);
                    handledImage = true;
                }
            }
            // OS クリップボードに画像が無ければ、アプリ内クリップボード(図形・マスク等)を貼る
            if (!handledImage && hasClipboard()) { e.preventDefault(); pasteClipboard(); }
        });

        // --- ファイルのドラッグ&ドロップで開く（画像/PDF→新規作成、.amk→データ読込） ---
        (function setupDropZone() {
            const zone = document.getElementById('workspace-outer');
            if (!zone) return;
            ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, (e) => {
                if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                    zone.classList.add('drag-over');
                }
            }));
            ['dragleave', 'dragend'].forEach(ev => zone.addEventListener(ev, (e) => {
                if (e.target === zone) zone.classList.remove('drag-over');
            }));
            zone.addEventListener('drop', (e) => {
                e.preventDefault();
                zone.classList.remove('drag-over');
                const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
                if (!f) return;
                const isProject = f.name.toLowerCase().endsWith('.amk');
                const input = document.getElementById(isProject ? 'projectInput' : 'imageInput');
                if (!input) return;
                const dt = new DataTransfer();
                dt.items.add(f);
                input.files = dt.files;
                input.dispatchEvent(new Event('change'));
            });
        })();

        // 起動直後は履歴が無いので undo/redo を無効表示にしておく
        updateHistoryButtons();

        // --- データ損失防止：離脱警告 ＋ 前回作業の復元 ---
        // 自動保存が完了する前（編集直後）に閉じた場合のみ警告する
        window.addEventListener('beforeunload', (e) => {
            if (isDirty) { e.preventDefault(); e.returnValue = ''; }
        });

        function showRestoreBanner(projectData) {
            const bar = document.createElement('div');
            bar.id = 'restore-banner';
            bar.innerHTML =
                '<span class="material-symbols-outlined">history</span>' +
                '<span>前回の作業データが残っています。復元しますか？</span>' +
                '<button class="btn btn-primary" id="restore-yes">復元する</button>' +
                '<button class="btn" id="restore-no">破棄</button>';
            document.body.appendChild(bar);

            document.getElementById('restore-yes').addEventListener('click', async () => {
                bar.remove();
                const loadingOverlay = document.getElementById('loading-overlay');
                loadingOverlay.style.display = 'flex';
                setLoadingDetail('データを復元中...');
                try {
                    window.setCurrentFileName(projectData.fileName);
                    await applyProjectData(projectData);
                } catch (err) {
                    console.error(err);
                    alert("前回データの復元に失敗しました。");
                }
                loadingOverlay.style.display = 'none';
            });

            document.getElementById('restore-no').addEventListener('click', async () => {
                bar.remove();
                try { await idbDel('session'); await idbDel('background'); }
                catch (err) { console.error(err); }
            });
        }

        (async function checkAutosaveRestore() {
            try {
                const session = await idbGet('session');
                const background = await idbGet('background');
                if (!session || !background) return;
                showRestoreBanner({ ...session, background });
            } catch (err) { console.error('自動保存データの読み込みに失敗しました', err); }
        })();
