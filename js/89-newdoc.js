        /* =========================================================
           新規作成の前の確認（10-15 Rayan様）
           作業中に「新規作成」を押すと、何も訊かずに今の紙が捨てられていた。
           保存してから・保存せずに・やめる の3つを選ばせ、保存する時は形も選ばせる。
           - 何も手を加えていない紙（保存した直後・開いた直後を含む）では訊かずにそのまま開く。
           - 「保存した」と数えるのは、開き直せる保存（作業データ・編集できるPDF）だけ。
             画像/PDFの書き出しは開き直しても編集できないので数えない。
           - 前回の作業を復元した紙は、ファイルに保存したかが分からないので「保存していない」扱い。
           ========================================================= */
        (function () {
            const input = document.getElementById('imageInput');
            const projectInput = document.getElementById('projectInput');
            if (!input) return;

            // 中身の写し。背景は大きいので含めない（背景が変わるのは新規作成か読み込みの時だけ）
            const signature = () => {
                const d = buildSessionData();
                return JSON.stringify([d.elements, d.canvasCommandsArray]);
            };
            const isEmpty = () => {
                const d = buildSessionData();
                return !d.elements.length && !d.canvasCommandsArray.some(c => c && c.length);
            };
            let cleanSig = null;     // 最後に保存した（または開いた）時の中身
            const markClean = () => { try { cleanSig = signature(); } catch (_) { cleanSig = null; } };
            const hasUnsavedWork = () => {
                if (!currentBackground) return false;
                try {
                    if (cleanSig === null) return !isEmpty();
                    return signature() !== cleanSig;
                } catch (_) { return false; }
            };

            // 保存と新規作成が済んだことは、計測の呼び出しで知る（どちらも成功した時だけ呼ばれる）
            let savedJustNow = false;
            const origTrack = window.track;
            window.track = function (name, params) {
                if (name === 'save_document' && params) {
                    savedJustNow = true;
                    // 書き出し（PDF／画像）は開き直しても編集できないので「保存済み」には数えない
                    if (params.method === 'amk' || params.method === 'editable_pdf') markClean();
                }
                if (name === 'create_document') markClean();
                return origTrack ? origTrack.apply(this, arguments) : undefined;
            };
            // 保存したファイルを開いた時も、開いた直後は「保存済み」。復元は数えない
            let openingProject = false;
            if (projectInput) projectInput.addEventListener('change', () => { openingProject = true; }, true);
            const origLoad = window.loadDataToWorkspace;
            if (typeof origLoad === 'function') {
                window.loadDataToWorkspace = function () {
                    const r = origLoad.apply(this, arguments);
                    if (openingProject) { openingProject = false; markClean(); }
                    return r;
                };
            }

            // --- 窓 ---
            const overlay = document.createElement('div');
            overlay.id = 'newdoc-overlay';
            overlay.className = 'overlay';
            overlay.innerHTML =
                '<div id="newdoc-card" role="dialog" aria-modal="true">' +
                  '<div class="nd-step" data-step="ask">' +
                    '<h2>新規作成の前に、今の作業を保存しますか？</h2>' +
                    '<div class="nd-foot">' +
                      '<button class="btn" data-act="cancel">キャンセル</button>' +
                      '<button class="btn nd-danger" data-act="discard">保存しない</button>' +
                      '<button class="btn btn-primary" data-act="tosave">保存する</button>' +
                    '</div>' +
                  '</div>' +
                  '<div class="nd-step" data-step="how">' +
                    '<h2>保存の形</h2>' +
                    '<div class="nd-choices">' +
                      '<button class="nd-choice" data-act="amk"><span class="material-symbols-outlined">data_object</span>' +
                        '<b>作業データ<span class="nd-rec">おすすめ</span></b><small>このサイトで続きから編集できます</small></button>' +
                      '<button class="nd-choice" data-act="pdf"><span class="material-symbols-outlined">picture_as_pdf</span>' +
                        '<b>PDF（編集用）</b><small>編集内容はこのサイトでのみ表示・編集できます</small></button>' +
                      '<button class="nd-choice" data-act="export"><span class="material-symbols-outlined">image</span>' +
                        '<b>PDF／画像</b><small>マスクやテキストなども含めて、どのPDFアプリでも表示できます</small></button>' +
                    '</div>' +
                    '<div class="nd-foot"><button class="btn" data-act="back">戻る</button></div>' +
                  '</div>' +
                  '<div class="nd-step" data-step="pick">' +
                    '<h2>保存しました</h2>' +
                                        '<div class="nd-foot">' +
                      '<button class="btn" data-act="cancel">キャンセル</button>' +
                      '<button class="btn btn-primary" data-act="pick">ファイルを選ぶ</button>' +
                    '</div>' +
                  '</div>' +
                '</div>';
            document.body.appendChild(overlay);

            let pendingFiles = null;   // 画面へ落としたファイル（落とした時はファイル選びが要らない）
            let bypass = false;

            const show = (step) => {
                overlay.querySelectorAll('.nd-step').forEach(s => { s.style.display = (s.dataset.step === step) ? 'block' : 'none'; });
                overlay.style.display = 'flex';
                const first = overlay.querySelector(`.nd-step[data-step="${step}"] .btn-primary, .nd-step[data-step="${step}"] .nd-choice`);
                if (first) first.focus();
            };
            const close = () => { overlay.style.display = 'none'; pendingFiles = null; };

            // 新規作成へ進む。落としたファイルがあればそれを開き、無ければファイル選びを開く
            const proceed = () => {
                const files = pendingFiles;
                close();
                bypass = true;
                try {
                    if (files) {
                        input.files = files;
                        input.dispatchEvent(new Event('change'));
                    } else {
                        input.value = '';
                        input.click();
                    }
                } finally { bypass = false; }
            };

            // 保存の本体（どれもダウンロードのリンクを押して出す）
            const runSave = async (kind) => {
                if (kind === 'pdf') await exportEditablePdf();
                else if (kind === 'export') await runNativeExport();
                else document.getElementById('btn-save-project-menu').click();
            };
            // ダウンロードで出すと、保存先を選ぶ画面でやめられてもページには分からず、
            // 保存していないのに「保存しました」と出てしまう（10-16 Rayan様）。
            // 保存先を選ぶ画面をページから開ける時（Chrome・Edge）は、先に保存先を決めてもらい、
            // 出来上がったファイルをそこへ書き込む。やめたら形を選ぶ画面に戻る。
            const fileNameFor = (kind) => {
                const base = window.currentFileName;
                if (kind === 'amk') return { name: `${base}.amk`, desc: '作業データ', mime: 'application/octet-stream', ext: '.amk' };
                if (kind === 'pdf') return { name: `${base}_編集用.pdf`, desc: 'PDF', mime: 'application/pdf', ext: '.pdf' };
                if (currentBackground && currentBackground.type === 'pdf') return { name: `${base}_マスキング.pdf`, desc: 'PDF', mime: 'application/pdf', ext: '.pdf' };
                return { name: `${base}_マスキング.png`, desc: '画像', mime: 'image/png', ext: '.png' };
            };
            // 保存の本体が押すダウンロードのリンクを横取りして、中身だけ受け取る
            const captureDownload = async (fn) => {
                let got = null;
                const grab = (a) => { if (!got) got = fetch(a.href).then(r => r.blob()); };
                const A = HTMLAnchorElement.prototype;
                const origClick = A.click, hadOwnDispatch = Object.prototype.hasOwnProperty.call(A, 'dispatchEvent'), origDispatch = A.dispatchEvent;
                A.click = function () { if (this.download && this.href) { grab(this); return; } return origClick.apply(this, arguments); };
                A.dispatchEvent = function (ev) { if (ev && ev.type === 'click' && this.download && this.href) { grab(this); return false; } return origDispatch.apply(this, arguments); };
                try { await fn(); }
                finally { A.click = origClick; if (hadOwnDispatch) A.dispatchEvent = origDispatch; else delete A.dispatchEvent; }
                return got ? await got : null;
            };

            const save = async (kind) => {
                savedJustNow = false;
                if (typeof window.showSaveFilePicker === 'function') {
                    const f = fileNameFor(kind);
                    let handle;
                    try {
                        handle = await window.showSaveFilePicker({ suggestedName: f.name, types: [{ description: f.desc, accept: { [f.mime]: [f.ext] } }] });
                    } catch (e) {
                        if (e && e.name === 'AbortError') return;   // 保存先を選ぶ画面でやめた
                        handle = null;                              // 開けなかった時はダウンロードで出す
                    }
                    if (handle) {
                        const blob = await captureDownload(() => runSave(kind));
                        if (!savedJustNow || !blob) return;          // 作るのに失敗した（知らせは保存の側で出ている）
                        try {
                            const w = await handle.createWritable();
                            await w.write(blob); await w.close();
                        } catch (e) {
                            console.error(e);
                            cleanSig = null;   // 保存済みの印を取り消す
                            alert('保存できませんでした。もう一度お試しください。');
                            return;
                        }
                        if (pendingFiles) proceed(); else show('pick');
                        return;
                    }
                }
                await runSave(kind);
                if (!savedJustNow) return;   // 失敗した（知らせは保存の側で出ている）。窓は閉じずに選び直せる
                // 落としたファイルならそのまま開く。ファイル選びは押した手応えの中でしか開けないので、もう一度押してもらう
                if (pendingFiles) proceed(); else show('pick');
            };

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) { close(); return; }
                const b = e.target.closest('[data-act]');
                if (!b) return;
                const act = b.dataset.act;
                if (act === 'cancel') close();
                else if (act === 'discard' || act === 'pick') proceed();
                else if (act === 'tosave') show('how');
                else if (act === 'back') show('ask');
                else if (act === 'pdf' || act === 'amk' || act === 'export') save(act);
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && overlay.style.display === 'flex') { e.stopPropagation(); close(); }
            }, true);

            // ボタン・メニューの「新規作成」（どちらもファイル選びを開く前に、ここを通る）
            input.addEventListener('click', (e) => {
                if (bypass || !hasUnsavedWork()) return;
                e.preventDefault();
                pendingFiles = null;
                show('ask');
            });
            // 画面へファイルを落とした時は、ファイル選びを通らずに作り物の change が来る。
            // 人がファイル選びで選んだ change（本物）は、上の click を通った後なので止めない。
            input.addEventListener('change', (e) => {
                if (bypass || e.isTrusted) return;
                if (!hasUnsavedWork() || !input.files || !input.files.length) return;
                e.stopImmediatePropagation();
                pendingFiles = input.files;
                show('ask');
            }, true);
        })();
