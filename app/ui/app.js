(function() {
  // State
  let currentAttachments = [];
  let isGenerating = false;
  let currentAssistantCard = null;
  let currentAssistantText = "";
  let currentThinkingText = "";
  let dragCounter = 0;
  let currentWorkspace = "";
  let activeConvId = null;

  // DOM Elements
  const workspaceNameEl = document.getElementById("workspace-name");
  const convIdEl = document.getElementById("conv-id");
  const statusDotEl = document.getElementById("status-dot");
  const statusTextEl = document.getElementById("status-text");
  const chatContainerEl = document.getElementById("chat-container");
  const messagesListEl = document.getElementById("messages-list");
  const welcomeHeroEl = document.getElementById("welcome-hero");
  const promptInputEl = document.getElementById("prompt-input");
  const inputBoxWrapperEl = document.getElementById("input-box-wrapper");
  const btnSendEl = document.getElementById("btn-send");
  const btnActionEl = document.getElementById("btn-action");
  const btnFreeToGoEl = document.getElementById("btn-free-to-go");
  const filePickerEl = document.getElementById("file-picker");
  const attachmentsStripEl = document.getElementById("attachments-strip");
  const dragOverlayEl = document.getElementById("drag-overlay");
  const btnPinEl = document.getElementById("btn-pin");

  // Sidebar Elements
  const btnMenuEl = document.getElementById("btn-menu");
  const sidebarDrawerEl = document.getElementById("sidebar-drawer");
  const sidebarOverlayEl = document.getElementById("sidebar-overlay");
  const btnCloseSidebarEl = document.getElementById("btn-close-sidebar");
  const btnNewChatEl = document.getElementById("btn-new-chat");
  const listCurrentEl = document.getElementById("list-current-workspace");
  const countCurrentEl = document.getElementById("count-current");
  const labelCurrentWorkspaceEl = document.getElementById("label-current-workspace");
  const wrapSeeMoreCurrentEl = document.getElementById("wrap-see-more-current");
  const btnSeeMoreCurrentEl = document.getElementById("btn-see-more-current");

  // Tabs & Other Panes
  const tabBtnCurrent = document.getElementById("tab-btn-current");
  const tabBtnRecent = document.getElementById("tab-btn-recent");
  const tabBtnCatalog = document.getElementById("tab-btn-catalog");
  const tabCountCurrent = document.getElementById("tab-count-current");
  const tabCountRecent = document.getElementById("tab-count-recent");
  const tabCountCatalog = document.getElementById("tab-count-catalog");
  const paneCurrent = document.getElementById("pane-current");
  const paneRecent = document.getElementById("pane-recent");
  const paneCatalog = document.getElementById("pane-catalog");
  const listRecentEl = document.getElementById("list-recent-conversations");
  const countRecentEl = document.getElementById("count-recent");
  const listCatalogEl = document.getElementById("list-catalog-workspaces");
  const countCatalogEl = document.getElementById("count-catalog");
  const toastContainerEl = document.getElementById("toast-container");

  // File Context Menu Elements
  const fileContextMenuEl = document.getElementById("file-context-menu");
  const ctxOpenFileEl = document.getElementById("ctx-open-file");
  const ctxOpenFolderEl = document.getElementById("ctx-open-folder");
  const ctxCopyPathEl = document.getElementById("ctx-copy-path");
  let activeContextMenuPath = null;

  // Quota Elements
  const quotaContainerEl = document.getElementById("quota-container");
  const quotaWeekEl = document.getElementById("quota-week");
  const quotaWeekFillEl = document.getElementById("quota-week-fill");
  const quota5hEl = document.getElementById("quota-5h");
  const quota5hFillEl = document.getElementById("quota-5h-fill");

  // Account Selector Elements
  const accountSelectorEl = document.getElementById("account-selector");
  const accountBadgeEl = document.getElementById("account-badge");
  const accountEmailEl = document.getElementById("account-email");
  const accountDropdownEl = document.getElementById("account-dropdown");
  const accountListEl = document.getElementById("account-list");
  const btnAccountSaveEl = document.getElementById("btn-account-save");
  const btnAccountAddEl = document.getElementById("btn-account-add");

  // Account Modal Elements
  const accountModalEl = document.getElementById("account-modal");
  const accountModalTitleEl = document.getElementById("account-modal-title");
  const accountModalTextEl = document.getElementById("account-modal-text");
  const accountModalSubtextEl = document.getElementById("account-modal-subtext");
  const btnAccountModalCancelEl = document.getElementById("btn-account-modal-cancel");
  const btnAccountModalConfirmEl = document.getElementById("btn-account-modal-confirm");

  // Active Processes Elements (Above Input Box)
  const activeProcessesStripEl = document.getElementById("active-processes-strip");
  const activeProcessesListEl = document.getElementById("active-processes-list");
  const activeProcessesCountEl = document.getElementById("active-processes-count");
  const btnKillAllProcsEl = document.getElementById("btn-kill-all-procs");

  // Running Lights Elements (Above Input Box)
  const runningLightsStripEl = document.getElementById("running-lights-strip");
  const runningLightsTrackEl = document.getElementById("running-lights-track");
  let currentLedCellCount = 0;
  let runningLightsResizeObserver = null;

  function updateRunningLightsCells() {
    if (!runningLightsTrackEl) return;
    const container = runningLightsStripEl ? (runningLightsStripEl.parentElement || runningLightsStripEl) : runningLightsTrackEl;
    const width = container.clientWidth || window.innerWidth;
    if (width <= 0) return;

    // Available track width (subtract container padding: input-section 40px + track padding 12px)
    const availableWidth = Math.max(80, width - 52);
    // Each cell is 6px, desired gap around 2.5px -> 8.5px per slot
    const slotSize = 8.5;
    const cellCount = Math.max(16, Math.floor(availableWidth / slotSize));

    if (cellCount === currentLedCellCount) return;
    currentLedCellCount = cellCount;

    runningLightsTrackEl.style.setProperty("--total-cells", cellCount);
    runningLightsTrackEl.innerHTML = "";
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < cellCount; i++) {
      const cell = document.createElement("div");
      cell.className = "led-cell";
      cell.style.setProperty("--i", i);
      fragment.appendChild(cell);
    }
    runningLightsTrackEl.appendChild(fragment);
  }

  function initRunningLights() {
    if (!runningLightsTrackEl) return;
    updateRunningLightsCells();

    if (!runningLightsResizeObserver && window.ResizeObserver) {
      const target = runningLightsStripEl ? (runningLightsStripEl.parentElement || runningLightsStripEl) : document.body;
      runningLightsResizeObserver = new ResizeObserver(() => {
        window.requestAnimationFrame(updateRunningLightsCells);
      });
      runningLightsResizeObserver.observe(target);
    }
  }

  // Guardrail Modal Elements & State
  const guardrailModalEl = document.getElementById("guardrail-modal");
  const guardrailToolNameEl = document.getElementById("guardrail-tool-name");
  const guardrailFilePathEl = document.getElementById("guardrail-file-path");
  const guardrailApprovedListEl = document.getElementById("guardrail-approved-list");
  const btnGuardrailRejectEl = document.getElementById("btn-guardrail-reject");
  const btnGuardrailAllowEl = document.getElementById("btn-guardrail-allow");
  const btnActionLabelEl = document.getElementById("btn-action-label");
  const actionModeBadgeEl = document.getElementById("action-mode-badge");

  const btnDeepThinkEl = document.getElementById("btn-deep-think");
  const btnDeepThinkLabelEl = document.getElementById("btn-deep-think-label");
  const deepThinkModeBadgeEl = document.getElementById("deep-think-mode-badge");
  const btnDeepThinkTreeEl = document.getElementById("btn-deep-think-tree");
  const deepThinkHeaderBadgeEl = document.getElementById("deep-think-header-badge");
  const deepThinkModalEl = document.getElementById("deep-think-modal");
  const btnCloseDeepThinkEl = document.getElementById("btn-close-deep-think");
  const btnRollbackEl = document.getElementById("btn-rollback");
  const btnMoreActionsEl = document.getElementById("btn-more-actions");
  const moreActionsMenuEl = document.getElementById("more-actions-menu");
  const btnResetDeepThinkEl = document.getElementById("btn-reset-deep-think");
  const btnOpenPlanMdEl = document.getElementById("btn-open-plan-md");
  const btnPauseDeepThinkEl = document.getElementById("btn-pause-deep-think");
  const btnStopDeepThinkEl = document.getElementById("btn-stop-deep-think");
  const deepThinkRootTextEl = document.getElementById("deep-think-root-text");
  const deepThinkTreeEl = document.getElementById("deep-think-tree");
  const deepThinkSubtitleEl = document.getElementById("deep-think-subtitle");
  const deepThinkStatusMessageEl = document.getElementById("deep-think-status-message");
  const statTotalNodesEl = document.getElementById("stat-total-nodes");
  const statCompletedNodesEl = document.getElementById("stat-completed-nodes");
  const statAtomicNodesEl = document.getElementById("stat-atomic-nodes");
  const statPendingNodesEl = document.getElementById("stat-pending-nodes");
  const pillLvl1El = document.getElementById("pill-lvl-1");
  const pillLvl2El = document.getElementById("pill-lvl-2");
  const pillLvl3El = document.getElementById("pill-lvl-3");
  const pillLvl4El = document.getElementById("pill-lvl-4");
  const pillLvl5El = document.getElementById("pill-lvl-5");

  let activeApprovedPlan = null;
  let pendingViolation = null;
  let isFreeToGo = false;
  let freeToGoTimer = null;
  let wasStoppedByUser = false;
  let isDeepThinkRunning = false;
  let deepThinkState = null;

  // Send message to Python via WebKit Bridge
  function postToPython(data) {
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.bridge) {
      window.webkit.messageHandlers.bridge.postMessage(JSON.stringify(data));
    }
  }

  // Toast Notification
  function showToast(message, duration = 3000) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `<span>ℹ️</span><span>${escapeHtml(message)}</span>`;
    toastContainerEl.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // Update Status Indicator & Running Lights
  function setStatus(state, text) {
    statusDotEl.className = `status-dot ${state}`;
    statusTextEl.textContent = text;

    if (runningLightsStripEl) {
      if (state === "busy") {
        updateRunningLightsCells();
        runningLightsStripEl.classList.remove("hidden");
        runningLightsStripEl.classList.add("active");
      } else {
        runningLightsStripEl.classList.remove("active");
        runningLightsStripEl.classList.add("hidden");
      }
    }
  }

  // Update Always-on-Top (Pin) UI
  function updatePinUI(isPinned, notify = false) {
    if (!btnPinEl) return;
    if (isPinned) {
      btnPinEl.classList.add("active");
      btnPinEl.title = "Đang luôn nổi trên màn hình (Bấm để tắt)";
      if (notify) showToast("Đã bật chế độ luôn nổi trên màn hình.");
    } else {
      btnPinEl.classList.remove("active");
      btnPinEl.title = "Bật chế độ luôn nổi trên màn hình (Always on Top)";
      if (notify) showToast("Đã tắt chế độ luôn nổi trên màn hình.");
    }
  }

  // Scroll Chat to bottom
  function scrollToBottom() {
    chatContainerEl.scrollTop = chatContainerEl.scrollHeight;
  }

  // Escape HTML to prevent injection
  function escapeHtml(str) {
    return (str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Unescape HTML entities
  function unescapeHtml(str) {
    return (str || "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, "\"")
      .replace(/&#039;/g, "'");
  }

  // Parse file:// URI to clean local path and display info
  function parseFileHref(rawHref) {
    let href = unescapeHtml(rawHref || "").trim();
    if (href.startsWith("<") && href.endsWith(">")) {
      href = href.slice(1, -1).trim();
    }
    let decodedHref = href;
    try {
      decodedHref = decodeURI(href);
    } catch (e) {
      try { decodedHref = decodeURIComponent(href); } catch (e2) {}
    }
    let cleanPath = decodedHref.replace(/^file:\/\/+/, "/");
    if (!cleanPath.startsWith("/") && decodedHref.startsWith("file:///")) {
      cleanPath = "/" + cleanPath;
    }
    let lineHash = "";
    const hashIdx = cleanPath.indexOf("#");
    if (hashIdx !== -1) {
      lineHash = cleanPath.substring(hashIdx);
      cleanPath = cleanPath.substring(0, hashIdx);
    }
    const qIdx = cleanPath.indexOf("?");
    if (qIdx !== -1) {
      cleanPath = cleanPath.substring(0, qIdx);
    }
    cleanPath = cleanPath.replace(/[.,;:]+$/, "").trim();
    while (cleanPath.endsWith(")")) {
      const openCount = (cleanPath.match(/\(/g) || []).length;
      const closeCount = (cleanPath.match(/\)/g) || []).length;
      if (closeCount > openCount) {
        cleanPath = cleanPath.slice(0, -1).trim();
      } else {
        break;
      }
    }
    cleanPath = cleanPath.replace(/[.,;:]+$/, "").trim();
    const isFolder = decodedHref.replace(/[#?].*$/, "").trim().endsWith("/") || rawHref.trim().endsWith("/");
    if (isFolder && cleanPath.length > 1 && cleanPath.endsWith("/")) {
      cleanPath = cleanPath.slice(0, -1);
    }
    const filename = cleanPath.split("/").filter(Boolean).pop() || cleanPath;
    return { cleanPath, lineHash, filename, isFolder };
  }

  // Helper to render KaTeX formula
  function renderKatexMath(tex, displayMode) {
    if (typeof katex !== "undefined" && typeof katex.renderToString === "function") {
      try {
        return katex.renderToString(tex, {
          displayMode: !!displayMode,
          throwOnError: false
        });
      } catch (e) {
        console.warn("KaTeX render error:", e);
      }
    }
    return displayMode
      ? `<span class="katex-display-fallback">${escapeHtml(tex)}</span>`
      : `<span class="katex-inline-fallback">${escapeHtml(tex)}</span>`;
  }

  // Lightweight robust Markdown parser with KaTeX support
  function renderMarkdown(md) {
    if (!md) return "";

    const codeBlocks = [];
    let processed = md.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, function(match, lang, code) {
      const id = codeBlocks.length;
      codeBlocks.push({ lang: lang || "text", code: code.trimEnd() });
      return `__CODE_BLOCK_${id}__`;
    });

    const inlineCodes = [];
    processed = processed.replace(/`([^`\n]+)`/g, function(match, code) {
      const id = inlineCodes.length;
      inlineCodes.push(code);
      return `__INLINE_CODE_${id}__`;
    });

    const mathBlocks = [];
    processed = processed.replace(/\$\$([\s\S]+?)\$\$/g, function(match, math) {
      const id = mathBlocks.length;
      mathBlocks.push(math.trim());
      return `__MATH_BLOCK_${id}__`;
    });

    const mathInlines = [];
    processed = processed.replace(/(?<!\\)\$([^\$\s\n\r](?:[^\$\n\r]*?[^\$\s\n\r])?)(?<!\\)\$/g, function(match, math) {
      const id = mathInlines.length;
      mathInlines.push(math.trim());
      return `__MATH_INLINE_${id}__`;
    });

    processed = escapeHtml(processed);

    // 1. Convert [label](file:///path/to/file) to compact file/folder link (safe [^\]\n]+, supports parens in URL & <...>)
    processed = processed.replace(/\[\s*([^\]\n]+?)\s*\]\(\s*(?:<([^>\n]+)>|&lt;([^>\n]+)&gt;|(file:\/\/(?:[^\s()]|\([^\s()]*\))+?))\s*(?:\s+(?:&quot;(?:(?!&quot;)[^\n])*&quot;|&#039;(?:(?!&#039;)[^\n])*&#039;|"[^"\n]*"|'[^'\n]*'))?\s*\)/g, function(match, label, urlAngle, urlEscapedAngle, urlBare) {
      const rawHref = urlAngle || urlEscapedAngle || urlBare;
      const { cleanPath, lineHash, filename, isFolder } = parseFileHref(rawHref);
      const icon = isFolder ? "📁" : "📄";
      const cleanLabel = unescapeHtml(label || "").replace(/^`+|`+$/g, "").trim();
      const displayLabel = (cleanLabel && !cleanLabel.startsWith("file://"))
        ? (cleanLabel + (lineHash && !cleanLabel.includes('#') && !cleanLabel.includes('(') ? ` (${lineHash.replace('#', '')})` : ""))
        : (filename + (lineHash ? ` (${lineHash.replace('#', '')})` : ""));
      return `<span class="file-link" data-filepath="${escapeHtml(cleanPath)}" data-is-folder="${isFolder ? "true" : "false"}" title="${escapeHtml(cleanPath + lineHash)}">${icon} ${escapeHtml(displayLabel)}</span>`;
    });

    // 2. Convert raw/bare file:// URLs not inside quotes/attributes (supports balanced parens)
    processed = processed.replace(/(?<!data-filepath="|title="|href=")file:\/\/(?:[^\s<>&"'()*_`~]|\([^\s<>&"'()*_`~]*\))+/g, function(match) {
      let url = match;
      let trailing = "";
      const m = url.match(/[\*\_~`.,;:!?]+$/);
      if (m) {
        trailing = m[0];
        url = url.slice(0, -trailing.length);
      }
      const { cleanPath, lineHash, filename, isFolder } = parseFileHref(url);
      const icon = isFolder ? "📁" : "📄";
      const displayLabel = filename + (lineHash ? ` (${lineHash.replace('#', '')})` : "");
      return `<span class="file-link" data-filepath="${escapeHtml(cleanPath)}" data-is-folder="${isFolder ? "true" : "false"}" title="${escapeHtml(cleanPath + lineHash)}">${icon} ${escapeHtml(displayLabel)}</span>` + trailing;
    });

    // 3. Convert [label](https://...) to web link (safe [^\]\n]+, supports parens in URL & <...>)
    processed = processed.replace(/\[\s*([^\]\n]+?)\s*\]\(\s*(?:<([^>\n]+)>|&lt;([^>\n]+)&gt;|(https?:\/\/(?:[^\s()]|\([^\s()]*\))+?))\s*(?:\s+(?:&quot;(?:(?!&quot;)[^\n])*&quot;|&#039;(?:(?!&#039;)[^\n])*&#039;|"[^"\n]*"|'[^'\n]*'))?\s*\)/g, function(match, label, urlAngle, urlEscapedAngle, urlBare) {
      const rawHref = urlAngle || urlEscapedAngle || urlBare;
      return `<a href="${escapeHtml(unescapeHtml(rawHref))}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });

    // 3b. Convert bare https?:// URLs not inside quotes/attributes to web link
    processed = processed.replace(/(?<!(?:href="|href='|data-filepath="|title="|">|&gt;))https?:\/\/(?:[^\s<>&"'()*_`~]|\([^\s<>&"'()*_`~]*\))+/g, function(match) {
      let url = match;
      let trailing = "";
      const m = url.match(/[\*\_~`.,;:!?]+$/);
      if (m) {
        trailing = m[0];
        url = url.slice(0, -trailing.length);
      }
      const cleanUrl = unescapeHtml(url);
      return `<a href="${escapeHtml(cleanUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(cleanUrl)}</a>` + trailing;
    });

    // 4. Bold, italic
    processed = processed.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    processed = processed.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");

    // 5. Line-by-line block state machine
    const lines = processed.split("\n");
    const out = [];
    const listStack = []; // array of { type: 'ol'|'ul', indent: number }
    let inBlockquote = false;
    let paraLines = [];

    function flushPara() {
      if (paraLines.length > 0) {
        out.push("<p>" + paraLines.join("<br>") + "</p>");
        paraLines = [];
      }
    }

    function closeAllLists() {
      while (listStack.length > 0) {
        const item = listStack.pop();
        out.push(`</li></${item.type}>`);
      }
    }

    function closeBlockquote() {
      if (inBlockquote) {
        out.push("</blockquote>");
        inBlockquote = false;
      }
    }

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // Blank line handling
      if (!trimmed) {
        flushPara();
        // Look ahead: does the list or blockquote continue?
        let j = i + 1;
        while (j < lines.length && !lines[j].trim()) {
          j++;
        }
        if (j < lines.length) {
          const mNext = lines[j].match(/^(\s*)(?:(\d+)\.|([-*•]))\s+(.*)$/);
          if (!mNext) {
            closeAllLists();
            closeBlockquote();
          }
        } else {
          closeAllLists();
          closeBlockquote();
        }
        i++;
        continue;
      }

      // Code block or Math block marker
      if (trimmed.startsWith("__CODE_BLOCK_") || trimmed.startsWith("__MATH_BLOCK_")) {
        flushPara();
        closeAllLists();
        closeBlockquote();
        out.push(trimmed);
        i++;
        continue;
      }

      // Headings: # through ######
      const mHead = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (mHead) {
        flushPara();
        closeAllLists();
        closeBlockquote();
        const level = mHead[1].length;
        out.push(`<h${level}>${mHead[2]}</h${level}>`);
        i++;
        continue;
      }

      // Horizontal rule
      if (/^(?:---|\*\*\*|___)$/.test(trimmed)) {
        flushPara();
        closeAllLists();
        closeBlockquote();
        out.push("<hr>");
        i++;
        continue;
      }

      // Blockquote
      const mQuote = trimmed.match(/^>\s*(.*)$/);
      if (mQuote) {
        flushPara();
        closeAllLists();
        if (!inBlockquote) {
          out.push("<blockquote>");
          inBlockquote = true;
        }
        out.push(mQuote[1]);
        i++;
        continue;
      } else if (inBlockquote) {
        closeBlockquote();
      }

      // List item
      const mList = line.match(/^(\s*)(?:(\d+)\.|([-*•]))\s+(.*)$/);
      if (mList) {
        flushPara();
        const indent = mList[1].length;
        const ltype = mList[2] ? "ol" : "ul";
        const content = mList[4];
        const startNum = mList[2] ? parseInt(mList[2], 10) : 1;
        const startAttr = (ltype === "ol" && startNum > 1) ? ` start="${startNum}"` : "";

        if (listStack.length === 0) {
          listStack.push({ type: ltype, indent });
          out.push(`<${ltype}${startAttr}><li>${content}`);
        } else {
          const curr = listStack[listStack.length - 1];
          if (indent > curr.indent) {
            // Nested sub-list inside parent li
            listStack.push({ type: ltype, indent });
            out.push(`<${ltype}${startAttr}><li>${content}`);
          } else if (indent === curr.indent) {
            if (ltype === curr.type) {
              out.push(`</li><li>${content}`);
            } else {
              out.push(`</li></${curr.type}><${ltype}${startAttr}><li>${content}`);
              listStack[listStack.length - 1] = { type: ltype, indent };
            }
          } else {
            // Pop deeper levels
            while (listStack.length > 0 && listStack[listStack.length - 1].indent > indent) {
              const popped = listStack.pop();
              out.push(`</li></${popped.type}>`);
            }
            if (listStack.length > 0 && listStack[listStack.length - 1].indent === indent && listStack[listStack.length - 1].type === ltype) {
              out.push(`</li><li>${content}`);
            } else {
              if (listStack.length > 0 && listStack[listStack.length - 1].indent === indent) {
                const popped = listStack.pop();
                out.push(`</li></${popped.type}>`);
              }
              listStack.push({ type: ltype, indent });
              out.push(`<${ltype}${startAttr}><li>${content}`);
            }
          }
        }
        i++;
        continue;
      }

      // Indented line continuation within active list item
      if (listStack.length > 0 && line.startsWith(" ".repeat(listStack[listStack.length - 1].indent + 2))) {
        out.push("<br>" + trimmed);
        i++;
        continue;
      }

      // Normal paragraph line
      closeAllLists();
      paraLines.push(trimmed);
      i++;
    }

    flushPara();
    closeAllLists();
    closeBlockquote();

    let result = out.join("\n");

    // 6. Restore code blocks
    result = result.replace(/__CODE_BLOCK_(\d+)__/g, function(match, id) {
      const item = codeBlocks[parseInt(id, 10)];
      const lang = escapeHtml(item.lang);
      const code = escapeHtml(item.code);
      return `
        <div class="code-wrapper">
          <div class="code-header">
            <span>${lang}</span>
            <button class="btn-copy-code" onclick="copyCode(this)">Sao chép</button>
          </div>
          <pre><code>${code}</code></pre>
        </div>
      `;
    });

    // 7. Restore math blocks and inline math
    result = result.replace(/__MATH_BLOCK_(\d+)__/g, function(match, id) {
      const item = mathBlocks[parseInt(id, 10)];
      return `<span class="math-block-wrapper" style="display: block; overflow-x: auto; text-align: center; margin: 8px 0;">${renderKatexMath(item, true)}</span>`;
    });

    result = result.replace(/__MATH_INLINE_(\d+)__/g, function(match, id) {
      const item = mathInlines[parseInt(id, 10)];
      return renderKatexMath(item, false);
    });

    // 8. Restore inline codes
    result = result.replace(/__INLINE_CODE_(\d+)__/g, function(match, id) {
      const code = inlineCodes[parseInt(id, 10)];
      return `<code>${escapeHtml(code)}</code>`;
    });

    return result;
  }

  // Copy code helper
  window.copyCode = function(btn) {
    const pre = btn.closest(".code-wrapper").querySelector("pre code");
    if (pre) {
      navigator.clipboard.writeText(pre.innerText).then(() => {
        const originalText = btn.textContent;
        btn.textContent = "Đã chép!";
        setTimeout(() => { btn.textContent = originalText; }, 1800);
      });
    }
  };

  // Validate and update button disabled states (transforms ACTION into STOP when generating)
  function updateSendButtonState() {
    const hasText = promptInputEl.value.trim().length > 0;
    const hasAttachments = currentAttachments.length > 0;
    const canSend = (hasText || hasAttachments) && !isGenerating;
    btnSendEl.disabled = !canSend;

    if (isGenerating) {
      btnActionEl.disabled = false;
      btnActionEl.classList.remove("free-to-go");
      btnActionEl.classList.add("stopping");
      btnActionEl.title = "Dừng công việc hiện tại (Click để dừng)";
      if (btnActionLabelEl) {
        btnActionLabelEl.textContent = "⏹ DỪNG";
      }
      if (actionModeBadgeEl) {
        actionModeBadgeEl.classList.add("hidden");
      }
    } else {
      btnActionEl.disabled = false;
      btnActionEl.classList.remove("stopping");
      if (isFreeToGo) {
        btnActionEl.classList.add("free-to-go");
        if (btnActionLabelEl) {
          btnActionLabelEl.textContent = "🚀 FREE GO";
        }
        if (actionModeBadgeEl) {
          actionModeBadgeEl.classList.remove("hidden");
          actionModeBadgeEl.textContent = "FREE ON";
        }
        btnActionEl.title = "Chế độ Free to go: ĐANG BẬT (Tự động gửi ACTION cho mọi yêu cầu)\nClick phải để tắt | Click trái để gửi ngay";
      } else {
        btnActionEl.classList.remove("free-to-go");
        if (btnActionLabelEl) {
          btnActionLabelEl.textContent = "⚡ ACTION";
        }
        if (actionModeBadgeEl) {
          actionModeBadgeEl.classList.add("hidden");
        }
        btnActionEl.title = "Click trái: Gửi ACTION | Click phải: Bật/Tắt chế độ Free to go";
      }
    }

    if (btnFreeToGoEl) {
      if (isFreeToGo) {
        btnFreeToGoEl.classList.add("active");
        btnFreeToGoEl.title = "Chế độ Free to go: ĐANG BẬT (Agent được tự do thực hiện không bị chặn kế hoạch tới khi hoàn tất)\nClick để TẮT";
      } else {
        btnFreeToGoEl.classList.remove("active");
        btnFreeToGoEl.title = "Chế độ Free to go: ĐANG TẮT (Mặc định: kiểm tra kế hoạch trước khi sửa file)\nClick để BẬT";
      }
    }

    if (btnDeepThinkEl) {
      if (isDeepThinkRunning) {
        btnDeepThinkEl.classList.add("running");
        if (deepThinkModeBadgeEl) {
          deepThinkModeBadgeEl.classList.remove("hidden");
          deepThinkModeBadgeEl.textContent = "RUNNING";
        }
      } else {
        btnDeepThinkEl.classList.remove("running");
        if (deepThinkModeBadgeEl) {
          if (deepThinkState && deepThinkState.total_nodes > 0) {
            deepThinkModeBadgeEl.classList.remove("hidden");
            deepThinkModeBadgeEl.textContent = "5L";
          } else {
            deepThinkModeBadgeEl.classList.add("hidden");
          }
        }
      }
    }
  }

  // Quota Format & UI Helper
  function getQuotaLevelClass(pct) {
    if (pct <= 25) return "quota-low";
    if (pct <= 60) return "quota-mid";
    return "quota-high";
  }

  function updateQuotaUI(data) {
    if (!data) return;

    const pName = data.primary_name || "Gemini Models";

    if (quotaWeekFillEl && data.pct_week !== undefined) {
      const pctWeek = Math.min(100, Math.max(0, data.pct_week));
      quotaWeekFillEl.style.width = `${pctWeek}%`;
      quotaWeekFillEl.className = `quota-fill ${getQuotaLevelClass(pctWeek)}`;

      const refreshStr = data.refresh_week ? ` (${data.refresh_week})` : "";
      const tipWeek = `[Hạn mức Tuần còn lại]\n${pName}: ${pctWeek}%${refreshStr}\nNhấp để làm mới`;
      if (quotaWeekEl) quotaWeekEl.title = tipWeek;
    }

    if (quota5hFillEl && data.pct_5h !== undefined) {
      const pct5h = Math.min(100, Math.max(0, data.pct_5h));
      quota5hFillEl.style.width = `${pct5h}%`;
      quota5hFillEl.className = `quota-fill ${getQuotaLevelClass(pct5h)}`;

      const refreshStr = data.refresh_5h ? ` (${data.refresh_5h})` : "";
      const tip5h = `[Hạn mức 5 Giờ còn lại]\n${pName}: ${pct5h}%${refreshStr}\nNhấp để làm mới`;
      if (quota5hEl) quota5hEl.title = tip5h;
    }

    if (quotaContainerEl) {
      const overallTip = `[Hạn mức Quota]\n• ${pName} - Tuần: ${data.pct_week}% ${data.refresh_week ? '(' + data.refresh_week + ')' : ''} | 5 Giờ: ${data.pct_5h}% ${data.refresh_5h ? '(' + data.refresh_5h + ')' : ''}\nNhấp để làm mới`;
      quotaContainerEl.title = overallTip;
    }
  }

  if (quotaContainerEl) {
    quotaContainerEl.addEventListener("click", function() {
      postToPython({ action: "refresh_quota" });
      showToast("Đang làm mới thông số Quota...");
    });
  }

  // Account Modal Helpers
  let accountModalCallback = null;
  function showAccountModal(title, text, subtext, confirmText, isDanger, onConfirm) {
    if (!accountModalEl) return;
    if (accountModalTitleEl) accountModalTitleEl.textContent = title;
    if (accountModalTextEl) accountModalTextEl.innerHTML = text;
    if (accountModalSubtextEl) {
      if (subtext) {
        accountModalSubtextEl.innerHTML = subtext;
        accountModalSubtextEl.classList.remove("hidden");
      } else {
        accountModalSubtextEl.classList.add("hidden");
      }
    }
    if (btnAccountModalConfirmEl) {
      btnAccountModalConfirmEl.textContent = confirmText || "Xác nhận";
      if (isDanger) {
        btnAccountModalConfirmEl.classList.add("btn-danger");
      } else {
        btnAccountModalConfirmEl.classList.remove("btn-danger");
      }
    }
    accountModalCallback = onConfirm;
    accountModalEl.classList.remove("hidden");
  }

  function closeAccountModal() {
    if (accountModalEl) {
      accountModalEl.classList.add("hidden");
    }
    accountModalCallback = null;
  }

  if (btnAccountModalCancelEl) {
    btnAccountModalCancelEl.addEventListener("click", function() {
      closeAccountModal();
    });
  }

  if (btnAccountModalConfirmEl) {
    btnAccountModalConfirmEl.addEventListener("click", function() {
      const cb = accountModalCallback;
      closeAccountModal();
      if (typeof cb === "function") {
        cb();
      }
    });
  }

  // Account Selector UI & Events
  function updateAccountsUI(data) {
    if (!data) return;
    const activeEmail = data.active_email || "";
    if (accountEmailEl) {
      accountEmailEl.textContent = activeEmail || "Chưa đăng nhập";
      accountEmailEl.title = activeEmail;
    }

    if (accountListEl) {
      accountListEl.innerHTML = "";
      const profiles = data.profiles || [];
      if (profiles.length === 0) {
        accountListEl.innerHTML = `<div class="account-item empty">Chưa có profile nào</div>`;
        return;
      }

      profiles.forEach(p => {
        const item = document.createElement("div");
        item.className = "account-item" + (p.is_active ? " active" : "");
        item.title = `Lần lưu cuối: ${p.last_saved || "chưa rõ"}`;

        const emailSpan = document.createElement("span");
        emailSpan.className = "account-item-email";
        emailSpan.textContent = p.email;
        item.appendChild(emailSpan);

        const actionsSpan = document.createElement("div");
        actionsSpan.className = "account-item-actions";

        if (p.is_active) {
          const checkSpan = document.createElement("span");
          checkSpan.className = "account-item-check";
          checkSpan.textContent = "✓";
          checkSpan.title = "Tài khoản đang hoạt động";
          actionsSpan.appendChild(checkSpan);
        }

        // Delete profile button
        const delBtn = document.createElement("button");
        delBtn.className = "account-item-del";
        delBtn.innerHTML = "🗑️";
        delBtn.title = `Xóa tài khoản ${p.email} khỏi danh sách đã lưu`;
        delBtn.addEventListener("click", function(e) {
          e.stopPropagation();
          toggleAccountDropdown(false);
          showAccountModal(
            "Xóa profile tài khoản",
            `Bạn có chắc chắn muốn xóa tài khoản <strong>${escapeHtml(p.email)}</strong> khỏi danh sách đã lưu?`,
            "Thao tác này chỉ xóa bản sao lưu profile trên máy, không ảnh hưởng tài khoản Google.",
            "Xóa profile",
            true,
            function() {
              showToast(`Đang xóa tài khoản ${p.email}...`);
              postToPython({
                action: "remove_account",
                email: p.email
              });
            }
          );
        });
        actionsSpan.appendChild(delBtn);

        item.appendChild(actionsSpan);

        if (!p.is_active) {
          item.addEventListener("click", function(e) {
            e.stopPropagation();
            toggleAccountDropdown(false);
            showToast(`Đang chuyển sang tài khoản ${p.email}...`);
            postToPython({
              action: "switch_account",
              email: p.email
            });
          });
        }

        accountListEl.appendChild(item);
      });
    }
  }

  function toggleAccountDropdown(show) {
    if (!accountDropdownEl || !accountSelectorEl) return;
    const shouldShow = typeof show === "boolean" ? show : accountDropdownEl.classList.contains("hidden");
    if (shouldShow) {
      accountDropdownEl.classList.remove("hidden");
      accountSelectorEl.classList.add("open");
    } else {
      accountDropdownEl.classList.add("hidden");
      accountSelectorEl.classList.remove("open");
    }
  }

  if (accountBadgeEl) {
    accountBadgeEl.addEventListener("click", function(e) {
      e.stopPropagation();
      toggleAccountDropdown();
    });
  }

  if (btnAccountSaveEl) {
    btnAccountSaveEl.addEventListener("click", function(e) {
      e.stopPropagation();
      showToast("Đang lưu snapshot tài khoản hiện tại...");
      postToPython({
        action: "save_account"
      });
    });
  }

  if (btnAccountAddEl) {
    btnAccountAddEl.addEventListener("click", function(e) {
      e.stopPropagation();
      toggleAccountDropdown(false);
      showAccountModal(
        "Thêm tài khoản Google",
        "Bạn muốn đăng nhập thêm tài khoản Google mới?",
        "Tài khoản hiện tại sẽ được tự động lưu snapshot dự phòng. Trình duyệt web sẽ tự động mở để bạn đăng nhập Google. Sau khi đăng nhập thành công, tài khoản mới sẽ tự động được kết nối và lưu vào danh sách.",
        "Mở đăng nhập Google",
        false,
        function() {
          showToast("Đang mở trình duyệt để đăng nhập Google...", 6000);
          postToPython({
            action: "add_account"
          });
        }
      );
    });
  }

  window.addEventListener("click", function(e) {
    if (accountSelectorEl && !accountSelectorEl.contains(e.target)) {
      toggleAccountDropdown(false);
    }
  });

  function renderProcessesList(processes) {
    const list = processes || [];
    const count = list.length;

    if (!activeProcessesStripEl || !activeProcessesListEl) return;

    if (count === 0) {
      activeProcessesStripEl.classList.add("hidden");
      activeProcessesListEl.innerHTML = "";
      return;
    }

    activeProcessesStripEl.classList.remove("hidden");

    if (activeProcessesCountEl) {
      activeProcessesCountEl.textContent = count;
    }

    if (btnKillAllProcsEl) {
      if (count > 1) {
        btnKillAllProcsEl.classList.remove("hidden");
        btnKillAllProcsEl.disabled = false;
        btnKillAllProcsEl.textContent = "✕ Tắt tất cả";
      } else {
        btnKillAllProcsEl.classList.add("hidden");
      }
    }

    activeProcessesListEl.innerHTML = "";

    list.forEach(p => {
      const item = document.createElement("div");
      item.className = "active-process-item";
      item.title = p.cmdline || p.name;

      const info = document.createElement("div");
      info.className = "active-process-info";

      const pidBadge = document.createElement("span");
      pidBadge.className = "active-process-pid";
      pidBadge.textContent = `PID ${p.pid}`;

      const nameSpan = document.createElement("span");
      nameSpan.className = "active-process-name";
      nameSpan.textContent = p.short_cmd || p.name || "cmd";

      info.appendChild(pidBadge);
      info.appendChild(nameSpan);

      const stats = document.createElement("div");
      stats.className = "active-process-stats";

      if (p.memory_mb !== undefined && p.memory_mb > 0) {
        const memSpan = document.createElement("span");
        memSpan.textContent = `💾 ${p.memory_mb} MB`;
        stats.appendChild(memSpan);
      }

      if (p.runtime) {
        const timeSpan = document.createElement("span");
        timeSpan.textContent = `⏱️ ${p.runtime}`;
        stats.appendChild(timeSpan);
      }

      info.appendChild(stats);

      const btnKill = document.createElement("button");
      btnKill.className = "btn-kill-proc";
      btnKill.title = `Tắt tiến trình PID ${p.pid}`;
      btnKill.innerHTML = `<span>✕</span><span>Tắt</span>`;
      btnKill.addEventListener("click", function(e) {
        e.stopPropagation();
        btnKill.disabled = true;
        btnKill.textContent = "Đang tắt...";
        postToPython({
          action: "kill_child_process",
          pid: p.pid
        });
      });

      item.appendChild(info);
      item.appendChild(btnKill);
      activeProcessesListEl.appendChild(item);
    });
  }

  if (btnKillAllProcsEl) {
    btnKillAllProcsEl.addEventListener("click", function(e) {
      e.stopPropagation();
      btnKillAllProcsEl.disabled = true;
      btnKillAllProcsEl.textContent = "Đang tắt...";
      postToPython({ action: "kill_all_child_processes" });
    });
  }

  // Render Attachments Preview Strip
  function updateAttachmentsStrip() {
    if (currentAttachments.length === 0) {
      attachmentsStripEl.classList.add("hidden");
      attachmentsStripEl.innerHTML = "";
      updateSendButtonState();
      return;
    }

    attachmentsStripEl.classList.remove("hidden");
    attachmentsStripEl.innerHTML = "";

    currentAttachments.forEach((att, index) => {
      const chip = document.createElement("div");
      chip.className = "att-preview-chip";

      if (att.is_image || (att.name && att.name.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i))) {
        const img = document.createElement("img");
        img.className = "att-thumb";
        img.src = att.file_url || att.path;
        chip.appendChild(img);
      } else {
        const icon = document.createElement("span");
        icon.textContent = "📄";
        chip.appendChild(icon);
      }

      const nameSpan = document.createElement("span");
      nameSpan.className = "att-name";
      nameSpan.textContent = att.name || att.path;
      chip.appendChild(nameSpan);

      const btnRemove = document.createElement("button");
      btnRemove.className = "att-btn-remove";
      btnRemove.innerHTML = "&times;";
      btnRemove.title = "Gỡ đính kèm";
      btnRemove.onclick = () => {
        currentAttachments.splice(index, 1);
        updateAttachmentsStrip();
      };
      chip.appendChild(btnRemove);

      attachmentsStripEl.appendChild(chip);
    });

    updateSendButtonState();
  }

  // Extract planned file changes (create, modify, delete) from text
  function extractPlanFiles(text) {
    if (!text) return null;

    function parseSection(keyword) {
      const headerPattern = "(?:-\\s*[*_]*File[^\\n:]*?" + keyword + "[^\\n:]*:?|File[^\\n:]*?" + keyword + "[^\\n:]*:?)";
      const nextHeaderPattern = "(?=(?:-\\s*[*_]*File|###|\\n\\n--|\\n\\n#+|$))";
      const regex = new RegExp(headerPattern + "[\\s\\S]*?" + nextHeaderPattern, "i");
      const match = text.match(regex);
      if (!match) return [];
      const block = match[0];

      const firstLine = block.split("\n")[0];
      if (/(?:không có|không\b|none\b)/i.test(firstLine) && !/(?:\[|`|\.js|\.py|\.css|\.html|\.tsx|\.ts|\.json|\.md)/i.test(firstLine)) {
        return [];
      }

      const files = [];
      const seen = new Set();

      // 1. Markdown file links: [label](file:///path)
      const linkRegex = /\[\s*([^\]]+?)\s*\]\(\s*(?:<([^>\n]+)>|&lt;([^>\n]+)&gt;|(file:\/\/(?:[^\s()]|\([^\s()]*\))+?))\s*(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\s*\)/g;
      let m;
      while ((m = linkRegex.exec(block)) !== null) {
        const rawUrl = m[2] || m[3] || m[4];
        if (!rawUrl) continue;
        const { cleanPath, filename } = parseFileHref(rawUrl);
        if (!seen.has(cleanPath) && !seen.has(filename)) {
          seen.add(cleanPath);
          seen.add(filename);
          files.push({ path: cleanPath, name: filename });
        }
      }

      // 2. Backtick paths: `path/to/file.ext`
      const validExtRegex = /\.(js|ts|jsx|tsx|py|html|css|json|md|txt|sh|c|cpp|h|hpp|go|rs|gd|cs|tscn|tres|godot|svg|png|jpg|jpeg|gif|webp|pdf|pptx|docx|xlsx|zip|tar|gz|xml|yaml|yml|toml|ini|cfg|conf|env|sql)$/i;
      const codeRegex = /`([^`\n]+)`/g;
      while ((m = codeRegex.exec(block)) !== null) {
        const p = m[1].trim();
        if (p.includes("/") || validExtRegex.test(p)) {
          if (p.includes(" ") && !validExtRegex.test(p)) continue;
          const cleanPath = p.replace(/^file:\/\/+/, "/");
          const filename = cleanPath.split("/").filter(Boolean).pop() || cleanPath;
          if (!seen.has(cleanPath) && !seen.has(filename)) {
            seen.add(cleanPath);
            seen.add(filename);
            files.push({ path: cleanPath, name: filename });
          }
        }
      }

      // 3. Bullet line paths: - app/main.py:
      const bulletRegex = /^\s*-\s+(?:\*\*)?([^\n:\*]+(?:\.[a-zA-Z0-9]+)?)(?:\*\*)?\s*:/gm;
      while ((m = bulletRegex.exec(block)) !== null) {
        const p = m[1].trim();
        if (p.includes("/") || validExtRegex.test(p)) {
          const filename = p.split("/").filter(Boolean).pop() || p;
          if (!seen.has(p) && !seen.has(filename)) {
            seen.add(p);
            seen.add(filename);
            files.push({ path: p, name: filename });
          }
        }
      }

      return files;
    }

    const created = parseSection("tạo\\s*mới");
    const modified = parseSection("chỉnh\\s*sửa");
    const deleted = parseSection("xóa");

    const hasAnyPlan = /File[^\n:]*?(?:tạo mới|chỉnh sửa|xóa)/i.test(text);
    if (!hasAnyPlan && created.length === 0 && modified.length === 0 && deleted.length === 0) {
      return null;
    }

    return { created, modified, deleted };
  }

  // Create Plan Changes Inspector DOM Box
  function createPlanChangesElement(plan) {
    const box = document.createElement("div");
    box.className = "plan-changes-box";
    if (plan.deleted && plan.deleted.length > 0) {
      box.classList.add("has-deletions");
    }

    const header = document.createElement("div");
    header.className = "plan-changes-header";

    const left = document.createElement("div");
    left.className = "plan-header-left";
    left.innerHTML = `
      <span class="plan-icon">📋</span>
      <span class="plan-title">Kế hoạch thay đổi tệp</span>
    `;

    const tags = document.createElement("div");
    tags.className = "plan-summary-tags";

    if (plan.created.length > 0) {
      tags.innerHTML += `<span class="plan-stat stat-create">+${plan.created.length} tạo mới</span>`;
    }
    if (plan.modified.length > 0) {
      tags.innerHTML += `<span class="plan-stat stat-modify">~${plan.modified.length} sửa đổi</span>`;
    }
    if (plan.deleted.length > 0) {
      tags.innerHTML += `<span class="plan-stat stat-delete">-${plan.deleted.length} xóa</span>`;
    }

    header.appendChild(left);
    header.appendChild(tags);
    box.appendChild(header);

    const body = document.createElement("div");
    body.className = "plan-changes-body";

    if (plan.created.length > 0) {
      const group = document.createElement("div");
      group.className = "plan-group group-create";
      group.innerHTML = `<span class="group-label">🟢 Tạo mới:</span>`;
      const chips = document.createElement("div");
      chips.className = "plan-chips";
      plan.created.forEach(f => {
        chips.innerHTML += `<span class="file-link file-create" data-filepath="${escapeHtml(f.path)}" title="${escapeHtml(f.path)}">➕ ${escapeHtml(f.name)}</span>`;
      });
      group.appendChild(chips);
      body.appendChild(group);
    }

    if (plan.modified.length > 0) {
      const group = document.createElement("div");
      group.className = "plan-group group-modify";
      group.innerHTML = `<span class="group-label">🟡 Chỉnh sửa:</span>`;
      const chips = document.createElement("div");
      chips.className = "plan-chips";
      plan.modified.forEach(f => {
        chips.innerHTML += `<span class="file-link file-modify" data-filepath="${escapeHtml(f.path)}" title="${escapeHtml(f.path)}">📝 ${escapeHtml(f.name)}</span>`;
      });
      group.appendChild(chips);
      body.appendChild(group);
    }

    if (plan.deleted.length > 0) {
      const group = document.createElement("div");
      group.className = "plan-group group-delete";
      group.innerHTML = `<span class="group-label">🔴 Xóa (Cảnh báo):</span>`;
      const chips = document.createElement("div");
      chips.className = "plan-chips";
      plan.deleted.forEach(f => {
        chips.innerHTML += `<span class="file-link file-delete" data-filepath="${escapeHtml(f.path)}" title="${escapeHtml(f.path)}">🗑️ ${escapeHtml(f.name)}</span>`;
      });
      group.appendChild(chips);
      body.appendChild(group);
    }

    box.appendChild(body);
    return box;
  }

  // Extract latest approved plan files from conversation history
  function getLatestApprovedPlan() {
    const planBoxes = messagesListEl.querySelectorAll(".plan-changes-box");
    if (planBoxes.length > 0) {
      const latestBox = planBoxes[planBoxes.length - 1];
      const files = [];
      latestBox.querySelectorAll(".file-link").forEach(el => {
        const p = el.dataset.filepath;
        if (p) files.push(p);
      });
      if (files.length > 0) return files;
    }

    // Fallback: check last assistant bubble markdown content
    const assistantCards = messagesListEl.querySelectorAll(".assistant-card");
    if (assistantCards.length > 0) {
      const lastCard = assistantCards[assistantCards.length - 1];
      const body = lastCard.querySelector(".markdown-body");
      if (body) {
        const plan = extractPlanFiles(body.innerText || body.textContent || "");
        if (plan) {
          const files = [];
          plan.created.forEach(f => files.push(f.path));
          plan.modified.forEach(f => files.push(f.path));
          plan.deleted.forEach(f => files.push(f.path));
          if (files.length > 0) return files;
        }
      }
    }
    return null;
  }

  // Normalize path for accurate comparison
  function normalizePath(p) {
    if (!p) return "";
    let clean = p.replace(/^file:\/\//, "").trim();
    clean = clean.replace(/^["']|["']$/g, "");
    if (currentWorkspace && clean.startsWith(currentWorkspace)) {
      clean = clean.substring(currentWorkspace.length).replace(/^\/+/, "");
    }
    return clean.replace(/^\.\//, "");
  }

  // Check if a target file path is approved in active plan
  function isPathApproved(targetPath, approvedList) {
    if (isFreeToGo) return true;
    if (!approvedList || approvedList.length === 0) return true;
    const cleanTarget = (targetPath || "").replace(/^["']|["']$/g, "").trim();

    // Ignore internal CLI paths (brain logs or agent scratchpad)
    if (cleanTarget.includes("/.gemini/antigravity-cli/brain/") || cleanTarget.includes("/.system_generated/")) {
      return true;
    }

    const normTarget = normalizePath(cleanTarget);
    const targetName = normTarget.split("/").pop();

    for (const item of approvedList) {
      const normItem = normalizePath(item);
      const itemName = normItem.split("/").pop();
      if (normTarget === normItem) return true;
      if (normTarget.endsWith("/" + normItem)) return true;
      if (normItem.endsWith("/" + normTarget)) return true;
      if (targetName && targetName === itemName && (!normItem.includes("/") || !normTarget.includes("/"))) return true;
    }
    return false;
  }

  // Show Guardrail violation modal and freeze agy process
  function showGuardrailViolation(toolName, targetPath) {
    if (isFreeToGo) return;
    pendingViolation = { toolName, targetPath };

    // Immediately pause agy process via Linux SIGSTOP
    postToPython({ action: "pause_process" });
    postToPython({
      action: "notify_violation",
      tool_name: toolName,
      target_path: targetPath
    });

    if (guardrailToolNameEl) guardrailToolNameEl.textContent = toolName;
    if (guardrailFilePathEl) guardrailFilePathEl.textContent = targetPath;

    if (guardrailApprovedListEl) {
      guardrailApprovedListEl.innerHTML = "";
      if (activeApprovedPlan && activeApprovedPlan.length > 0) {
        activeApprovedPlan.forEach(p => {
          const chip = document.createElement("span");
          chip.className = "file-link file-modify";
          chip.dataset.filepath = p;
          chip.textContent = "📄 " + (p.split("/").pop() || p);
          chip.title = p;
          guardrailApprovedListEl.appendChild(chip);
        });
      } else {
        guardrailApprovedListEl.innerHTML = `<span class="guardrail-empty-plan">Không có tệp nào được đăng ký trong kế hoạch</span>`;
      }
    }

    if (guardrailModalEl) {
      guardrailModalEl.classList.remove("hidden");
    }
    setStatus("busy", "⚠️ TẠM DỪNG: Tệp ngoài kế hoạch");
  }

  function hideGuardrailModal() {
    if (guardrailModalEl) {
      guardrailModalEl.classList.add("hidden");
    }
  }

  if (btnGuardrailAllowEl) {
    btnGuardrailAllowEl.addEventListener("click", function() {
      if (!pendingViolation) return;
      const { targetPath } = pendingViolation;
      if (!activeApprovedPlan) activeApprovedPlan = [];
      activeApprovedPlan.push(targetPath);

      hideGuardrailModal();
      postToPython({ action: "resume_process" });
      showToast(`Đã cho phép thao tác trên: ${targetPath.split("/").pop() || targetPath}`);
      setStatus("busy", "Đang tiếp tục thực thi...");
      pendingViolation = null;
    });
  }

  if (btnGuardrailRejectEl) {
    btnGuardrailRejectEl.addEventListener("click", function() {
      if (!pendingViolation) return;
      const { targetPath } = pendingViolation;
      const filename = targetPath.split("/").pop() || targetPath;

      hideGuardrailModal();
      postToPython({ action: "stop_process" });
      postToPython({ action: "rollback_action" });

      promptInputEl.value = `Dừng lại! Tệp \`${filename}\` không nằm trong kế hoạch đã thống nhất. Hãy chỉ thực hiện thay đổi trên các tệp đã được duyệt trong kế hoạch.`;
      updateInputBoxLayout();
      promptInputEl.focus();

      showToast(`Đã dừng tiến trình vi phạm và tự động hoàn tác các tệp.`);
      finalizeAssistantMessage();
      pendingViolation = null;
    });
  }

  // More Actions Dropdown Helpers
  function closeMoreActionsMenu() {
    if (moreActionsMenuEl && !moreActionsMenuEl.classList.contains("hidden")) {
      moreActionsMenuEl.classList.add("hidden");
      if (btnMoreActionsEl) btnMoreActionsEl.classList.remove("active");
    }
  }

  if (btnMoreActionsEl && moreActionsMenuEl) {
    btnMoreActionsEl.addEventListener("click", function(e) {
      e.stopPropagation();
      const isHidden = moreActionsMenuEl.classList.toggle("hidden");
      btnMoreActionsEl.classList.toggle("active", !isHidden);
    });

    document.addEventListener("click", function(e) {
      if (!moreActionsMenuEl.classList.contains("hidden") &&
          !moreActionsMenuEl.contains(e.target) &&
          e.target !== btnMoreActionsEl &&
          !btnMoreActionsEl.contains(e.target)) {
        closeMoreActionsMenu();
      }
    });

    document.addEventListener("keydown", function(e) {
      if (e.key === "Escape" && !moreActionsMenuEl.classList.contains("hidden")) {
        closeMoreActionsMenu();
      }
    });
  }

  if (btnRollbackEl) {
    btnRollbackEl.addEventListener("click", function() {
      closeMoreActionsMenu();
      if (isGenerating) {
        showToast("Đang có tiến trình thực thi, vui lòng dừng trước khi hoàn tác.");
        return;
      }
      postToPython({ action: "rollback_action" });
      showToast("Đang yêu cầu hoàn tác trạng thái trước ACTION...");
    });
  }

  // Append User Message to UI
  function appendUserMessage(text, attachments) {
    if (welcomeHeroEl) {
      welcomeHeroEl.style.display = "none";
    }

    const bubble = document.createElement("div");
    bubble.className = "message-bubble user";

    const card = document.createElement("div");
    card.className = "user-card";

    if (attachments && attachments.length > 0) {
      const grid = document.createElement("div");
      grid.className = "user-attachments-grid";

      attachments.forEach(att => {
        const item = document.createElement("div");
        item.className = "user-att-item";

        if (att.is_image || (att.name && att.name.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i))) {
          const img = document.createElement("img");
          img.src = att.file_url || att.path;
          item.appendChild(img);
        } else {
          item.appendChild(document.createTextNode("📄 "));
        }

        const span = document.createElement("span");
        span.textContent = att.name || att.path;
        item.appendChild(span);

        grid.appendChild(item);
      });

      card.appendChild(grid);
    }

    const textDiv = document.createElement("div");
    textDiv.textContent = text;
    card.appendChild(textDiv);

    bubble.appendChild(card);
    messagesListEl.appendChild(bubble);
    scrollToBottom();
  }

  // Append Historical Assistant Message
  function appendAssistantHistory(content, thinking, toolCalls) {
    if (welcomeHeroEl) {
      welcomeHeroEl.style.display = "none";
    }

    const bubble = document.createElement("div");
    bubble.className = "message-bubble assistant";

    const card = document.createElement("div");
    card.className = "assistant-card";

    // Thinking Box if exists
    if (thinking && thinking.trim()) {
      const thinkingBox = document.createElement("div");
      thinkingBox.className = "thinking-box";

      const thinkingHeader = document.createElement("div");
      thinkingHeader.className = "thinking-header";
      thinkingHeader.innerHTML = `
        <div class="thinking-header-left">
          <span>🧠</span>
          <span class="thinking-title">Tiến trình suy nghĩ</span>
        </div>
        <span class="thinking-toggle-icon">▶</span>
      `;

      const thinkingContent = document.createElement("div");
      thinkingContent.className = "thinking-content";
      thinkingContent.style.display = "none";
      thinkingContent.textContent = thinking.trim();

      thinkingHeader.onclick = () => {
        const isCollapsed = thinkingContent.style.display === "none";
        thinkingContent.style.display = isCollapsed ? "block" : "none";
        thinkingHeader.querySelector(".thinking-toggle-icon").textContent = isCollapsed ? "▼" : "▶";
      };

      thinkingBox.appendChild(thinkingHeader);
      thinkingBox.appendChild(thinkingContent);
      card.appendChild(thinkingBox);
    }

    // Tool calls if exist (collapsible)
    if (toolCalls && toolCalls.length > 0) {
      const toolsBox = document.createElement("div");
      toolsBox.className = "tools-box";

      const toolsHeader = document.createElement("div");
      toolsHeader.className = "tools-header";
      toolsHeader.innerHTML = `
        <div class="tools-header-left">
          <span>⚡</span>
          <span class="tools-title">Đã thực thi ${toolCalls.length} hành động</span>
        </div>
        <span class="tools-toggle-icon">▶</span>
      `;

      const toolsContent = document.createElement("div");
      toolsContent.className = "tools-content";
      toolsContent.style.display = "none";

      toolCalls.forEach(tc => {
        const toolCard = document.createElement("div");
        toolCard.className = "tool-card";
        const fnName = tc.function ? tc.function.name : (tc.name || "Tool");
        toolCard.innerHTML = `
          <div class="tool-header">
            <span>⚡</span>
            <span class="tool-name">${escapeHtml(fnName)}</span>
            <span class="tool-status">DONE</span>
          </div>
        `;
        toolsContent.appendChild(toolCard);
      });

      toolsHeader.onclick = () => {
        const isCollapsed = toolsContent.style.display === "none";
        toolsContent.style.display = isCollapsed ? "flex" : "none";
        toolsHeader.querySelector(".tools-toggle-icon").textContent = isCollapsed ? "▼" : "▶";
      };

      toolsBox.appendChild(toolsHeader);
      toolsBox.appendChild(toolsContent);
      card.appendChild(toolsBox);
    }

    // Plan changes box if detected
    const plan = extractPlanFiles(content);
    if (plan && (plan.created.length > 0 || plan.modified.length > 0 || plan.deleted.length > 0)) {
      const planBox = createPlanChangesElement(plan);
      card.appendChild(planBox);
    }

    // Markdown content
    if (content) {
      const bodyDiv = document.createElement("div");
      bodyDiv.className = "markdown-body";
      bodyDiv.innerHTML = renderMarkdown(content);
      card.appendChild(bodyDiv);
    }

    bubble.appendChild(card);
    messagesListEl.appendChild(bubble);
  }

  // Get or Create Active Assistant Message Card for Streaming
  function getOrCreateAssistantCard() {
    if (currentAssistantCard) {
      return currentAssistantCard;
    }

    const bubble = document.createElement("div");
    bubble.className = "message-bubble assistant";

    const card = document.createElement("div");
    card.className = "assistant-card";

    // Thinking Box Container
    const thinkingBox = document.createElement("div");
    thinkingBox.className = "thinking-box is-thinking hidden";
    thinkingBox.id = "active-thinking-box";

    const thinkingHeader = document.createElement("div");
    thinkingHeader.className = "thinking-header";
    thinkingHeader.innerHTML = `
      <div class="thinking-header-left">
        <span class="thinking-icon">🧠</span>
        <span class="thinking-title">Tiến trình suy nghĩ</span>
      </div>
      <span class="thinking-toggle-icon">▼</span>
    `;

    const thinkingContent = document.createElement("div");
    thinkingContent.className = "thinking-content";
    thinkingContent.id = "active-thinking-content";
    thinkingContent.textContent = "";
    thinkingContent.style.display = "block";

    thinkingHeader.onclick = () => {
      const isCollapsed = thinkingContent.style.display === "none";
      thinkingContent.style.display = isCollapsed ? "block" : "none";
      thinkingHeader.querySelector(".thinking-toggle-icon").textContent = isCollapsed ? "▼" : "▶";
    };

    thinkingBox.appendChild(thinkingHeader);
    thinkingBox.appendChild(thinkingContent);
    card.appendChild(thinkingBox);

    // Tool Calls Box (Collapsible)
    const toolsBox = document.createElement("div");
    toolsBox.className = "tools-box hidden";
    toolsBox.id = "active-tools-box";

    const toolsHeader = document.createElement("div");
    toolsHeader.className = "tools-header";
    toolsHeader.id = "active-tools-header";
    toolsHeader.innerHTML = `
      <div class="tools-header-left">
        <span>⚡</span>
        <span class="tools-title">Đang thực thi hành động...</span>
      </div>
      <span class="tools-toggle-icon">▼</span>
    `;

    const toolsContent = document.createElement("div");
    toolsContent.className = "tools-content";
    toolsContent.id = "active-tools-content";

    toolsHeader.onclick = () => {
      const isCollapsed = toolsContent.style.display === "none";
      toolsContent.style.display = isCollapsed ? "flex" : "none";
      toolsHeader.querySelector(".tools-toggle-icon").textContent = isCollapsed ? "▼" : "▶";
    };

    toolsBox.appendChild(toolsHeader);
    toolsBox.appendChild(toolsContent);
    card.appendChild(toolsBox);

    // Markdown response body
    const bodyDiv = document.createElement("div");
    bodyDiv.className = "markdown-body";
    bodyDiv.id = "active-assistant-body";
    card.appendChild(bodyDiv);

    bubble.appendChild(card);
    messagesListEl.appendChild(bubble);

    currentAssistantCard = card;
    currentAssistantText = "";
    currentThinkingText = "";

    scrollToBottom();
    return currentAssistantCard;
  }

  // Finalize Assistant Message
  function finalizeAssistantMessage() {
    if (currentAssistantCard) {
      const thinkingBox = currentAssistantCard.querySelector("#active-thinking-box");
      const thinkingContent = currentAssistantCard.querySelector("#active-thinking-content");
      const toggle = thinkingBox ? thinkingBox.querySelector(".thinking-toggle-icon") : null;

      if (thinkingBox) {
        thinkingBox.classList.remove("is-thinking");
        if (!currentThinkingText || !currentThinkingText.trim()) {
          thinkingBox.remove();
        } else {
          thinkingBox.classList.remove("hidden");
          if (thinkingContent) {
            thinkingContent.textContent = currentThinkingText.trim();
            thinkingContent.style.display = "none";
          }
          if (toggle) {
            toggle.textContent = "▶";
          }
          thinkingBox.removeAttribute("id");
          if (thinkingContent) thinkingContent.removeAttribute("id");
        }
      }

      const toolsBox = currentAssistantCard.querySelector("#active-tools-box");
      const toolsContent = currentAssistantCard.querySelector("#active-tools-content");
      if (toolsBox) {
        const count = toolsContent ? toolsContent.querySelectorAll(".tool-card").length : 0;
        if (count === 0) {
          toolsBox.remove();
        } else {
          // Auto-collapse tool calls upon completion
          const header = toolsBox.querySelector("#active-tools-header");
          const title = toolsBox.querySelector(".tools-title");
          const toggle = toolsBox.querySelector(".tools-toggle-icon");
          if (title) title.textContent = `Đã thực thi ${count} hành động`;
          if (toolsContent) toolsContent.style.display = "none";
          if (toggle) toggle.textContent = "▶";
          if (header) header.removeAttribute("id");
          if (toolsContent) toolsContent.removeAttribute("id");
          toolsBox.removeAttribute("id");
        }
      }

      const body = currentAssistantCard.querySelector("#active-assistant-body");
      if (body) {
        // Insert plan changes inspector box if detected
        const plan = extractPlanFiles(currentAssistantText);
        if (plan && (plan.created.length > 0 || plan.modified.length > 0 || plan.deleted.length > 0)) {
          const planBox = createPlanChangesElement(plan);
          currentAssistantCard.insertBefore(planBox, body);
        }
        body.removeAttribute("id");
      }

      const finishedText = currentAssistantText;
      currentAssistantCard = null;
      currentAssistantText = "";
      currentThinkingText = "";
    }

    isGenerating = false;
    updateSendButtonState();
    setStatus("ready", "Sẵn sàng");
    promptInputEl.focus();
    scrollToBottom();

    if (isFreeToGo && !wasStoppedByUser) {
      handleFreeToGoTurnEnd(finishedText);
    }
    wasStoppedByUser = false;
  }

  // Sidebar Controls
  function openSidebar() {
    sidebarDrawerEl.classList.add("open");
    sidebarOverlayEl.classList.add("open");
    postToPython({ action: "get_conversations" });
  }

  function closeSidebar() {
    sidebarDrawerEl.classList.remove("open");
    sidebarOverlayEl.classList.remove("open");
  }

  btnMenuEl.addEventListener("click", openSidebar);
  if (btnPinEl) {
    btnPinEl.addEventListener("click", () => {
      postToPython({ action: "toggle_pin" });
    });
  }
  btnCloseSidebarEl.addEventListener("click", closeSidebar);
  sidebarOverlayEl.addEventListener("click", closeSidebar);

  btnNewChatEl.addEventListener("click", () => {
    if (freeToGoTimer) {
      clearTimeout(freeToGoTimer);
      freeToGoTimer = null;
    }
    closeSidebar();
    postToPython({ action: "new_chat" });
  });

  // Format date helper
  function formatTime(isoStr) {
    if (!isoStr) return "";
    try {
      const d = new Date(isoStr);
      const hours = String(d.getHours()).padStart(2, "0");
      const mins = String(d.getMinutes()).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      return `${hours}:${mins} • ${day}/${month}`;
    } catch {
      return isoStr.substring(0, 16);
    }
  }

  // Sidebar State & 3-Tab Controls
  let activeSidebarTab = "current";
  let currentWorkspacePath = "";
  let currentConvOffset = 15;
  let currentConvHasMore = false;
  let catalogCache = {}; // { [workspace]: { offset: number, hasMore: boolean } }

  function switchSidebarTab(tab) {
    activeSidebarTab = tab;
    [tabBtnCurrent, tabBtnRecent, tabBtnCatalog].forEach(b => {
      if (b) b.classList.toggle("active", b.dataset.tab === tab);
    });
    if (paneCurrent) paneCurrent.style.display = (tab === "current" ? "flex" : "none");
    if (paneRecent) paneRecent.style.display = (tab === "recent" ? "flex" : "none");
    if (paneCatalog) paneCatalog.style.display = (tab === "catalog" ? "flex" : "none");
  }

  if (tabBtnCurrent) tabBtnCurrent.addEventListener("click", () => switchSidebarTab("current"));
  if (tabBtnRecent) tabBtnRecent.addEventListener("click", () => switchSidebarTab("recent"));
  if (tabBtnCatalog) tabBtnCatalog.addEventListener("click", () => switchSidebarTab("catalog"));

  // Click handler for See More in Current Folder
  if (btnSeeMoreCurrentEl) {
    btnSeeMoreCurrentEl.addEventListener("click", () => {
      btnSeeMoreCurrentEl.disabled = true;
      btnSeeMoreCurrentEl.innerHTML = `<span class="see-more-icon">⌛</span> Đang tải thêm...`;
      postToPython({
        action: "load_more_conversations",
        workspace: currentWorkspacePath,
        offset: currentConvOffset,
        limit: 15,
        context: "current"
      });
    });
  }

  function createConvItem(item, isCurrentWs, showFolderTag) {
    const el = document.createElement("div");
    el.className = "conv-item" + (item.id === activeConvId ? " active" : "");

    const timeFormatted = formatTime(item.last_modified);
    const folderDisplay = item.workspace_name || item.workspace || "Thư mục không tên";

    el.innerHTML = `
      <div class="conv-item-top">
        <span class="conv-item-title">${escapeHtml(item.title)}</span>
        <span class="conv-item-time">${timeFormatted}</span>
      </div>
      <div class="conv-item-preview">${escapeHtml(item.preview || "Không có tóm tắt")}</div>
      ${showFolderTag ? `<div class="conv-item-folder">📂 ${escapeHtml(folderDisplay)}</div>` : ""}
    `;

    el.onclick = () => {
      postToPython({
        action: "select_conversation",
        id: item.id,
        workspace: item.workspace
      });
      if (isCurrentWs) {
        closeSidebar();
      }
    };

    return el;
  }

  function renderConversationsData(data) {
    currentWorkspacePath = data.current_workspace || "";
    const currentName = data.current_workspace_name || "Thư mục hiện tại";
    if (labelCurrentWorkspaceEl) {
      labelCurrentWorkspaceEl.textContent = `📁 ${currentName.toUpperCase()}`;
      labelCurrentWorkspaceEl.title = currentWorkspacePath;
    }

    // 1. Tab Current Folder
    const currentItems = data.current_items || [];
    currentConvOffset = currentItems.length;
    currentConvHasMore = !!data.current_has_more;

    const totalCurrent = data.current_total !== undefined ? data.current_total : currentItems.length;
    if (tabCountCurrent) tabCountCurrent.textContent = totalCurrent;
    if (countCurrentEl) countCurrentEl.textContent = totalCurrent;

    if (listCurrentEl) {
      listCurrentEl.innerHTML = "";
      if (currentItems.length === 0) {
        listCurrentEl.innerHTML = `<div class="conv-empty">Chưa có cuộc hội thoại nào trong thư mục này</div>`;
      } else {
        currentItems.forEach(item => {
          listCurrentEl.appendChild(createConvItem(item, true, false));
        });
      }
    }

    if (wrapSeeMoreCurrentEl) {
      wrapSeeMoreCurrentEl.style.display = currentConvHasMore ? "flex" : "none";
    }
    if (btnSeeMoreCurrentEl) {
      btnSeeMoreCurrentEl.disabled = false;
      btnSeeMoreCurrentEl.innerHTML = `<span class="see-more-icon">📥</span> Xem thêm hội thoại cũ`;
    }

    // 2. Tab Recent 20
    const recentItems = data.recent_items || [];
    if (tabCountRecent) tabCountRecent.textContent = recentItems.length;
    if (countRecentEl) countRecentEl.textContent = recentItems.length;

    if (listRecentEl) {
      listRecentEl.innerHTML = "";
      if (recentItems.length === 0) {
        listRecentEl.innerHTML = `<div class="conv-empty">Không có cuộc hội thoại gần đây</div>`;
      } else {
        recentItems.forEach(item => {
          const isSameFolder = (item.workspace && item.workspace === currentWorkspacePath);
          listRecentEl.appendChild(createConvItem(item, isSameFolder, true));
        });
      }
    }

    // 3. Tab Catalog
    const catalog = data.catalog || [];
    if (tabCountCatalog) tabCountCatalog.textContent = catalog.length;
    if (countCatalogEl) countCatalogEl.textContent = catalog.length;
    renderCatalogList(catalog);
  }

  function renderCatalogList(catalog) {
    if (!listCatalogEl) return;
    listCatalogEl.innerHTML = "";

    if (!catalog || catalog.length === 0) {
      listCatalogEl.innerHTML = `<div class="conv-empty">Không có thư mục nào</div>`;
      return;
    }

    catalog.forEach(cat => {
      const card = document.createElement("div");
      card.className = "catalog-folder-card" + (cat.is_current ? " active-folder" : "");
      card.dataset.workspace = cat.workspace;

      card.innerHTML = `
        <div class="catalog-folder-header">
          <span class="catalog-folder-icon">${cat.is_current ? "⭐" : "📁"}</span>
          <div class="catalog-folder-info">
            <div class="catalog-folder-name-row">
              <span class="catalog-folder-name">${escapeHtml(cat.workspace_name)}</span>
              ${cat.is_current ? `<span class="badge-current-ws">Hiện tại</span>` : ""}
            </div>
            <div class="catalog-folder-path" title="${escapeHtml(cat.workspace)}">${escapeHtml(cat.workspace)}</div>
          </div>
          <div class="catalog-folder-meta">
            <span class="catalog-count-pill">${cat.conversation_count}</span>
            <span class="catalog-chevron">▼</span>
          </div>
        </div>
        <div class="catalog-folder-body">
          <div class="conv-list catalog-conv-list">
            <div class="conv-empty">Đang tải danh sách...</div>
          </div>
          <div class="see-more-wrap catalog-see-more-wrap" style="display: none;">
            <button class="btn-see-more btn-see-more-catalog">
              <span class="see-more-icon">📥</span> Xem thêm
            </button>
          </div>
        </div>
      `;

      const header = card.querySelector(".catalog-folder-header");
      const convList = card.querySelector(".catalog-conv-list");
      const seeMoreWrap = card.querySelector(".catalog-see-more-wrap");
      const btnSeeMore = card.querySelector(".btn-see-more-catalog");

      header.onclick = () => {
        const isExpanded = card.classList.toggle("expanded");
        if (isExpanded) {
          if (!catalogCache[cat.workspace]) {
            catalogCache[cat.workspace] = { offset: 0, hasMore: false };
            postToPython({
              action: "get_folder_conversations",
              workspace: cat.workspace,
              offset: 0,
              limit: 15,
              context: "catalog"
            });
          }
        }
      };

      btnSeeMore.onclick = (e) => {
        e.stopPropagation();
        const cache = catalogCache[cat.workspace] || { offset: 0 };
        btnSeeMore.disabled = true;
        btnSeeMore.textContent = "Đang tải...";
        postToPython({
          action: "get_folder_conversations",
          workspace: cat.workspace,
          offset: cache.offset,
          limit: 15,
          context: "catalog"
        });
      };

      listCatalogEl.appendChild(card);
    });
  }

  function handleFolderConversationsResult(result) {
    const ws = result.workspace;
    const context = result.context || "current";
    const items = result.items || [];
    const hasMore = !!result.has_more;

    if (context === "current") {
      if (btnSeeMoreCurrentEl) {
        btnSeeMoreCurrentEl.disabled = false;
        btnSeeMoreCurrentEl.innerHTML = `<span class="see-more-icon">📥</span> Xem thêm hội thoại cũ`;
      }
      if (listCurrentEl) {
        items.forEach(item => {
          listCurrentEl.appendChild(createConvItem(item, true, false));
        });
      }
      currentConvOffset += items.length;
      currentConvHasMore = hasMore;
      if (wrapSeeMoreCurrentEl) {
        wrapSeeMoreCurrentEl.style.display = hasMore ? "flex" : "none";
      }
    } else if (context === "catalog") {
      const cards = Array.from(listCatalogEl.querySelectorAll(".catalog-folder-card"));
      const card = cards.find(c => c.dataset.workspace === ws);
      if (!card) return;

      const convList = card.querySelector(".catalog-conv-list");
      const seeMoreWrap = card.querySelector(".catalog-see-more-wrap");
      const btnSeeMore = card.querySelector(".btn-see-more-catalog");

      if (btnSeeMore) {
        btnSeeMore.disabled = false;
        btnSeeMore.innerHTML = `<span class="see-more-icon">📥</span> Xem thêm`;
      }

      if (!catalogCache[ws]) {
        catalogCache[ws] = { offset: 0, hasMore: false };
      }

      if (catalogCache[ws].offset === 0) {
        convList.innerHTML = "";
      }

      const isCurrentWs = (ws === currentWorkspacePath);
      items.forEach(item => {
        convList.appendChild(createConvItem(item, isCurrentWs, false));
      });

      catalogCache[ws].offset += items.length;
      catalogCache[ws].hasMore = hasMore;

      if (items.length === 0 && catalogCache[ws].offset === 0) {
        convList.innerHTML = `<div class="conv-empty">Không có hội thoại trong thư mục này</div>`;
      }

      if (seeMoreWrap) {
        seeMoreWrap.style.display = hasMore ? "flex" : "none";
      }
    }
  }

  // Backward compatibility wrapper
  function renderConversationList(items, currentWs) {
    renderConversationsData({
      current_workspace: currentWs,
      current_items: items.filter(it => it.workspace === currentWs),
      recent_items: items.slice(0, 20),
      catalog: []
    });
  }

  // Handle Send Prompt
  function handleSend() {
    if (freeToGoTimer) {
      clearTimeout(freeToGoTimer);
      freeToGoTimer = null;
    }
    let text = promptInputEl.value.trim();
    if (!text && currentAttachments.length === 0) {
      return;
    }
    if (isGenerating) {
      return;
    }

    // In Free to go mode, ensure prompt ends with ACTION so Agent immediately executes
    if (isFreeToGo) {
      if (!/\bACTION\s*$/.test(text)) {
        text = text ? (text + " ACTION") : "ACTION";
      }
    }

    const attachmentsCopy = [...currentAttachments];

    appendUserMessage(text, attachmentsCopy);

    // If user prompt ends with ACTION, capture approved plan
    if (/\bACTION\s*$/.test(text)) {
      activeApprovedPlan = getLatestApprovedPlan();
    } else {
      activeApprovedPlan = null;
    }

    resetInputBox();
    currentAttachments = [];
    updateAttachmentsStrip();

    isGenerating = true;
    updateSendButtonState();
    setStatus("busy", isFreeToGo ? "🚀 Free to go: Đang tự hành triển khai..." : "Đang xử lý...");

    getOrCreateAssistantCard();

    postToPython({
      action: "send_prompt",
      prompt: text,
      attachments: attachmentsCopy,
      approved_plan: activeApprovedPlan,
      is_free_to_go: isFreeToGo
    });
  }

  // Stop current running task
  function stopCurrentTask() {
    if (!isGenerating) return;

    wasStoppedByUser = true;
    if (freeToGoTimer) {
      clearTimeout(freeToGoTimer);
      freeToGoTimer = null;
    }

    if (btnActionLabelEl) {
      btnActionLabelEl.textContent = "⏹ ĐANG DỪNG...";
    }
    btnActionEl.disabled = true;

    postToPython({ action: "stop_process" });
    showToast("⏹ Đã gửi yêu cầu dừng công việc hiện tại.");
    setStatus("busy", "Đang dừng tiến trình...");
  }

  // Handle ACTION Click (Triggers ACTION or stops running task when generating)
  btnActionEl.addEventListener("click", function() {
    if (isGenerating) {
      stopCurrentTask();
      return;
    }

    if (freeToGoTimer) {
      clearTimeout(freeToGoTimer);
      freeToGoTimer = null;
    }

    let text = promptInputEl.value.trim();
    if (text) {
      text = text + " ACTION";
    } else {
      text = "ACTION";
    }

    const attachmentsCopy = [...currentAttachments];

    appendUserMessage(text, attachmentsCopy);

    // If user prompt ends with ACTION, capture approved plan
    if (/\bACTION\s*$/.test(text)) {
      activeApprovedPlan = getLatestApprovedPlan();
    } else {
      activeApprovedPlan = null;
    }

    resetInputBox();
    currentAttachments = [];
    updateAttachmentsStrip();

    isGenerating = true;
    updateSendButtonState();
    setStatus("busy", "Đang thực thi ACTION...");

    getOrCreateAssistantCard();

    postToPython({
      action: "send_prompt",
      prompt: text,
      attachments: attachmentsCopy,
      approved_plan: activeApprovedPlan,
      is_free_to_go: isFreeToGo
    });
  });

  // Handle Click on Free to go toggle button
  if (btnFreeToGoEl) {
    btnFreeToGoEl.addEventListener("click", function() {
      if (isGenerating) return;
      toggleFreeToGoMode();
    });
  }

  // Handle Right Click (Context Menu) on ACTION button to toggle Free to go mode
  btnActionEl.addEventListener("contextmenu", function(e) {
    e.preventDefault();
    if (isGenerating) return;
    toggleFreeToGoMode();
  });

  function toggleFreeToGoMode(forcedState) {
    if (typeof forcedState === "boolean") {
      isFreeToGo = forcedState;
    } else {
      isFreeToGo = !isFreeToGo;
    }

    if (btnFreeToGoEl) {
      if (isFreeToGo) {
        btnFreeToGoEl.classList.add("active");
        btnFreeToGoEl.title = "Chế độ Free to go: ĐANG BẬT (Agent được tự do thực hiện không bị chặn kế hoạch tới khi hoàn tất)\nClick để TẮT";
      } else {
        btnFreeToGoEl.classList.remove("active");
        btnFreeToGoEl.title = "Chế độ Free to go: ĐANG TẮT (Mặc định: kiểm tra kế hoạch trước khi sửa file)\nClick để BẬT";
      }
    }

    if (isFreeToGo) {
      btnActionEl.classList.add("free-to-go");
      if (actionModeBadgeEl) {
        actionModeBadgeEl.classList.remove("hidden");
        actionModeBadgeEl.textContent = "FREE ON";
      }
      if (btnActionLabelEl) {
        btnActionLabelEl.textContent = "🚀 FREE GO";
      }
      btnActionEl.title = "Chế độ Free to go: ĐANG BẬT (Tự do làm ngoài kế hoạch tới khi hoàn tất)\nClick để gửi ngay | Click phải để tắt";
      showToast("Đã BẬT chế độ Free to go: Cho phép tự do thực hiện ngoài kế hoạch tới khi hoàn thành.");
    } else {
      if (freeToGoTimer) {
        clearTimeout(freeToGoTimer);
        freeToGoTimer = null;
      }
      btnActionEl.classList.remove("free-to-go");
      if (actionModeBadgeEl) {
        actionModeBadgeEl.classList.add("hidden");
      }
      if (btnActionLabelEl) {
        btnActionLabelEl.textContent = "⚡ ACTION";
      }
      btnActionEl.title = "Click để gửi ACTION | Click phải: Bật/Tắt chế độ Free to go";
      showToast("Đã TẮT chế độ Free to go (Mặc định).");
      setStatus("ready", "Sẵn sàng");
    }

    postToPython({
      action: "sync_action_plan",
      approved_plan: activeApprovedPlan,
      is_free_to_go: isFreeToGo,
      is_action: false
    });
  }

  // Detect whether Agent has self-evaluated task completion
  function isTaskCompleted(text) {
    if (!text) return false;
    const clean = text.toLowerCase();

    // If explicitly stating pending steps or not finished yet
    if (/chưa hoàn thành|chưa hoàn tất|tiếp tục thực hiện|các bước tiếp theo|kế hoạch định làm/i.test(clean)) {
      return false;
    }

    const completionRegexes = [
      /đã hoàn thành(?:\s+(?:toàn bộ|tất cả))?\s+(?:nhiệm vụ|yêu cầu|công việc|các thay đổi)/i,
      /đã hoàn tất(?:\s+(?:toàn bộ|tất cả))?\s+(?:nhiệm vụ|yêu cầu|công việc|các thay đổi)/i,
      /đã thực hiện xong(?:\s+(?:toàn bộ|tất cả))?/i,
      /nhiệm vụ đã (?:được )?hoàn thành/i,
      /yêu cầu đã (?:được )?hoàn tất/i,
      /mục tiêu đã (?:được )?hoàn thành/i,
      /\b(task|job|request)\s+(is\s+)?completed\b/i,
      /\ball\s+tasks?\s+completed\b/i
    ];

    for (const reg of completionRegexes) {
      if (reg.test(clean)) return true;
    }
    return false;
  }

  // Handle Free to go turn end auto-continuation
  function handleFreeToGoTurnEnd(finishedText) {
    if (!isFreeToGo) return;

    if (freeToGoTimer) {
      clearTimeout(freeToGoTimer);
      freeToGoTimer = null;
    }

    if (isTaskCompleted(finishedText)) {
      showToast("🎉 [Free to go] Agent đã hoàn thành nhiệm vụ được giao!");
      setStatus("ready", "Nhiệm vụ đã hoàn tất");
      return;
    }

    setStatus("busy", "🚀 Free to go: Tự động gửi ACTION sau 1 giây...");
    freeToGoTimer = setTimeout(() => {
      triggerAutoAction();
    }, 1000);
  }

  // Auto trigger ACTION prompt in Free to go mode
  function triggerAutoAction() {
    if (!isFreeToGo || isGenerating) return;

    let text = promptInputEl.value.trim();
    if (text) {
      if (!/\bACTION\s*$/.test(text)) {
        text = text + " ACTION";
      }
    } else {
      text = "ACTION";
    }

    const attachmentsCopy = [...currentAttachments];
    const displayMsg = text === "ACTION" ? "⚡ [Free to go] Tự động gửi ACTION" : text;
    appendUserMessage(displayMsg, attachmentsCopy);

    resetInputBox();
    currentAttachments = [];
    updateAttachmentsStrip();

    isGenerating = true;
    updateSendButtonState();
    setStatus("busy", "🚀 Free to go: Đang tự hành triển khai...");

    getOrCreateAssistantCard();

    postToPython({
      action: "send_prompt",
      prompt: text,
      attachments: attachmentsCopy,
      approved_plan: activeApprovedPlan,
      is_free_to_go: isFreeToGo
    });
  }

  // Auto-resize and adapt layout (1-row vs 2-tier card)
  function updateInputBoxLayout() {
    if (!promptInputEl) return;
    const text = promptInputEl.value;
    const hasLineBreaks = text.includes("\n");

    promptInputEl.style.height = "auto";
    const currentScrollH = promptInputEl.scrollHeight;

    const isMulti = hasLineBreaks || currentScrollH > 38;

    if (inputBoxWrapperEl) {
      if (isMulti) {
        inputBoxWrapperEl.classList.add("multiline");
      } else {
        inputBoxWrapperEl.classList.remove("multiline");
      }
    }

    promptInputEl.style.height = Math.min(promptInputEl.scrollHeight, 180) + "px";
    updateSendButtonState();
  }

  function resetInputBox() {
    if (!promptInputEl) return;
    promptInputEl.value = "";
    promptInputEl.style.height = "auto";
    if (inputBoxWrapperEl) {
      inputBoxWrapperEl.classList.remove("multiline");
    }
    updateSendButtonState();
  }

  // Event Listeners for Input Box
  promptInputEl.addEventListener("keydown", function(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const hasContent = promptInputEl.value.trim().length > 0 || currentAttachments.length > 0;
      if (hasContent) {
        handleSend();
      }
    }
  });

  promptInputEl.addEventListener("input", updateInputBoxLayout);

  btnSendEl.addEventListener("click", handleSend);

  // Deep Think 5 Level Controls & Visualization
  function openDeepThinkModal() {
    if (deepThinkModalEl) {
      deepThinkModalEl.classList.remove("hidden");
      if (deepThinkState) {
        renderDeepThinkTree(deepThinkState);
      }
    }
  }

  function closeDeepThinkModal() {
    if (deepThinkModalEl) {
      deepThinkModalEl.classList.add("hidden");
    }
  }

  function renderDeepThinkTree(state) {
    if (!state) return;
    deepThinkState = state;
    isDeepThinkRunning = state.is_active || false;

    if (deepThinkRootTextEl) {
      deepThinkRootTextEl.textContent = state.root_task || "Chưa có nhiệm vụ nào";
    }

    if (statTotalNodesEl) statTotalNodesEl.textContent = state.total_nodes || 0;
    if (statCompletedNodesEl) statCompletedNodesEl.textContent = state.completed_nodes || 0;
    if (statAtomicNodesEl) statAtomicNodesEl.textContent = state.atomic_nodes || 0;
    if (statPendingNodesEl) statPendingNodesEl.textContent = state.pending_nodes || 0;

    const lc = state.level_counts || {};
    if (pillLvl1El) pillLvl1El.textContent = `Tầng 1: ${lc[1] || 0}`;
    if (pillLvl2El) pillLvl2El.textContent = `Tầng 2: ${lc[2] || 0}`;
    if (pillLvl3El) pillLvl3El.textContent = `Tầng 3: ${lc[3] || 0}`;
    if (pillLvl4El) pillLvl4El.textContent = `Tầng 4: ${lc[4] || 0}`;
    if (pillLvl5El) pillLvl5El.textContent = `Tầng 5: ${lc[5] || 0}`;

    const maxLvl = state.max_levels || 5;
    const selMaxLevelsEl = document.getElementById("sel-max-levels");
    if (selMaxLevelsEl && !isDeepThinkRunning) {
      selMaxLevelsEl.value = `${maxLvl}`;
    }
    if (pillLvl3El) pillLvl3El.style.display = maxLvl >= 3 ? "" : "none";
    if (pillLvl4El) pillLvl4El.style.display = maxLvl >= 4 ? "" : "none";
    if (pillLvl5El) pillLvl5El.style.display = maxLvl >= 5 ? "" : "none";

    const currentLevel = state.current_node ? state.current_node.level : 0;
    [pillLvl1El, pillLvl2El, pillLvl3El, pillLvl4El, pillLvl5El].forEach((el, idx) => {
      if (el) {
        if (state.is_active && currentLevel === idx + 1) {
          el.classList.add("active");
        } else {
          el.classList.remove("active");
        }
      }
    });

    if (deepThinkHeaderBadgeEl) {
      if (state.total_nodes > 0 && state.is_active) {
        deepThinkHeaderBadgeEl.classList.remove("hidden");
        deepThinkHeaderBadgeEl.textContent = `${state.total_nodes}`;
      } else {
        deepThinkHeaderBadgeEl.classList.add("hidden");
      }
    }

    if (btnPauseDeepThinkEl) {
      if (state.is_active) {
        btnPauseDeepThinkEl.classList.remove("hidden");
        btnPauseDeepThinkEl.textContent = state.is_paused ? "▶ Tiếp tục" : "⏸ Tạm dừng";
      } else {
        btnPauseDeepThinkEl.classList.add("hidden");
      }
    }

    if (btnStopDeepThinkEl) {
      if (state.is_active) {
        btnStopDeepThinkEl.classList.remove("hidden");
      } else {
        btnStopDeepThinkEl.classList.add("hidden");
      }
    }

    if (deepThinkStatusMessageEl) {
      if (state.is_active) {
        if (state.is_paused) {
          deepThinkStatusMessageEl.textContent = "⏸ Trạng thái: Đang tạm dừng";
        } else if (state.current_node) {
          if (state.current_node.is_synthesis) {
            deepThinkStatusMessageEl.textContent = `🔄 Đang hợp nhất: ${state.current_node.title}...`;
          } else {
            deepThinkStatusMessageEl.textContent = `⏳ Đang phân rã [Tầng ${state.current_node.level}]: ${state.current_node.title}...`;
          }
        } else {
          deepThinkStatusMessageEl.textContent = "⏳ Trạng thái: Đang phân tích...";
        }
      } else if (state.total_nodes > 0) {
        deepThinkStatusMessageEl.textContent = "✅ Trạng thái: Đã hoàn tất cây phân rã 5 tầng";
      } else {
        deepThinkStatusMessageEl.textContent = "Trạng thái: Sẵn sàng";
      }
    }

    if (deepThinkTreeEl) {
      deepThinkTreeEl.innerHTML = "";
      const nodes = state.nodes || {};
      const root = nodes["root"];

      if (!root || !root.children || root.children.length === 0) {
        deepThinkTreeEl.innerHTML = '<div class="tree-empty">Chưa có node phân rã nào. Hãy nhập nhiệm vụ và bấm <strong>🧠 DEEP THINK</strong>.</div>';
        return;
      }

      function buildNodeCard(node) {
        const item = document.createElement("div");
        const isSynth = node.is_synthesis || false;
        item.className = `tree-node-item level-${node.level} status-${node.status} ${isSynth ? 'is-synthesis' : ''}`;

        let statusBadgeText = "Chờ phân tích";
        let statusBadgeClass = "pending";
        if (node.status === "skipped") {
          statusBadgeText = "⏭ Đã bỏ qua";
          statusBadgeClass = "skipped";
        } else if (isSynth) {
          if (node.status === "waiting_children") {
            statusBadgeText = "⏳ Chờ các task con";
            statusBadgeClass = "waiting_children";
          } else if (node.status === "pending") {
            statusBadgeText = "🔄 Sẵn sàng hợp nhất";
            statusBadgeClass = "synthesis";
          } else if (node.status === "in_progress") {
            statusBadgeText = "⏳ Đang hợp nhất...";
            statusBadgeClass = "in_progress";
          } else if (node.status === "completed" || node.status === "atomic") {
            statusBadgeText = "✅ Đã hợp nhất cụm";
            statusBadgeClass = "atomic";
          }
        } else if (node.is_atomic) {
          statusBadgeText = "✅ Tối giản (Làm ngay)";
          statusBadgeClass = "atomic";
        } else if (node.status === "in_progress") {
          statusBadgeText = "⏳ Đang phân rã";
          statusBadgeClass = "in_progress";
        } else if (node.status === "completed") {
          statusBadgeText = "🔹 Đã chia nhánh";
          statusBadgeClass = "completed";
        }

        const skipBtnHtml = (isSynth && (node.status === "waiting_children" || node.status === "pending"))
          ? `<button class="btn-node-skip" data-node-id="${node.id}" title="Bỏ qua bước hợp nhất cụm này">Bỏ qua</button>`
          : '';

        const atomicBtnHtml = (!isSynth && node.status === "pending" && !node.is_atomic)
          ? `<button class="btn-node-atomic" data-node-id="${node.id}" title="Chốt việc này làm ngay, không phân rã thêm">✓ Chốt</button>`
          : '';

        const levelBadgeText = isSynth ? '🔄 Hợp nhất' : `Tầng ${node.level}`;

        let typeBadgeHtml = "";
        let depsBadgeHtml = "";
        if (!isSynth) {
          if (node.task_type === "artifact") {
            const target = node.target_artifact ? escapeHtml(node.target_artifact) : "Sản phẩm file";
            typeBadgeHtml = `<span class="node-type-badge artifact" title="Sản phẩm đầu ra: ${target}">📁 ${target}</span>`;
          } else {
            typeBadgeHtml = `<span class="node-type-badge action" title="Hành động / Tra cứu / Thực thi quy trình">🔍 Hành động</span>`;
          }
          if (node.depends_on && node.depends_on.length > 0) {
            depsBadgeHtml = `<span class="node-type-badge dep" title="Phụ thuộc vào: ${escapeHtml(node.depends_on.join(', '))}">🔗 Phụ thuộc: ${escapeHtml(node.depends_on.join(', '))}</span>`;
          }
        }

        item.innerHTML = `
          <div class="node-header">
            <div class="node-title-group">
              <span class="node-level-badge">${levelBadgeText}</span>
              ${typeBadgeHtml}
              ${depsBadgeHtml}
              <span class="node-title-text" title="${escapeHtml(node.title)}">${escapeHtml(node.title)}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
              <span class="node-status-badge ${statusBadgeClass}">${statusBadgeText}</span>
              ${atomicBtnHtml}
              ${skipBtnHtml}
            </div>
          </div>
          ${node.description ? `<div class="node-description">${escapeHtml(node.description)}</div>` : ''}
          ${node.contract ? `<div class="node-contract" style="font-size: 11px; color: #f9e2af; margin-top: 4px; padding: 2px 6px; background: rgba(249, 226, 175, 0.08); border-radius: 4px; border-left: 2px solid #f9e2af;">📋 <strong>Tiêu chuẩn:</strong> ${escapeHtml(node.contract)}</div>` : ''}
          <div class="node-meta">
            ${node.summary ? `<span>💡 ${escapeHtml(node.summary)}</span>` : ''}
            ${node.conversation_id ? `<span class="node-conv-id" title="Conversation ID">Conv: ${escapeHtml(node.conversation_id.substring(0, 8))}...</span>` : ''}
          </div>
        `;

        const atomicBtn = item.querySelector(".btn-node-atomic");
        if (atomicBtn) {
          atomicBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            postToPython({ action: "mark_deep_think_atomic", node_id: node.id });
          });
        }

        const skipBtn = item.querySelector(".btn-node-skip");
        if (skipBtn) {
          skipBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            postToPython({ action: "skip_deep_think_node", node_id: node.id });
          });
        }

        return item;
      }

      function renderBranch(nodeId) {
        const n = nodes[nodeId];
        if (!n) return;
        if (n.id !== "root") {
          deepThinkTreeEl.appendChild(buildNodeCard(n));
        }
        if (n.children && n.children.length > 0) {
          for (const cid of n.children) {
            renderBranch(cid);
          }
        }
      }

      for (const cid of root.children) {
        renderBranch(cid);
      }
    }

    updateSendButtonState();
  }

  if (btnDeepThinkEl) {
    btnDeepThinkEl.addEventListener("click", () => {
      closeMoreActionsMenu();
      if (isGenerating && !isDeepThinkRunning) {
        showToast("Đang có tác vụ khác chạy, vui lòng chờ hoặc bấm DỪNG.");
        return;
      }

      const text = promptInputEl.value.trim();
      if (text) {
        appendUserMessage(`🧠 [Deep Think 5 Level] ${text}`, currentAttachments);
        resetInputBox();
        currentAttachments = [];
        updateAttachmentsStrip();

        isGenerating = true;
        isDeepThinkRunning = true;
        updateSendButtonState();
        setStatus("busy", "🧠 Deep Think: Đang khởi tạo kế hoạch 5 tầng...");
        getOrCreateAssistantCard();

        const chkSynthesisEl = document.getElementById("chk-enable-synthesis");
        const enableSynthesis = chkSynthesisEl ? chkSynthesisEl.checked : true;
        const selMaxLevelsEl = document.getElementById("sel-max-levels");
        const maxLevels = selMaxLevelsEl ? parseInt(selMaxLevelsEl.value, 10) : 5;

        postToPython({
          action: "start_deep_think",
          prompt: text,
          enable_synthesis: enableSynthesis,
          max_levels: maxLevels
        });

        openDeepThinkModal();
      } else {
        openDeepThinkModal();
        postToPython({ action: "get_deep_think_state" });
      }
    });
  }

  if (btnDeepThinkTreeEl) {
    btnDeepThinkTreeEl.addEventListener("click", () => {
      openDeepThinkModal();
      postToPython({ action: "get_deep_think_state" });
    });
  }

  if (btnCloseDeepThinkEl) {
    btnCloseDeepThinkEl.addEventListener("click", closeDeepThinkModal);
  }

  if (btnResetDeepThinkEl) {
    btnResetDeepThinkEl.addEventListener("click", () => {
      if (isDeepThinkRunning) {
        if (!confirm("Tiến trình Deep Think đang chạy. Bạn có chắc muốn dừng và làm mới không?")) {
          return;
        }
      }
      postToPython({ action: "reset_deep_think" });
    });
  }

  if (btnOpenPlanMdEl) {
    btnOpenPlanMdEl.addEventListener("click", () => {
      if (deepThinkState && deepThinkState.plan_md_path) {
        postToPython({
          action: "open_file",
          path: deepThinkState.plan_md_path
        });
      } else {
        showToast("Chưa có tệp Markdown nào được tạo.");
      }
    });
  }

  if (btnPauseDeepThinkEl) {
    btnPauseDeepThinkEl.addEventListener("click", () => {
      if (!deepThinkState) return;
      if (deepThinkState.is_paused) {
        postToPython({ action: "resume_deep_think" });
        showToast("Đã tiếp tục tiến trình Deep Think.");
      } else {
        postToPython({ action: "pause_deep_think" });
        showToast("Đã tạm dừng tiến trình Deep Think.");
      }
    });
  }

  if (btnStopDeepThinkEl) {
    btnStopDeepThinkEl.addEventListener("click", () => {
      postToPython({ action: "stop_deep_think" });
      showToast("Đã gửi lệnh dừng tiến trình Deep Think.");
    });
  }

  // File Picker Input
  filePickerEl.addEventListener("change", function(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      reader.onload = function(evt) {
        postToPython({
          action: "save_dropped_file",
          name: file.name,
          data: evt.target.result
        });
      };
      reader.readAsDataURL(file);
    }
    filePickerEl.value = "";
  });

  // Paste Event: Clipboard Images
  window.addEventListener("paste", function(e) {
    const clipboardData = e.clipboardData || window.clipboardData;
    let foundImage = false;

    if (clipboardData && clipboardData.items) {
      for (let i = 0; i < clipboardData.items.length; i++) {
        const item = clipboardData.items[i];
        if (item.type && item.type.indexOf("image") !== -1) {
          foundImage = true;
          e.preventDefault();
          const blob = item.getAsFile();
          const reader = new FileReader();
          reader.onload = function(evt) {
            postToPython({
              action: "save_clipboard_image",
              data: evt.target.result
            });
          };
          reader.readAsDataURL(blob);
          break;
        }
      }
    }

    if (!foundImage) {
      postToPython({
        action: "paste_clipboard"
      });
    }
  });

  // Drag and Drop Events
  window.addEventListener("dragenter", function(e) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter++;
    dragOverlayEl.classList.remove("hidden");
  });

  window.addEventListener("dragover", function(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
  });

  window.addEventListener("dragleave", function(e) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      dragOverlayEl.classList.add("hidden");
    }
  });

  window.addEventListener("drop", function(e) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter = 0;
    dragOverlayEl.classList.add("hidden");

    const uriList = e.dataTransfer.getData("text/uri-list");
    if (uriList) {
      const uris = uriList.split("\n");
      uris.forEach(uri => {
        uri = uri.trim();
        if (uri.startsWith("file://")) {
          const filePath = decodeURIComponent(uri.replace("file://", ""));
          postToPython({
            action: "register_existing_file",
            path: filePath
          });
        }
      });
      return;
    }

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const reader = new FileReader();
        reader.onload = function(evt) {
          postToPython({
            action: "save_dropped_file",
            name: file.name,
            data: evt.target.result
          });
        };
        reader.readAsDataURL(file);
      }
    }
  });

  // Incoming Messages from Python (window.onBridgeMessage)
  window.onBridgeMessage = function(msg) {
    if (!msg) return;

    const type = msg.type;

    if (type === "native_drag_enter") {
      dragOverlayEl.classList.remove("hidden");
    }

    else if (type === "native_drag_leave") {
      dragCounter = 0;
      dragOverlayEl.classList.add("hidden");
    }

    else if (type === "quota_update") {
      updateQuotaUI(msg);
    }

    else if (type === "accounts_update") {
      updateAccountsUI(msg);
    }

    else if (type === "account_switched") {
      showToast(`Đã chuyển sang tài khoản: ${msg.email}`);
    }

    else if (type === "account_saved") {
      showToast(msg.message || "Đã lưu snapshot tài khoản hiện tại vào danh sách.");
    }

    else if (type === "account_removed") {
      showToast(msg.message || `Đã xóa tài khoản: ${msg.email}`);
    }

    else if (type === "account_add_started") {
      showToast(msg.message || "Đang mở trình duyệt để đăng nhập Google...", 6000);
    }

    else if (type === "account_added") {
      closeAccountModal();
      showToast(msg.message || `Đã thêm tài khoản mới ${msg.email} thành công!`, 5000);
    }

    else if (type === "account_add_cancelled") {
      closeAccountModal();
      showToast(msg.message || "Đã hủy tiến trình đăng nhập tài khoản mới.", 4000);
    }

    else if (type === "init_info") {
      currentWorkspace = msg.cwd;
      workspaceNameEl.textContent = msg.dir_name;
      workspaceNameEl.parentElement.title = msg.cwd;
      activeConvId = msg.active_conv_id;
      if (activeConvId) {
        convIdEl.textContent = activeConvId.substring(0, 8) + "...";
        convIdEl.title = activeConvId;
      }
      if (typeof msg.is_pinned !== "undefined") {
        updatePinUI(msg.is_pinned);
      }
      setStatus("ready", "Sẵn sàng");
    }

    else if (type === "pin_state") {
      updatePinUI(msg.is_pinned, true);
    }

    else if (type === "conversations_data") {
      activeConvId = msg.active_conv_id;
      renderConversationsData(msg);
    }

    else if (type === "folder_conversations_result") {
      handleFolderConversationsResult(msg);
    }

    else if (type === "conversations_list") {
      activeConvId = msg.active_conv_id;
      renderConversationList(msg.items || [], msg.current_workspace);
    }

    else if (type === "conversation_loaded") {
      activeConvId = msg.id;
      convIdEl.textContent = activeConvId ? activeConvId.substring(0, 8) + "..." : "Sẵn sàng";
      convIdEl.title = activeConvId || "";

      // Clear existing messages
      messagesListEl.innerHTML = "";

      const historyMsgs = msg.messages || [];
      if (historyMsgs.length === 0) {
        if (welcomeHeroEl) {
          messagesListEl.appendChild(welcomeHeroEl);
          welcomeHeroEl.style.display = "flex";
        }
      } else {
        historyMsgs.forEach(m => {
          if (m.role === "user") {
            appendUserMessage(m.content, []);
          } else if (m.role === "assistant") {
            appendAssistantHistory(m.content, m.thinking, m.tool_calls);
          }
        });
      }

      closeSidebar();
      showToast("Đã nạp lịch sử cuộc hội thoại.");
      scrollToBottom();
    }

    else if (type === "new_window_opened") {
      closeSidebar();
      showToast(`Đã mở cửa sổ mới tại: ${msg.workspace_name || msg.workspace}`);
    }

    else if (type === "new_chat_started") {
      if (freeToGoTimer) {
        clearTimeout(freeToGoTimer);
        freeToGoTimer = null;
      }
      isFreeToGo = false;
      if (btnFreeToGoEl) {
        btnFreeToGoEl.classList.remove("active");
      }
      if (btnActionEl) {
        btnActionEl.classList.remove("free-to-go");
        if (btnActionLabelEl) btnActionLabelEl.textContent = "⚡ ACTION";
        if (actionModeBadgeEl) actionModeBadgeEl.classList.add("hidden");
      }
      activeConvId = null;
      convIdEl.textContent = "Phiên mới";
      convIdEl.title = "";
      messagesListEl.innerHTML = "";
      if (welcomeHeroEl) {
        messagesListEl.appendChild(welcomeHeroEl);
        welcomeHeroEl.style.display = "flex";
      }
      closeSidebar();
      showToast("Đã khởi tạo phiên làm việc mới.");
    }

    else if (type === "clipboard_saved") {
      currentAttachments.push({
        name: msg.name,
        path: msg.path,
        abs_path: msg.abs_path,
        file_url: msg.file_url,
        is_image: true
      });
      updateAttachmentsStrip();
    }

    else if (type === "dropped_file_saved" || type === "file_registered") {
      currentAttachments.push({
        name: msg.name,
        path: msg.path,
        abs_path: msg.abs_path,
        file_url: msg.file_url,
        is_image: msg.is_image || false
      });
      updateAttachmentsStrip();
    }

    else if (type === "thinking_update") {
      const thinking = msg.thinking;
      if (thinking && thinking.trim()) {
        const trimmedThinking = thinking.trim();
        if (currentAssistantCard) {
          currentThinkingText = trimmedThinking;
          const thinkingBox = currentAssistantCard.querySelector("#active-thinking-box");
          if (thinkingBox) {
            thinkingBox.classList.remove("hidden");
          }
          const thinkingContent = currentAssistantCard.querySelector("#active-thinking-content");
          if (thinkingContent) {
            thinkingContent.textContent = currentThinkingText;
          }
        } else {
          // If response has already finalized, update the last assistant card without creating a new active card
          const lastAssistantCard = messagesListEl.querySelector(".message-bubble.assistant:last-child .assistant-card");
          if (lastAssistantCard) {
            let thinkingContent = lastAssistantCard.querySelector(".thinking-content");
            if (thinkingContent) {
              thinkingContent.textContent = trimmedThinking;
            } else {
              const thinkingBox = document.createElement("div");
              thinkingBox.className = "thinking-box";

              const thinkingHeader = document.createElement("div");
              thinkingHeader.className = "thinking-header";
              thinkingHeader.innerHTML = `
                <div class="thinking-header-left">
                  <span>🧠</span>
                  <span class="thinking-title">Tiến trình suy nghĩ</span>
                </div>
                <span class="thinking-toggle-icon">▶</span>
              `;

              const contentDiv = document.createElement("div");
              contentDiv.className = "thinking-content";
              contentDiv.style.display = "none";
              contentDiv.textContent = trimmedThinking;

              thinkingHeader.onclick = () => {
                const isCollapsed = contentDiv.style.display === "none";
                contentDiv.style.display = isCollapsed ? "block" : "none";
                thinkingHeader.querySelector(".thinking-toggle-icon").textContent = isCollapsed ? "▼" : "▶";
              };

              thinkingBox.appendChild(thinkingHeader);
              thinkingBox.appendChild(contentDiv);
              lastAssistantCard.insertBefore(thinkingBox, lastAssistantCard.firstChild);
            }
          }
        }
      }
    }

    else if (type === "agy_event") {
      const payload = msg.payload;
      const eventName = payload.event;

      if (eventName === "init") {
        activeConvId = payload.conversation_id;
        convIdEl.textContent = activeConvId ? activeConvId.substring(0, 8) + "..." : "Sẵn sàng";
        convIdEl.title = activeConvId || "";
        setStatus("ready", "Sẵn sàng");
      }

      else if (eventName === "step_update") {
        const step = payload.step_update;
        if (!step) return;

        const stepType = step.step_type;

        if (stepType === "agent_response") {
          const card = getOrCreateAssistantCard();
          setStatus("busy", "Đang trả lời...");

          if (step.text_delta) {
            currentAssistantText += step.text_delta;
            const body = card.querySelector("#active-assistant-body");
            if (body) {
              body.innerHTML = renderMarkdown(currentAssistantText);
            }
            scrollToBottom();
          }

          if (step.usage && step.usage.thinking_tokens) {
            const thinkingBox = card.querySelector("#active-thinking-box");
            if (thinkingBox) {
              thinkingBox.classList.remove("hidden");
              const title = thinkingBox.querySelector(".thinking-title");
              if (title) {
                title.textContent = `Tiến trình suy nghĩ (${step.usage.thinking_tokens} tokens)`;
              }
            }
          }
        }

        else if (stepType && stepType !== "user_input") {
          const card = getOrCreateAssistantCard();
          const toolName = step.tool_name || (step.tool_info && step.tool_info.name) || stepType;
          const toolParams = (step.tool_info && step.tool_info.parameters) || {};
          const targetPath = toolParams.Path || toolParams.path || toolParams.file_path || "";

          setStatus("busy", `Đang thực thi: ${toolName}...`);

          const toolsBox = card.querySelector("#active-tools-box");
          const toolsContent = card.querySelector("#active-tools-content");
          const toolsTitle = card.querySelector("#active-tools-header .tools-title");
          if (toolsBox && toolsContent) {
            toolsBox.classList.remove("hidden");

            let toolCard = toolsContent.querySelector(`[data-step-index="${step.step_index}"]`);
            if (!toolCard) {
              toolCard = document.createElement("div");
              toolCard.className = "tool-card";
              toolCard.dataset.stepIndex = step.step_index;
              toolCard.innerHTML = `
                <div class="tool-header">
                  <span>⚡</span>
                  <span class="tool-name">${escapeHtml(toolName)}</span>
                  <span class="tool-status">${escapeHtml(step.state || "RUNNING")}</span>
                </div>
              `;
              toolsContent.appendChild(toolCard);
            } else {
              const statusEl = toolCard.querySelector(".tool-status");
              if (statusEl) {
                statusEl.textContent = step.state || "DONE";
              }
            }

            // Real-time Tool Guardrail check on file modifying tools
            if (!isFreeToGo && activeApprovedPlan && (toolName === "write_file" || toolName === "edit_file") && targetPath) {
              if (!isPathApproved(targetPath, activeApprovedPlan)) {
                toolCard.classList.add("tool-unapproved");
                if (!toolCard.querySelector(".tool-badge-unapproved")) {
                  const header = toolCard.querySelector(".tool-header");
                  if (header) {
                    const badge = document.createElement("span");
                    badge.className = "tool-badge-unapproved";
                    badge.textContent = "Ngoài kế hoạch";
                    header.appendChild(badge);
                  }
                }
                if (!pendingViolation || pendingViolation.targetPath !== targetPath) {
                  showGuardrailViolation(toolName, targetPath);
                }
              }
            }

            const count = toolsContent.querySelectorAll(".tool-card").length;
            if (toolsTitle) {
              toolsTitle.textContent = `Thực thi (${count} hành động)`;
            }

            scrollToBottom();
          }
        }
      }

      else if (eventName === "result") {
        finalizeAssistantMessage();
      }
    }

    else if (type === "process_stopped") {
      finalizeAssistantMessage();
      isGenerating = false;
      updateSendButtonState();
      setStatus("ready", "Sẵn sàng");
    }

    else if (type === "agy_crashed") {
      const card = getOrCreateAssistantCard();
      const crashMsg = msg.message || `Tiến trình bị lỗi (${msg.error || "không rõ nguyên nhân"}) nên dừng lại.`;
      const crashNotice = `\n\n> ⚠️ **Sự cố tiến trình:** ${crashMsg}\n> \n> *Hệ thống đã thu dọn an toàn. Bạn có thể gửi tiếp yêu cầu để khởi động lại lượt mới.*`;

      currentAssistantText += crashNotice;
      const body = card.querySelector("#active-assistant-body");
      if (body) {
        body.innerHTML = renderMarkdown(currentAssistantText);
      }
      scrollToBottom();
      finalizeAssistantMessage();
      isGenerating = false;
      updateSendButtonState();
      setStatus("ready", "Sẵn sàng");
      showToast(`⚠️ ${crashMsg}`);
    }

    else if (type === "rollback_result") {
      if (msg.success) {
        showToast(`⏪ ${msg.message}`);
        setStatus("ready", "Đã hoàn tác");
      } else {
        showToast(`⚠️ ${msg.message}`);
      }
    }

    else if (type === "processes_update") {
      renderProcessesList(msg.processes || []);
    }

    else if (type === "deep_think_started") {
      isDeepThinkRunning = true;
      renderDeepThinkTree(msg.state);
      showToast("🧠 Bắt đầu phân rã Deep Think 5 Level...");
    }

    else if (type === "deep_think_update") {
      renderDeepThinkTree(msg.state);
      if (msg.message) {
        showToast(`🧠 [Deep Think] ${msg.message}`);
      }
    }

    else if (type === "deep_think_step_starting") {
      if (msg.node) {
        setStatus("busy", `🧠 Deep Think [Tầng ${msg.node.level}]: ${msg.node.title}`);
      }
      if (msg.message) {
        showToast(msg.message);
      }
    }

    else if (type === "deep_think_completed") {
      isDeepThinkRunning = false;
      renderDeepThinkTree(msg.state);
      finalizeAssistantMessage();
      showToast("🎉 [Deep Think] Đã hoàn tất phân rã toàn bộ cây 5 tầng!");
      setStatus("ready", "Deep Think hoàn tất");
    }

    else if (type === "deep_think_stopped") {
      isDeepThinkRunning = false;
      renderDeepThinkTree(msg.state);
      finalizeAssistantMessage();
      showToast("⏹ Đã dừng tiến trình Deep Think.");
      setStatus("ready", "Sẵn sàng");
    }

    else if (type === "deep_think_reset") {
      isDeepThinkRunning = false;
      renderDeepThinkTree(msg.state);
      showToast("🗑 Đã làm mới phiên Deep Think.");
      setStatus("ready", "Sẵn sàng");
    }

    else if (type === "toast") {
      showToast(msg.message || "");
    }

    else if (type === "focus_input") {
      if (guardrailModalEl && !guardrailModalEl.classList.contains("hidden")) {
        if (btnGuardrailAllowEl) btnGuardrailAllowEl.focus();
      } else if (promptInputEl) {
        promptInputEl.focus();
      }
    }

    else if (type === "agy_stderr" || type === "error") {
      console.warn("[AGY Notice]", msg.text || msg.message);
      if (type === "error") {
        finalizeAssistantMessage();
        isGenerating = false;
        updateSendButtonState();
        setStatus("ready", "Sẵn sàng");
        showToast(msg.message || "Đã xảy ra lỗi tiến trình.");
      }
    }
  };

  // File Link Interactions & Context Menu
  function hideFileContextMenu() {
    if (fileContextMenuEl) {
      fileContextMenuEl.classList.add("hidden");
      activeContextMenuPath = null;
    }
  }

  // Left click on file/folder link -> Open directly
  // Left click on web link -> Open with external browser via Python
  document.addEventListener("click", function(e) {
    const fileLink = e.target.closest(".file-link");
    if (fileLink) {
      const filePath = fileLink.dataset.filepath;
      const isFolder = fileLink.dataset.isFolder === "true";
      if (filePath) {
        postToPython({
          action: isFolder ? "open_folder" : "open_file",
          path: filePath
        });
      }
      return;
    }

    const webLink = e.target.closest("a");
    if (webLink && webLink.href) {
      const href = webLink.getAttribute("href") || webLink.href;
      if (/^(https?:\/\/|mailto:)/i.test(href)) {
        e.preventDefault();
        e.stopPropagation();
        postToPython({
          action: "open_url",
          url: href
        });
        return;
      }
    }

    hideFileContextMenu();
  });

  // Clear dock urgency when window is focused
  window.addEventListener("focus", function() {
    postToPython({ action: "clear_urgency" });
  });

  // Right click on file link -> Show custom context menu
  document.addEventListener("contextmenu", function(e) {
    const fileLink = e.target.closest(".file-link");
    if (fileLink) {
      e.preventDefault();
      activeContextMenuPath = fileLink.dataset.filepath;
      if (!activeContextMenuPath) return;

      fileContextMenuEl.classList.remove("hidden");

      const menuWidth = 200;
      const menuHeight = 130;
      let x = e.clientX;
      let y = e.clientY;

      if (x + menuWidth > window.innerWidth) {
        x = window.innerWidth - menuWidth - 10;
      }
      if (y + menuHeight > window.innerHeight) {
        y = window.innerHeight - menuHeight - 10;
      }

      fileContextMenuEl.style.left = `${Math.max(10, x)}px`;
      fileContextMenuEl.style.top = `${Math.max(10, y)}px`;
    } else {
      hideFileContextMenu();
    }
  });

  window.addEventListener("keydown", function(e) {
    if (e.key === "Escape") {
      hideFileContextMenu();
      toggleAccountDropdown(false);
    }
  });

  if (ctxOpenFileEl) {
    ctxOpenFileEl.addEventListener("click", function() {
      if (activeContextMenuPath) {
        postToPython({
          action: "open_file",
          path: activeContextMenuPath
        });
      }
      hideFileContextMenu();
    });
  }

  if (ctxOpenFolderEl) {
    ctxOpenFolderEl.addEventListener("click", function() {
      if (activeContextMenuPath) {
        postToPython({
          action: "open_folder",
          path: activeContextMenuPath
        });
      }
      hideFileContextMenu();
    });
  }

  if (ctxCopyPathEl) {
    ctxCopyPathEl.addEventListener("click", function() {
      if (activeContextMenuPath) {
        navigator.clipboard.writeText(activeContextMenuPath).then(() => {
          showToast("Đã sao chép đường dẫn tệp!");
        });
      }
      hideFileContextMenu();
    });
  }

  // Signal UI Ready to Python & Initialize Running Lights
  initRunningLights();
  window.addEventListener("DOMContentLoaded", function() {
    initRunningLights();
    updateSendButtonState();
    postToPython({ action: "ui_ready" });
  });

})();
