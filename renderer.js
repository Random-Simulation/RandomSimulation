/* eslint-env browser, es2021 */

window.addEventListener('DOMContentLoaded', () => {
  /* ───────────────────────────────────────────────────────────────
   * DOM REFERENCES
   * ─────────────────────────────────────────────────────────────── */
  const promptWrap  = document.querySelector('.prompt-wrap');
  const promptBox   = document.getElementById('prompt');
  const promptWait  = document.getElementById('prompt-wait');
  const randomBtn   = document.getElementById('random');
  const stopBtn     = document.getElementById('stop');
  const clearBtn    = document.getElementById('clear-all');
  const iframe      = document.getElementById('sim-frame');
  const chatOutput  = document.getElementById('chat-output');

  // The actual scroll container inside the wrapper
  const scroller    = document.getElementById('chat-scroll');
  const outputWrap  = document.getElementById('chat-output-wrapper'); // wrapper (non-scrolling), kept for completeness

  // Copy buttons
  const copyTopBtn    = document.getElementById('copy-top');
  const copyBottomBtn = document.getElementById('copy-bottom');

  // Parameters UI
  const paramsRoot  = document.getElementById('params');
  const paramsBtn   = document.getElementById('params-btn');
  const paramsPanel = document.getElementById('params-panel');
  const paramsClose = document.getElementById('params-close');
  const paramsApply = document.getElementById('params-apply');

  const rTemp    = document.getElementById('p-temperature');
  const rTopP    = document.getElementById('p-top_p');
  const rTopK    = document.getElementById('p-top_k');
  const rMinP    = document.getElementById('p-min_p');
  const rRepeat  = document.getElementById('p-repeat_penalty');
  const rCtx     = document.getElementById('p-num_ctx');
  const nMaxTok  = document.getElementById('p-max_tokens');

  const vTemp    = document.getElementById('v-temperature');
  const vTopP    = document.getElementById('v-top_p');
  const vTopK    = document.getElementById('v-top_k');
  const vMinP    = document.getElementById('v-min_p');
  const vRepeat  = document.getElementById('v-repeat_penalty');
  const vCtx     = document.getElementById('v-num_ctx');

  // Model picker
  const modelPicker = document.getElementById('model-picker');
  const modelBtn    = document.getElementById('model-button');
  const modelMenu   = document.getElementById('model-menu');
  const modelLabel  = document.getElementById('model-label');
  const modelSearch = document.getElementById('model-search');
  const modelList   = document.getElementById('model-list');

  // Theme
  const themeBtn = document.getElementById('theme-btn');
  const rootEl   = document.documentElement;

  promptBox?.focus();

  /* ───────────────────────────────────────────────────────────────
   * THEME
   * ─────────────────────────────────────────────────────────────── */
  const THEMES = ['light', 'dark', 'pastel'];

  (function ensureThemeBoots() {
    const boot = rootEl.getAttribute('data-theme');
    if (!boot || !THEMES.includes(boot)) rootEl.setAttribute('data-theme', 'light');
  })();

  function setTheme(next) {
    rootEl.setAttribute('data-theme', next);
    try { localStorage.setItem('les.theme', next); } catch {}
    if (iframe?.contentDocument && window.injectIframeStyles) {
      window.injectIframeStyles(iframe.contentDocument, next);
    }
  }

  function cycleTheme() {
    const cur  = rootEl.getAttribute('data-theme') || 'light';
    const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
    setTheme(next);
    console.log(`Theme changed to: ${next}`);
  }

  themeBtn?.addEventListener('click', cycleTheme);

  /* ───────────────────────────────────────────────────────────────
   * MODEL SELECTION
   * ─────────────────────────────────────────────────────────────── */
  let selectedModel = null;
  const savedModel = (() => {
    try { return localStorage.getItem('les.model') || null; } catch { return null; }
  })();
  if (savedModel) selectedModel = savedModel;
  if (modelLabel) modelLabel.textContent = selectedModel || 'Pick a model…';

  /** @type {{name:string,fam?:string,p?:string,q?:string}[]} */
  let allModels = [];

  async function fetchModelsFromOllama() {
    try {
      const res = await fetch('http://localhost:11434/api/tags', { method: 'GET' });
      if (!res.ok) throw new Error(`GET /api/tags failed (${res.status})`);
      const data = await res.json();
      const models = (data.models || []).map(m => ({
        name: m.name,
        fam : m.details?.family,
        p   : m.details?.parameter_size,
        q   : m.details?.quantization_level
      }));
      models.sort((a, b) => a.name.localeCompare(b.name));
      return models;
    } catch (e) {
      console.warn('Could not enumerate models via /api/tags:', e);
      return [];
    }
  }

  async function listResidentModelNames() {
    try {
      const res = await fetch('http://localhost:11434/api/ps', { method: 'GET' });
      if (!res.ok) return [];
      const j = await res.json();
      return Array.isArray(j.models) ? j.models.map(m => m.name) : [];
    } catch {
      return [];
    }
  }

  function chooseDefaultModel(models) {
    const prefer = models.find(m => /instruct|chat|assistant/i.test(m.name));
    return (prefer || models[0]).name;
  }

  function renderModelMenu(filter = '') {
    if (!modelList) return;
    const f = filter.toLowerCase();
    modelList.innerHTML = '';

    const items = allModels.filter(m => m.name.toLowerCase().includes(f));
    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'model-item';
      empty.textContent = 'No models found';
      empty.style.cursor = 'default';
      modelList.appendChild(empty);
      return;
    }

    for (const m of items) {
      const el = document.createElement('div');
      el.className = 'model-item';
      el.dataset.name = m.name;
      el.setAttribute('role', 'option');
      el.setAttribute('aria-selected', String(m.name === selectedModel));
      el.innerHTML = `
        <div>${m.name}</div>
        <span class="model-meta">${[m.fam, m.p, m.q].filter(Boolean).join(' · ')}</span>
      `;
      if (m.name === selectedModel) el.classList.add('active');
      el.addEventListener('click', () => selectModel(m.name, /* warm */ true));
      modelList.appendChild(el);
    }
  }

  function selectModel(name, warm = false) {
    selectedModel = name;
    try { localStorage.setItem('les.model', name); } catch {}
    if (modelLabel) modelLabel.textContent = name;

    if (modelList) {
      modelList.querySelectorAll('.model-item').forEach(i => {
        const isActive = i.dataset.name === name;
        i.classList.toggle('active', isActive);
        i.setAttribute('aria-selected', String(isActive));
      });
    }

    if (modelPicker) {
      modelPicker.classList.remove('open');
      modelPicker.setAttribute('aria-expanded', 'false');
    }

    if (warm && selectedModel) warmSelectedModel();
  }

  // Drop-up open/close + outside-click + Escape
  modelBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!modelPicker) return;
    const isOpen = modelPicker.classList.toggle('open');
    modelPicker.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) setTimeout(() => modelSearch?.focus(), 0);
  });
  document.addEventListener('click', (e) => {
    if (!modelPicker) return;
    if (!modelPicker.contains(e.target)) {
      modelPicker.classList.remove('open');
      modelPicker.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modelPicker?.classList.contains('open')) {
      modelPicker.classList.remove('open');
      modelPicker.setAttribute('aria-expanded', 'false');
    }
  });
  modelSearch?.addEventListener('input', (e) => renderModelMenu(e.target.value));

  /* ───────────────────────────────────────────────────────────────
   * GENERATION PARAMETERS (STATE + UI)
   * ─────────────────────────────────────────────────────────────── */
  const DEFAULT_PARAMS = {
    temperature     : 0.7,
    top_p           : 0.8,
    top_k           : 20,
    min_p           : 0.0,
    repeat_penalty  : 1.1,
    num_ctx         : 8192,
    max_tokens      : 2000
  };

  let GEN_PARAMS = (() => {
    try {
      const j = JSON.parse(localStorage.getItem('les.params') || '{}');
      return { ...DEFAULT_PARAMS, ...j };
    } catch { return { ...DEFAULT_PARAMS }; }
  })();

  function saveParams() {
    try { localStorage.setItem('les.params', JSON.stringify(GEN_PARAMS)); } catch {}
  }

  function setParamUIFromState() {
    if (!paramsPanel) return;
    rTemp.value   = String(GEN_PARAMS.temperature);
    rTopP.value   = String(GEN_PARAMS.top_p);
    rTopK.value   = String(GEN_PARAMS.top_k);
    rMinP.value   = String(GEN_PARAMS.min_p);
    rRepeat.value = String(GEN_PARAMS.repeat_penalty);
    rCtx.value    = String(GEN_PARAMS.num_ctx);
    nMaxTok.value = String(GEN_PARAMS.max_tokens);

    vTemp.textContent   = GEN_PARAMS.temperature.toFixed(2);
    vTopP.textContent   = GEN_PARAMS.top_p.toFixed(2);
    vTopK.textContent   = String(GEN_PARAMS.top_k);
    vMinP.textContent   = GEN_PARAMS.min_p.toFixed(2);
    vRepeat.textContent = GEN_PARAMS.repeat_penalty.toFixed(2);
    vCtx.textContent    = String(GEN_PARAMS.num_ctx);
  }

  function wireParamLiveOutputs() {
    const upd = () => {
      vTemp.textContent   = Number(rTemp.value).toFixed(2);
      vTopP.textContent   = Number(rTopP.value).toFixed(2);
      vTopK.textContent   = String(Math.round(Number(rTopK.value)));
      vMinP.textContent   = Number(rMinP.value).toFixed(2);
      vRepeat.textContent = Number(rRepeat.value).toFixed(2);
      vCtx.textContent    = String(Math.round(Number(rCtx.value)));
    };
    [rTemp, rTopP, rTopK, rMinP, rRepeat, rCtx].forEach(el => {
      el.addEventListener('input', upd);
    });
  }
  wireParamLiveOutputs();
  setParamUIFromState();

  // Parameters panel open/close
  paramsBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    paramsRoot?.classList.toggle('open');
    setParamUIFromState();
  });
  paramsClose?.addEventListener('click', () => paramsRoot?.classList.remove('open'));
  document.addEventListener('click', (e) => {
    if (!paramsRoot) return;
    if (!paramsRoot.contains(e.target)) paramsRoot.classList.remove('open');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') paramsRoot?.classList.remove('open');
  });

  /* ───────────────────────────────────────────────────────────────
   * MODEL RESIDENCY / WARM & OPTIONS RELOAD
   * ─────────────────────────────────────────────────────────────── */
  async function isModelResident(name) {
    try {
      const res = await fetch('http://localhost:11434/api/ps', { method: 'GET' });
      if (!res.ok) return false;
      const j = await res.json();
      const list = Array.isArray(j.models) ? j.models : [];
      return list.some(m => m.name === name);
    } catch {
      return false;
    }
  }

  // Useful for diagnostics; not actively used elsewhere.
  async function waitForModelPresence(name, shouldBePresent, { timeout = 20000, interval = 250 } = {}) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const present = await isModelResident(name);
      if (present === shouldBePresent) return true;
      await new Promise(r => setTimeout(r, interval));
    }
    return false;
  }

  let reloadInFlight = null;     // Guard: single concurrent options-apply
  let lastOptionsAppliedAt = 0;  // Debounce warm immediately after options pin

  // Apply params; if context changed, re-pin (without unloading).
  paramsApply?.addEventListener('click', async () => {
    const prevCtx = GEN_PARAMS.num_ctx;

    GEN_PARAMS = {
      temperature    : Number(rTemp.value),
      top_p          : Number(rTopP.value),
      top_k          : Number(rTopK.value),
      min_p          : Number(rMinP.value),
      repeat_penalty : Number(rRepeat.value),
      num_ctx        : Math.max(512, Math.round(Number(rCtx.value))),
      max_tokens     : Math.max(16, Math.round(Number(nMaxTok.value)))
    };
    saveParams();
    paramsRoot?.classList.remove('open');

    // Prevent double-click spam
    if (paramsApply) paramsApply.disabled = true;

    try {
      if (GEN_PARAMS.num_ctx !== prevCtx && selectedModel) {
        if (!reloadInFlight) reloadInFlight = reloadModelWithOptions().finally(() => (reloadInFlight = null));
        await reloadInFlight;
      }
    } finally {
      if (paramsApply) paramsApply.disabled = false;
    }
  });

  // Re-pin (warm) selected model with current options (no flush/unload).
  async function reloadModelWithOptions() {
    const nameSnapshot = selectedModel;
    if (!nameSnapshot) return;
    try {
      console.log('[reload] apply options (no flush) for', nameSnapshot, 'ctx=', GEN_PARAMS.num_ctx);
      await fetch('http://localhost:11434/api/generate', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          model     : nameSnapshot,
          prompt    : 'ping',
          stream    : false,
          keep_alive: '30m',
          options   : {
            num_ctx       : GEN_PARAMS.num_ctx,
            temperature   : GEN_PARAMS.temperature,
            top_p         : GEN_PARAMS.top_p,
            top_k         : GEN_PARAMS.top_k,
            min_p         : GEN_PARAMS.min_p,
            repeat_penalty: GEN_PARAMS.repeat_penalty,
            num_predict   : 1
          }
        })
      });
      lastOptionsAppliedAt = Date.now();
      console.log('[reload] options applied/pinned for', nameSnapshot);
    } catch (e) {
      console.warn('Failed to apply new options:', e);
    }
  }

  async function warmSelectedModel() {
    if (!selectedModel) return;

    // If an options-apply is running, wait for it and avoid redundant warm.
    if (reloadInFlight) {
      try { await reloadInFlight; } catch {}
      if (Date.now() - lastOptionsAppliedAt < 1000) return;
    }

    const nameSnapshot = selectedModel;
    try {
      await fetch('http://localhost:11434/api/generate', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          model     : nameSnapshot,
          prompt    : 'ping',
          stream    : false,
          keep_alive: '30m',
          options   : {
            num_ctx       : GEN_PARAMS.num_ctx,
            temperature   : GEN_PARAMS.temperature,
            top_p         : GEN_PARAMS.top_p,
            top_k         : GEN_PARAMS.top_k,
            min_p         : GEN_PARAMS.min_p,
            repeat_penalty: GEN_PARAMS.repeat_penalty,
            num_predict   : 1
          }
        })
      });
    } catch {
      /* best-effort warm */
    }
  }

  /* ───────────────────────────────────────────────────────────────
   * BOOTSTRAP: ENUMERATE MODELS & PICK DEFAULT
   * ─────────────────────────────────────────────────────────────── */
  (async () => {
    allModels = await fetchModelsFromOllama();

    // If saved model vanished, clear selection
    if (selectedModel && !allModels.some(m => m.name === selectedModel)) {
      selectedModel = null;
      try { localStorage.removeItem('les.model'); } catch {}
    }

    // Prefer a resident model if nothing selected
    if (!selectedModel) {
      const resident = await listResidentModelNames();
      const pick = resident.find(n => allModels.some(m => m.name === n));
      if (pick) selectedModel = pick;
    }

    // Otherwise pick a reasonable installed default
    if (!selectedModel && allModels.length) {
      selectedModel = chooseDefaultModel(allModels);
    }

    renderModelMenu('');

    if (selectedModel) {
      if (modelLabel) modelLabel.textContent = selectedModel;
      try { localStorage.setItem('les.model', selectedModel); } catch {}
      await warmSelectedModel();
    } else {
      if (modelLabel) modelLabel.textContent = 'No model installed — pick one';
      setTimeout(() => {
        if (modelPicker) {
          modelPicker.classList.add('open');
          modelPicker.setAttribute('aria-expanded', 'true');
        }
        modelSearch?.focus();
        alert(
          'No Ollama models were found on this machine.\n\n' +
          'Install one with:  ollama pull llama3.2\n' +
          '…then come back here and pick it from the list.'
        );
      }, 0);
    }
  })();

  /* ───────────────────────────────────────────────────────────────
   * PROMPT INPUT BEHAVIOR
   * ─────────────────────────────────────────────────────────────── */
  promptBox?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = (promptBox?.value || '').trim();
      if (text) runGeneration(text);
    }
  });

  // Auto-grow textarea up to a fraction of the viewport height
  promptBox?.addEventListener('input', () => {
    if (!promptBox) return;
    promptBox.style.height = 'auto';
    promptBox.style.height = Math.min(promptBox.scrollHeight, window.innerHeight * 0.28) + 'px';
  });

  /* ───────────────────────────────────────────────────────────────
   * INITIAL IFRAME CONTENT
   * ─────────────────────────────────────────────────────────────── */
  let currentCode = '<!DOCTYPE html><html><body></body></html>';
  const renderHTML = (html) => { if (iframe) iframe.srcdoc = html; };
  renderHTML(currentCode);

  /* ───────────────────────────────────────────────────────────────
   * OUTPUT / SCROLL STATE
   * ─────────────────────────────────────────────────────────────── */
  let abortCtrl     = null;
  let generating    = false;

  // Auto-scroll logic: true only when at bottom; cancel on up-scroll.
  let autoScroll    = true;
  let lastScrollTop = 0;

  const isAtBottom = () => {
    if (!scroller) return true;
    return scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
  };

  scroller?.addEventListener('scroll', () => {
    if (!scroller) return;
    const st = scroller.scrollTop;
    const scrolledUp = st < lastScrollTop - 1; // small hysteresis
    if (scrolledUp) {
      autoScroll = false; // cancel as soon as user scrolls up
    } else {
      // Only re-enable when user returns to the very bottom
      autoScroll = isAtBottom();
    }
    lastScrollTop = st;
  });

  // Keep bottom on resize if autoScroll is active
  window.addEventListener('resize', () => {
    if (autoScroll && scroller) scroller.scrollTop = scroller.scrollHeight;
  });

  let highlightTick = false;

  /* ───────────────────────────────────────────────────────────────
   * LIVE PREVIEW (BOOTSTRAP HTML IN IFRAME)
   * ─────────────────────────────────────────────────────────────── */
  const BOOTSTRAP_HTML = `
<!DOCTYPE html><html><head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <style id="les-reset">
    /* Containment: vertical scroll allowed; horizontal overflow hidden */
    html, body {
      margin:0; padding:0;
      min-height:100%;
      height:auto;
      overflow-y:auto;
      overflow-x:hidden !important;
    }
    *, *::before, *::after { box-sizing:border-box; }
    img, canvas, svg, video, iframe { display:block; max-width:100% !important; height:auto; }
    pre, code, kbd, samp, textarea { white-space:pre-wrap; overflow-wrap:anywhere; word-break:break-word; }
    table { display:block; max-width:100%; overflow-x:auto; }
    #live-root { min-height:100dvh; }
  </style>
</head><body>
  <div id="live-root"></div>
  <script>
    const executed = new Set();
    function applyUserDOM(css, html) {
      document.getElementById('live-css').textContent = css;
      const root = document.getElementById('live-root');
      root.innerHTML = html;
      root.querySelectorAll('script').forEach(scr => {
        const key = scr.src || scr.textContent;
        if (executed.has(key)) return;
        executed.add(key);
        const s = document.createElement('script');
        if (scr.src) s.src = scr.src;
        s.textContent = scr.textContent;
        scr.replaceWith(s);
      });
    }
    window.addEventListener('message', ({data}) => {
      const {css, html} = data;
      applyUserDOM(css, html);
    });
  </script>
  <style id="live-css"></style>
</body></html>`.trim();

  /* ───────────────────────────────────────────────────────────────
   * STREAM PATCHER → IFRAME (THROTTLED)
   * ─────────────────────────────────────────────────────────────── */
  const sendPatch = (() => {
    let last = 0;
    const INTERVAL = 200; // ~5 fps
    return (raw) => {
      const now = performance.now();
      if (now - last < INTERVAL) return;
      last = now;

      const css = [...raw.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
        .map((m) => m[1])
        .join('\n');

      let html = '';
      const bodyMatch = raw.match(/<body[^>]*>([\s\S]*)/i);
      if (bodyMatch) html = bodyMatch[1].replace(/<[^>]*$/, '');

      iframe?.contentWindow?.postMessage({ css, html }, '*');
    };
  })();

  /* ───────────────────────────────────────────────────────────────
   * UI HELPERS
   * ─────────────────────────────────────────────────────────────── */
  const showPromptWait = () => { if (promptWait) promptWait.style.display = 'grid'; };
  const hidePromptWait = () => { if (promptWait) promptWait.style.display = 'none'; };

  function lockPrompt() {
    if (!promptBox || !promptWrap) return;
    promptBox.classList.add('locked');
    promptWrap.classList.add('locked');
    promptBox.blur();
  }
  function unlockPrompt() {
    if (!promptBox || !promptWrap) return;
    promptBox.classList.remove('locked');
    promptWrap.classList.remove('locked');
    promptBox.focus();
  }

  function clearScreenAndContext() {
    currentCode = '<!DOCTYPE html><html><body></body></html>';
    renderHTML(currentCode);

    if (chatOutput) chatOutput.textContent = '';
    if (scroller) scroller.scrollTop = 0;

    if (iframe?.contentDocument && window.injectIframeStyles) {
      window.injectIframeStyles(iframe.contentDocument);
    }
  }

  function startUi() {
    generating = true;
    autoScroll = true;
    lastScrollTop = scroller?.scrollTop || 0;
    clearScreenAndContext();
    showPromptWait();
    lockPrompt();
    if (iframe) iframe.srcdoc = BOOTSTRAP_HTML;
  }

  function finishUi() {
    generating = false;
    hidePromptWait();
    if (promptBox) promptBox.placeholder = 'Simulate Anything...';
    unlockPrompt();
    abortCtrl = null;
  }

  /* ───────────────────────────────────────────────────────────────
   * COPY RAW OUTPUT
   * ─────────────────────────────────────────────────────────────── */
  function copyRaw() {
    if (!chatOutput) return;
    const text = chatOutput.textContent || '';
    if (!text.trim()) return;
    navigator.clipboard.writeText(text).catch((err) => alert('Copy failed: ' + err.message));
  }
  copyTopBtn?.addEventListener('click', copyRaw);
  copyBottomBtn?.addEventListener('click', copyRaw);

  /* ───────────────────────────────────────────────────────────────
   * CORE: RUN GENERATION
   * ─────────────────────────────────────────────────────────────── */
  async function runGeneration(userPrompt) {
    if (!userPrompt || generating) return;

    if (!selectedModel) {
      if (modelLabel) modelLabel.textContent = 'Pick a model…';
      if (modelPicker) {
        modelPicker.classList.add('open');
        modelPicker.setAttribute('aria-expanded', 'true');
      }
      modelSearch?.focus();
      alert('Please select an Ollama model first (click the model button).');
      return;
    }

    if (promptBox) {
      promptBox.value = '';
      promptBox.style.height = 'auto';
      promptBox.placeholder = '';
    }

    startUi();
    abortCtrl = new AbortController();

    const fullPrompt = `You are an expert JavaScript simulation engine.
Return a single, fully self-contained HTML document that fulfils the user's instruction.
- Be concise and creative; any JS/CSS allowed.
- Prefer fluid, responsive sizing that fits within the viewport.
- Avoid fixed widths wider than the viewport; use max-width:100% where sensible.
Output ONLY the HTML document. No explanations, no markdown fences.

Instruction:
${userPrompt}`.trim();

    try {
      const response = await fetch('http://localhost:11434/api/generate', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          model : selectedModel,
          prompt: fullPrompt,
          stream: true,
          keep_alive: '30m',
          options: {
            temperature   : GEN_PARAMS.temperature,
            top_p         : GEN_PARAMS.top_p,
            top_k         : GEN_PARAMS.top_k,
            min_p         : GEN_PARAMS.min_p,
            repeat_penalty: GEN_PARAMS.repeat_penalty,
            num_ctx       : GEN_PARAMS.num_ctx,
            num_predict   : GEN_PARAMS.max_tokens
          }
        }),
        signal : abortCtrl.signal
      });

      if (!response.ok || !response.body) {
        throw new Error(`Streaming response not available (status ${response.status})`);
      }

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();

      let rawOutput = '';
      let partial   = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        partial += decoder.decode(value, { stream: true });

        const lines = partial.split('\n');
        partial = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const json  = JSON.parse(line);
            const chunk = json.response ?? '';
            rawOutput  += chunk;

            if (chatOutput) chatOutput.textContent = rawOutput;

            if (!highlightTick) {
              highlightTick = true;
              requestAnimationFrame(() => {
                if (chatOutput) Prism.highlightElement(chatOutput);
                // After highlighting, keep to bottom if autoScroll still enabled
                if (autoScroll && scroller) scroller.scrollTop = scroller.scrollHeight;
                highlightTick = false;
              });
            }

            // While streaming, keep pinned to bottom only if user hasn't cancelled
            if (autoScroll && scroller) {
              scroller.scrollTop = scroller.scrollHeight;
            }

            sendPatch(rawOutput);
          } catch {
            console.warn('Bad JSON chunk:', line);
          }
        }
      }

      const clean     = rawOutput.replace(/<think>[\s\S]*?<\/think>/gi, '');
      const htmlDoc   = clean.match(/<!DOCTYPE html>[\s\S]*?<\/html>/i) ?? clean.match(/<html[\s\S]*?<\/html>/i);
      const finalHtml = htmlDoc ? htmlDoc[0].trim() : '<!DOCTYPE html><html><body><h2>Error: No valid HTML found.</h2></body></html>';

      currentCode = finalHtml;
      renderHTML(currentCode);
    } catch (err) {
      if (err.name !== 'AbortError') alert(err.message);
    } finally {
      finishUi();
    }
  }

  /* ───────────────────────────────────────────────────────────────
   * RANDOM PROMPT GENERATOR
   * ─────────────────────────────────────────────────────────────── */
  function randomSimulationPrompt() {
    const styles = [
      'minimalist black-on-white','neon arcade','pastel paper-cut','retro CRT','blueprint grid',
      'eInk','pixel art','watercolor painting','hand-drawn sketch','isometric 3D','low-poly',
      'vaporwave','cyberpunk neon','steampunk','photorealistic','oil painting','charcoal sketch',
      'pop art','origami paper','chalkboard drawing','1980s synthwave','claymation','digital glitch',
      'futuristic hologram','retro magazine illustration','gothic architecture','neon wireframe',
      'comic book inked','children’s book illustration','cubist','surreal dreamscape','impressionist painting'
    ];

    const types = [
      'website for','game of',"children's game",'simulation of','animation of','educational tool for',
      'interactive story about','puzzle game about','arcade game of','idle game of','VR experience of',
      'data visualisation of','retro-style recreation of','art installation about','AI-generated version of',
      'experimental project on','immersive world of','point-and-click adventure of','minimalist interpretation of'
    ];

    const things = [
      'boids flocking','double pendulum','orbital n-body simulation','L-system tree growth','2D wave interference',
      'cellular automata like Conway’s Game of Life','reaction-diffusion patterns','particle fountain with collisions',
      'Perlin noise terrain','traffic flow simulation','pendulum wave','DLA crystal growth','spring-mass cloth simulation',
      'ants foraging','maze generation and solving','fractal snowflake growth','ecosystem food chain','galaxy formation',
      'lava lamp blobs','solar system with planets and moons','river meandering','forest fire spread','crowd evacuation simulation',
      'weather pattern evolution','city growth over time','genetic algorithm evolving shapes','ocean wave simulation',
      'tsunami propagation','whirlpool dynamics','3D terrain erosion','light ray refraction and reflection','magnetic field lines',
      'jellyfish swimming','school of fish dynamics','cloud formation','rainfall and puddles','volcano eruption',
      'bouncing balls with gravity','sandpile model','butterfly flight paths','lightning strikes','planetary rings',
      'black hole accretion disk','spiral galaxy arms','tornado formation','aurora borealis','fireworks display',
      'bubble rising in water','spider web weaving','crystal lattice growth',
      'meteor shower across a night sky','swarm of fireflies','space debris in low Earth orbit',
      'exploding supernova with expanding shockwave','shimmering underwater caustics',
      'fracturing ice sheet animation','colliding galaxies with star trails',
      'flocking drones over a futuristic city','exploding fireworks in slow motion',
      'swirling ink in water','particles forming and breaking apart letters',
      'dust devil spirals over desert terrain','bioluminescent plankton in waves',
      'butterfly wing scale patterns evolving','fractal coral reef growth',
      'confetti cannon blast with realistic physics','superheated plasma arc simulation',
      'sonic boom shockwave ripple','retro screensaver with bouncing shapes',
      'glass shatter in slow motion','particles forming 3D faces and morphing',
      'swirling particle vortex in space','bubbles merging and splitting underwater',
      'flame particles dancing in the wind','smoke plume with turbulence',
      'microorganisms moving under a microscope','meteor entering atmosphere and burning up',
      'floating dandelion seeds in the wind','magic spell particle burst',
      'water droplets splashing and merging','coloured powder explosion like Holi festival',
      'stardust swirl around a glowing orb','falling cherry blossom petals',
      'laser light show with lens flares','floating lantern festival on a river',
      'glowing runes appearing and fading','comet tail simulation with particles',
      'glitter storm swirling in zero gravity','aurora australis shimmering',
      'ink drop diffusion in milk','time-lapse flower blooming',
      'crashing ocean waves with foam particles','nuclear fission chain reaction visualised',
      'radioactive particle decay animation','micrometeor impacts on a moon surface',
      'animated kaleidoscope pattern','wormhole lensing effect with stars',
      'DNA strand twisting and untwisting','3D cube made of floating particles that disperses',
      'magnet attracting and repelling metal particles','sand dunes shifting in the wind',
      'fractal lightning crawling across a surface','fireflies spelling out words',
      'spinning hyperspace tunnel','sunspot activity animation',
      'gas giant storms like Jupiter’s Great Red Spot','coloured marbles colliding and scattering',
      'chain reaction of falling dominos','popcorn popping in a pan',
      'raindrops racing down a window pane','shooting gallery arcade game',
      'pong game with particle trail effects','breakout game with glowing bricks',
      'asteroids arcade clone with neon particles','snake game with particle trail',
      'space invaders with explosion effects'
    ];

    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    return `make a ${pick(types)} ${pick(things)} in a ${pick(styles)} style`;
  }

  // Random button = clear UI and run a random prompt
  randomBtn?.addEventListener('click', () => {
    if (generating) return;

    if (!selectedModel) {
      if (modelLabel) modelLabel.textContent = 'Pick a model…';
      if (modelPicker) {
        modelPicker.classList.add('open');
        modelPicker.setAttribute('aria-expanded', 'true');
      }
      modelSearch?.focus();
      alert('Please select an Ollama model first (click the model button).');
      return;
    }

    if (promptBox) {
      promptBox.value = '';
      promptBox.style.height = 'auto';
      promptBox.placeholder = '';
    }
    runGeneration(randomSimulationPrompt());
  });

  /* ───────────────────────────────────────────────────────────────
   * STOP / CLEAR
   * ─────────────────────────────────────────────────────────────── */
  stopBtn?.addEventListener('click', () => {
    if (generating && abortCtrl) abortCtrl.abort();
    hidePromptWait();
    if (promptBox) promptBox.placeholder = 'Simulate Anything...';
    unlockPrompt();
  });

  clearBtn?.addEventListener('click', () => {
    if (generating && abortCtrl) abortCtrl.abort();
    clearScreenAndContext();
    hidePromptWait();
    unlockPrompt();
    if (promptBox) {
      promptBox.value = '';
      promptBox.style.height = 'auto';
      promptBox.placeholder = 'Simulate Anything...';
      promptBox.focus();
    }
    autoScroll = true;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  });

  /* ───────────────────────────────────────────────────────────────
   * UTIL
   * ─────────────────────────────────────────────────────────────── */
  function closeModelMenu() {
    if (!modelPicker) return;
    modelPicker.classList.remove('open');
    modelPicker.setAttribute('aria-expanded', 'false');
  }
});
