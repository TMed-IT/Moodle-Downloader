/**
 * =====================================================================
 * Moodle ファイル収集ブックマークレット
 * =====================================================================
 * 概要:
 *   Moodleのコースページを開いた状態でこのブックマークレットを実行すると、
 *   ページ内のファイルリンクを自動収集し、選択した項目をJSON形式で
 *   クリップボードにコピーできるパネルUIを画面右上に表示します。
 *
 * 出力JSONの形式:
 *   [
 *     { "section": "セクション名", "name": "ファイル名", "url": "https://..." },
 *     ...
 *   ]
 * =====================================================================
 */

(async () => {

  // ===================================================================
  // 1: ファイルリンクの収集
  // ===================================================================

  // Moodleのセクション要素を取得
  const sectionsDOM = [
    ...document.querySelectorAll(
      "ul.topics > li.section, ul.sections > li.section"
    ),
  ];

  /** セクション名 → [{text, href, kind}] のマップ */
  const sections = {};

  sectionsDOM.forEach((sec) => {
    // セクションのタイトルを取得（見つからなければ「未分類」）
    const title =
      sec.querySelector(".sectionname, h3, h2")?.textContent.trim() ||
      "未分類";

    // セクション内の全 <a> タグを走査してファイルリンクを抽出
    const links = [...sec.querySelectorAll("a")]
      .map((a) => {
        // アクティビティのアイコン画像からファイル種別を判定
        const container = a.closest(
          ".activity-item, .activity-wrapper, [data-region='activity-card']"
        );
        const iconImg = container?.querySelector(
          ".activityiconcontainer img, .activity-icon img, img.activityicon"
        );

        let kind = "FILE"; // デフォルト種別

        if (iconImg) {
          // アイコン画像のファイル名から種別を推定
          const src = (
            iconImg.src ||
            iconImg.getAttribute("src") ||
            ""
          )
            .toLowerCase()
            .split("/")
            .pop();

          if (/pdf/.test(src))                       kind = "PDF";
          else if (/docx?|word/.test(src))           kind = "DOC";
          else if (/xlsx?|excel|spread/.test(src))   kind = "XLS";
          else if (/pptx?|powerpoint|impress/.test(src)) kind = "PPT";
          else if (/zip|archive/.test(src))          kind = "ZIP";
          else if (/mp4|mov|video|avi/.test(src))    kind = "VID";
          else if (/mp3|audio|ogg/.test(src))        kind = "AUD";
          else if (/png|jpg|jpeg|gif|image/.test(src)) kind = "IMG";
          else if (/txt|text/.test(src))             kind = "TXT";
        }

        return { text: a.textContent.trim(), href: a.href, kind };
      })
      // Moodleのファイルビューページ（/mod/resource/view.php）のみに絞り込む
      .filter((a) => a.href && a.href.includes("/mod/resource/view.php"));

    if (!links.length) return; // リンクがないセクションはスキップ

    // 重複URLを除去（Mapを使って最初の出現を保持）
    const map = new Map();
    links.forEach((v) => {
      if (!map.has(v.href)) map.set(v.href, v);
    });

    sections[title] = [...map.values()];
  });

  // ファイルが1件も見つからなければ終了
  if (!Object.keys(sections).length) {
    alert("ファイルが見つかりませんでした");
    return;
  }


  // ===================================================================
  // 2: スタイルシートの注入
  // ===================================================================

  const style = document.createElement("style");
  style.textContent = `
    /* ── オーバーレイ（半透明背景） ── */
    #mdl-dl-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      z-index: 2147483646; /* ほぼ最前面 */
      display: flex;
      align-items: flex-start;
      justify-content: flex-end;
      padding: 40px 20px 0 0;
    }

    /* ── パネル内の全要素共通リセット ── */
    #mdl-dl-panel * {
      box-sizing: border-box;
      margin: 0;
      padding: 2px;
      font-family: -apple-system, sans-serif;
    }

    /* ── パネル本体 ── */
    #mdl-dl-panel {
      width: 360px;
      max-width: calc(100vw - 32px);
      background: #fafafa;
      border: 0.5px solid #ddd;
      border-radius: 16px;
      box-shadow: 0 8px 40px rgba(0, 0, 0, 0.22);
      overflow: hidden;
    }

    /* ── ヘッダー ── */
    #mdl-dl-header {
      padding: 14px 18px;
      border-bottom: 0.5px solid #eee;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    #mdl-dl-header-left  { display: flex; align-items: center; gap: 10px; }
    #mdl-dl-icon {
      width: 30px; height: 30px;
      background: #e8f0fe;
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    #mdl-dl-titles .t1 { font-size: 14px; font-weight: 500; color: #111; }
    #mdl-dl-titles .t2 { font-size: 11px; color: #888; margin-top: 1px; }
    #mdl-dl-header-right { display: flex; align-items: center; gap: 8px; }

    /* 全選択ボタン */
    #mdl-dl-toggleall {
      font-size: 11px; padding: 4px 10px;
      border-radius: 8px; border: 0.5px solid #ccc;
      background: transparent; color: #666; cursor: pointer;
    }
    #mdl-dl-toggleall:hover { background: #f5f5f5; }

    /* 閉じるボタン */
    #mdl-dl-close {
      width: 26px; height: 26px;
      background: #f5f5f5; border: 0.5px solid #eee;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; color: #888; font-size: 13px; line-height: 1;
    }

    /* ── セクションリスト ── */
    #mdl-dl-sections {
      max-height: 340px;
      overflow-y: auto;
      padding: 6px 0 4px;
    }
    .mdl-sec-block { border-bottom: 0.5px solid #eee; }
    .mdl-sec-block:last-child { border-bottom: none; }

    /* セクションヘッダー行 */
    .mdl-sec-header {
      padding: 10px 22px 10px 8px;
      display: flex; align-items: center; gap: 8px;
    }

    /* 折りたたみボタン（▼アイコン） */
    .mdl-sec-collapse {
      width: 28px; height: 28px;
      flex-shrink: 0; border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; border: none; background: transparent;
    }
    .mdl-sec-collapse:hover { background: #f0f0f0; }
    .mdl-sec-collapse svg { transition: transform 0.2s ease; color: #888; }
    .mdl-sec-collapse.collapsed svg { transform: rotate(-90deg); } /* 折りたたみ時に矢印を回転 */

    /* セクションタイトル・カウント・チェックアイコン */
    .mdl-sec-main {
      flex: 1; display: flex; align-items: center; gap: 10px;
      cursor: pointer; padding: 2px 0;
    }
    .mdl-sec-main:hover .mdl-sec-title { color: #1a73e8; }
    .mdl-sec-title  { font-size: 14px; font-weight: 500; color: #111; flex: 1; transition: color 0.1s; }
    .mdl-sec-count  { font-size: 11px; color: #999; flex-shrink: 0; }
    .mdl-sec-btn {
      width: 28px; height: 28px; flex-shrink: 0;
      border-radius: 8px; border: 0.5px solid #ccc;
      background: #f5f5f5;
      display: flex; align-items: center; justify-content: center;
      pointer-events: none; /* クリックはセクション行全体で受ける */
    }
    .mdl-sec-btn.all-checked { background: #e8f0fe; border-color: #a8c4f8; }

    /* ── ファイルリスト（折りたたみアニメーション） ── */
    .mdl-files-wrap {
      overflow: hidden;
      transition: max-height 0.22s ease;
    }
    .mdl-files-wrap.collapsed { max-height: 0 !important; }

    /* ── ファイル行 ── */
    .mdl-file-item {
      display: flex; align-items: center;
      padding: 8px 28px 8px 38px; gap: 10px;
      cursor: pointer; background: #fff;
    }
    .mdl-file-item:hover  { background: #f4f4f4; }
    .mdl-file-item:active { background: #ececec; }

    /* チェックボックス（カスタム） */
    .mdl-file-check {
      width: 16px; height: 16px; flex-shrink: 0;
      border-radius: 4px; border: 1.5px solid #ccc; background: #fff;
      display: flex; align-items: center; justify-content: center;
    }
    .mdl-file-check.checked { background: #1a73e8; border-color: #1a73e8; }
    .mdl-file-check svg { display: none; width: 9px; height: 9px; }
    .mdl-file-check.checked svg { display: block; } /* チェック時のみSVGを表示 */

    /* ファイル種別バッジ */
    .mdl-file-icon {
      width: 30px; height: 30px; flex-shrink: 0;
      background: #f5f5f5; border: 0.5px solid #eee; border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      font-size: 9px; font-weight: 500; color: #999; letter-spacing: 0.02em;
    }

    /* ファイル名テキスト */
    .mdl-file-name { font-size: 13px; color: #222; flex: 1; line-height: 1.3; }

    /* ── フッター ── */
    #mdl-dl-footer { border-top: 0.5px solid #eee; padding: 10px 18px 14px; }
    #mdl-dl-count  { font-size: 12px; color: #888; margin-bottom: 8px; }
    #mdl-dl-count strong { color: #111; font-weight: 500; }

    /* コピーボタン */
    #mdl-dl-btn {
      width: 100%; padding: 11px; border-radius: 8px;
      background: #111; color: #fff; border: none;
      font-size: 13px; font-weight: 500; cursor: pointer;
      display: flex; align-items: center; justify-content: center; gap: 6px;
      transition: background 0.2s;
    }
    #mdl-dl-btn:disabled { opacity: 0.3; cursor: not-allowed; }
  `;
  document.head.appendChild(style);


  // ===================================================================
  // 3: パネルのHTML構築
  // ===================================================================

  const panel = document.createElement("div");
  panel.id = "mdl-dl-panel";

  // --- SVGアイコン生成ツール ---

  /** チェックマーク（白・ファイル行用） */
  const checkSVG = () =>
    `<svg viewBox="0 0 11 11" fill="none">
       <polyline points="1.5,5.5 4.5,8.5 9.5,2.5"
         stroke="white" stroke-width="1.8"
         stroke-linecap="round" stroke-linejoin="round"/>
     </svg>`;

  /** チェックマーク（色指定・セクション用） */
  const secCheckSVG = (color) =>
    `<svg viewBox="0 0 14 14" fill="none">
       <polyline points="2,7 5.5,10.5 12,3.5"
         stroke="${color}" stroke-width="1.5"
         stroke-linecap="round" stroke-linejoin="round"/>
     </svg>`;

  /** 折りたたみ矢印 */
  const chevronSVG =
    `<svg viewBox="0 0 16 16" fill="none" width="16" height="16">
       <polyline points="4,6 8,10 12,6"
         stroke="currentColor" stroke-width="1.5"
         stroke-linecap="round" stroke-linejoin="round"/>
     </svg>`;

  /** ヘッダーのグリッドアイコン */
  const dlIconSVG =
    `<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
       <rect x="1" y="1" width="5" height="5" rx="1" stroke="#1a73e8" stroke-width="1.4"/>
       <rect x="8" y="1" width="5" height="5" rx="1" stroke="#1a73e8" stroke-width="1.4"/>
       <rect x="1" y="8" width="5" height="5" rx="1" stroke="#1a73e8" stroke-width="1.4"/>
       <rect x="8" y="8" width="5" height="5" rx="1" stroke="#1a73e8" stroke-width="1.4"/>
     </svg>`;

  /** コピーボタンのアイコン */
  const copyBtnIconSVG =
    `<svg viewBox="0 0 14 14" fill="none" width="13" height="13">
       <rect x="1" y="3" width="8" height="10" rx="1.5" stroke="currentColor" stroke-width="1.4"/>
       <path d="M4 3V2.5A1.5 1.5 0 0 1 5.5 1h7A1.5 1.5 0 0 1 14 2.5v7A1.5 1.5 0 0 1 12.5 11H12"
         stroke="currentColor" stroke-width="1.4"/>
     </svg>`;

  // --- セクション・ファイルリストのHTML生成 ---

  /** 全ファイルをフラット配列で管理（インデックス参照用） */
  const flat = [];
  const secKeys = Object.keys(sections);
  let secBlocksHTML = "";

  secKeys.forEach((sec, si) => {
    let filesHTML = "";

    sections[sec].forEach((v) => {
      const idx = flat.length;
      flat.push(v); // フラット配列に追加

      // 「ファイル」という末尾テキストを除去してファイル名を整形
      const rawName = v.text.replace(/\s*ファイル\s*$/, "").trim();
      const displayName =
        rawName ||
        decodeURIComponent(v.href.split("/").pop().split("?")[0]) ||
        "—";

      // 種別ラベルの決定：kindが取れていれば優先、なければ拡張子から推定
      const extFromName = displayName.match(/\.([a-zA-Z0-9]+)$/);
      const ext =
        v.kind !== "FILE"
          ? v.kind
          : extFromName
          ? extFromName[1].toUpperCase().slice(0, 4)
          : "FILE";

      filesHTML += `
        <div class="mdl-file-item" data-idx="${idx}">
          <div class="mdl-file-check">${checkSVG()}</div>
          <div class="mdl-file-icon">${ext}</div>
          <div class="mdl-file-name">${displayName}</div>
        </div>`;
    });

    secBlocksHTML += `
      <div class="mdl-sec-block" data-si="${si}">
        <div class="mdl-sec-header">
          <button class="mdl-sec-collapse" data-si="${si}">${chevronSVG}</button>
          <div class="mdl-sec-main" data-si="${si}">
            <span class="mdl-sec-title">${sec}</span>
            <span class="mdl-sec-count" data-si="${si}">0 / ${sections[sec].length}</span>
            <div class="mdl-sec-btn" data-si="${si}">${secCheckSVG("#aaa")}</div>
          </div>
        </div>
        <div class="mdl-files-wrap" data-si="${si}">${filesHTML}</div>
      </div>`;
  });

  // パネル全体のHTML
  panel.innerHTML = `
    <div id="mdl-dl-header">
      <div id="mdl-dl-header-left">
        <div id="mdl-dl-icon">${dlIconSVG}</div>
        <div id="mdl-dl-titles">
          <div class="t1">Moodle ファイル収集</div>
          <div class="t2">選択してJSONをコピー</div>
        </div>
      </div>
      <div id="mdl-dl-header-right">
        <button id="mdl-dl-toggleall">全選択</button>
        <div id="mdl-dl-close">×</div>
      </div>
    </div>
    <div id="mdl-dl-sections">${secBlocksHTML}</div>
    <div id="mdl-dl-footer">
      <div id="mdl-dl-count"><strong>0</strong> / ${flat.length} 件選択</div>
      <button id="mdl-dl-btn" disabled>
        ${copyBtnIconSVG}
        <span id="mdl-dl-btn-text">JSONをコピー</span>
      </button>
    </div>`;

  // オーバーレイ（背景暗転）にパネルを乗せてDOMに追加
  const overlay = document.createElement("div");
  overlay.id = "mdl-dl-overlay";
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  // 背景クリックで閉じる
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      overlay.remove();
      style.remove();
    }
  });


  // ===================================================================
  // 4: 初期 maxHeight の設定（折りたたみアニメーション準備）
  // ===================================================================

  // CSSアニメーションのために実際の高さを先に計測して設定しておく
  panel.querySelectorAll(".mdl-files-wrap").forEach((w) => {
    w.style.maxHeight = w.scrollHeight + "px";
  });


  // ===================================================================
  // 5: UIロジック（イベント処理・状態管理）
  // ===================================================================

  /** セクションiのチェックボックス要素一覧を返す */
  function getSecItems(si) {
    return [...panel.querySelectorAll(".mdl-file-item[data-idx]")]
      .filter((el) => {
        const block = el.closest(".mdl-sec-block");
        return block && block.dataset.si == si;
      })
      .map((el) => el.querySelector(".mdl-file-check"));
  }

  /** チェック状態が変化したらUI全体を同期する */
  function updateUI() {
    const all = [...panel.querySelectorAll(".mdl-file-check")];
    const checked = all.filter((c) => c.classList.contains("checked")).length;
    const total = all.length;

    // フッターの選択件数表示
    panel.querySelector("#mdl-dl-count").innerHTML =
      `<strong>${checked}</strong> / ${total} 件選択`;

    // コピーボタンのラベルと有効/無効
    const btn = panel.querySelector("#mdl-dl-btn");
    panel.querySelector("#mdl-dl-btn-text").textContent =
      checked > 0 ? `JSONをコピー（${checked}件）` : "JSONをコピー";
    btn.disabled = checked === 0;

    // 全選択ボタンのラベル切り替え
    panel.querySelector("#mdl-dl-toggleall").textContent =
      checked === total ? "全解除" : "全選択";

    // 各セクションのカウンタとチェックアイコンを更新
    secKeys.forEach((_, si) => {
      const items = getSecItems(si);
      const n = items.filter((c) => c.classList.contains("checked")).length;

      const countEl = panel.querySelector(`.mdl-sec-count[data-si="${si}"]`);
      if (countEl) countEl.textContent = `${n} / ${items.length}`;

      const secBtn = panel.querySelector(`.mdl-sec-btn[data-si="${si}"]`);
      if (secBtn) {
        const allChk = n === items.length && items.length > 0;
        secBtn.classList.toggle("all-checked", allChk);
        secBtn.innerHTML = secCheckSVG(allChk ? "#1a73e8" : "#aaa");
      }
    });
  }

  // --- ファイル行クリック → チェック切り替え ---
  panel.querySelectorAll(".mdl-file-item").forEach((item) => {
    item.addEventListener("click", () => {
      item.querySelector(".mdl-file-check").classList.toggle("checked");
      updateUI();
    });
  });

  // --- セクション行クリック → セクション内を全選択 / 全解除 ---
  panel.querySelectorAll(".mdl-sec-main").forEach((main) => {
    main.addEventListener("click", () => {
      const si = main.dataset.si;
      const items = getSecItems(si);
      const allChk = items.every((c) => c.classList.contains("checked"));
      // 全チェック済みなら解除、そうでなければ全選択
      items.forEach((c) =>
        allChk ? c.classList.remove("checked") : c.classList.add("checked")
      );
      updateUI();
    });
  });

  // --- 折りたたみボタン クリック ---
  /** セクションごとの折りたたみ状態 { si: boolean } */
  const collapseState = {};

  panel.querySelectorAll(".mdl-sec-collapse").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation(); // セクション行クリックに伝播させない
      const si = btn.dataset.si;
      collapseState[si] = !collapseState[si];
      const wrap = panel.querySelector(`.mdl-files-wrap[data-si="${si}"]`);

      if (collapseState[si]) {
        // 折りたたむ：高さを明示→次フレームでcollapsedクラスを付けてアニメーション
        wrap.style.maxHeight = wrap.scrollHeight + "px";
        requestAnimationFrame(() =>
          requestAnimationFrame(() => wrap.classList.add("collapsed"))
        );
        btn.classList.add("collapsed");
      } else {
        // 展開する：collapsedクラスを外して高さを元に戻す
        wrap.classList.remove("collapsed");
        wrap.style.maxHeight = wrap.scrollHeight + "px";
        btn.classList.remove("collapsed");
        // アニメーション完了後にmaxHeightをリセット（高さ変化に追従させるため）
        setTimeout(() => { wrap.style.maxHeight = ""; }, 230);
      }
    });
  });

  // --- 全選択/全解除ボタン ---
  panel.querySelector("#mdl-dl-toggleall").addEventListener("click", () => {
    const all = [...panel.querySelectorAll(".mdl-file-check")];
    const action = all.every((c) => c.classList.contains("checked"))
      ? "remove"
      : "add";
    all.forEach((c) => c.classList[action]("checked"));
    updateUI();
  });

  // --- 閉じるボタン ---
  panel.querySelector("#mdl-dl-close").addEventListener("click", () => {
    overlay.remove();
    style.remove();
  });


  // ===================================================================
  // 6: JSONコピー処理
  // ===================================================================

  panel.querySelector("#mdl-dl-btn").addEventListener("click", async () => {
    const btn = panel.querySelector("#mdl-dl-btn");
    const btnText = panel.querySelector("#mdl-dl-btn-text");

    // チェック済みのファイル行を取得
    const checkedItems = [...panel.querySelectorAll(".mdl-file-item")].filter(
      (el) => el.querySelector(".mdl-file-check").classList.contains("checked")
    );
    if (!checkedItems.length) return;

    // JSONデータ構築（セクション順を維持）
    const result = [];
    secKeys.forEach((secName, si) => {
      panel
        .querySelectorAll(`.mdl-sec-block[data-si="${si}"] .mdl-file-item`)
        .forEach((el) => {
          if (
            !el
              .querySelector(".mdl-file-check")
              .classList.contains("checked")
          )
            return;

          const idx = parseInt(el.dataset.idx);
          const rawName = flat[idx].text
            .replace(/\s*ファイル\s*$/, "")
            .trim();
          const cleanName =
            rawName ||
            decodeURIComponent(
              flat[idx].href.split("/").pop().split("?")[0]
            ) ||
            "—";

          result.push({
            section: secName,
            name: cleanName,
            url: flat[idx].href,
          });
        });
    });

    const json = JSON.stringify(result, null, 2);

    // クリップボードにコピー（Clipboard APIが使えなければ旧来のexecCommandにフォールバック）
    const doCopy = async () => {
      try {
        await navigator.clipboard.writeText(json);
      } catch (e) {
        // フォールバック：一時的なtextareaを使ってコピー
        const ta = document.createElement("textarea");
        ta.value = json;
        ta.style = "position:fixed;top:-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
    };

    await doCopy();

    // コピー完了フィードバック → 1.2秒後に自動クローズ
    btnText.textContent = "コピーしました！";
    btn.style.background = "#1a73e8";
    setTimeout(() => {
      overlay.remove();
      style.remove();
    }, 1200);
  });

  // 初期状態でUIを同期
  updateUI();

})();
