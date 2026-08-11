// =====================================================================
// globalHeader.js - Header Global Reutilizable MESA DOCK
// =====================================================================
// Uso: <script src="/static/js/globalHeader.js" data-title="Mi Título"></script>
// Incluye: logo MESA, título centrado, selector de idioma (ES/EN/CZ),
// widget de usuario y sistema de traducción multi-idioma.
// Para usarlo SOLO como traductor (sin inyectar header):
//   data-auto-init="false" → luego llamar a GlobalHeader.changeLanguage(lang)

(function () {
  'use strict';

  const HEADER_CONFIG = {
    logoSrc: '/static/images/Logo_EMESA.png',
    logoAlt: 'MESA',
    homeUrl: '/dashboard',
    loginWidgetId: 'loginWidgetContainer'
  };

  // ------------------------------------------------------------------
  // Traducciones multi-idioma
  // ------------------------------------------------------------------
  const SUPPORTED_LANGUAGES = ['es', 'en', 'cs'];
  const LANGUAGE_NAMES = { es: 'Español', en: 'English', cs: 'Čeština' };

  let translations = {};
  let currentLanguage = 'es';

  async function loadTranslations(lang) {
    try {
      const response = await fetch(`/static/translations/${lang}.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      translations[lang] = await response.json();
      return true;
    } catch (e) {
      console.error(`[GlobalHeader] Error cargando traducciones ${lang}:`, e);
      return false;
    }
  }

  function translate(key, lang = null) {
    const target = lang || currentLanguage;
    if (!translations[target]) return key;
    return translations[target][key] || key;
  }

  function translatePage(lang = null) {
    const target = lang || currentLanguage;
    if (!translations[target]) {
      console.warn(`[GlobalHeader] Idioma no cargado: ${target}`);
      return;
    }

    document.querySelectorAll('[data-original-text]').forEach(el => {
      if (el.dataset.noTranslate === 'true') return;
      const text = translate(el.dataset.originalText, target);
      if (el.childNodes.length === 1 && el.childNodes[0].nodeType === Node.TEXT_NODE) {
        el.textContent = text;
      } else {
        for (const node of el.childNodes) {
          if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
            node.textContent = text;
            break;
          }
        }
      }
    });

    document.querySelectorAll('[data-original-placeholder]').forEach(el => {
      if (el.dataset.noTranslate === 'true') return;
      el.placeholder = translate(el.dataset.originalPlaceholder, target);
    });

    document.querySelectorAll('[data-original-title]').forEach(el => {
      if (el.dataset.noTranslate === 'true') return;
      el.title = translate(el.dataset.originalTitle, target);
    });
  }

  async function changeLanguage(lang) {
    if (!SUPPORTED_LANGUAGES.includes(lang)) return false;
    if (!translations[lang]) {
      const ok = await loadTranslations(lang);
      if (!ok) return false;
    }
    currentLanguage = lang;
    localStorage.setItem('appLanguage', lang);
    translatePage(lang);
    window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language: lang } }));
    return true;
  }

  // ------------------------------------------------------------------
  // Selector de idioma (banderas)
  // ------------------------------------------------------------------
  function createLanguageSelector() {
    return `
      <div class="language-buttons">
        <button class="flag-btn es ${currentLanguage === 'es' ? 'active' : ''}" data-lang="es" data-no-translate="true" title="Español"></button>
        <button class="flag-btn uk ${currentLanguage === 'en' ? 'active' : ''}" data-lang="en" data-no-translate="true" title="English"></button>
        <button class="flag-btn cz ${currentLanguage === 'cs' ? 'active' : ''}" data-lang="cs" data-no-translate="true" title="Čeština"></button>
      </div>
    `;
  }

  function initLanguageSelector() {
    const rightSection = document.querySelector('.global-header .header-right-section');
    if (!rightSection) return;

    const temp = document.createElement('div');
    temp.innerHTML = createLanguageSelector();
    rightSection.insertBefore(temp.firstElementChild, rightSection.firstChild);

    document.querySelectorAll('.flag-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const lang = btn.dataset.lang;
        if (lang === currentLanguage) return;
        const ok = await changeLanguage(lang);
        if (ok) {
          document.querySelectorAll('.flag-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        }
      });
    });
  }

  // ------------------------------------------------------------------
  // Header
  // ------------------------------------------------------------------
  function getPageTitle() {
    const scripts = document.querySelectorAll('script[src*="globalHeader.js"]');
    for (const s of scripts) {
      if (s.dataset.title) return s.dataset.title;
    }
    return document.title || 'MESA DOCK';
  }

  function createHeaderHTML(title) {
    return `
      <div class="global-header">
        <div class="header-main-row">
          <div class="header-left-section">
            <a href="${HEADER_CONFIG.homeUrl}" class="logo-link" title="Ir a Inicio">
              <img class="emesa-logo" src="${HEADER_CONFIG.logoSrc}" alt="${HEADER_CONFIG.logoAlt}">
            </a>
          </div>
          <span class="header-title" data-original-text="${title}">${title}</span>
          <div class="header-right-section">
            <div id="${HEADER_CONFIG.loginWidgetId}"></div>
          </div>
        </div>
      </div>
    `;
  }

  function initGlobalHeader(options = {}) {
    const title = options.title || getPageTitle();

    let headerContainer = document.querySelector('.header');
    if (headerContainer) {
      headerContainer.outerHTML = createHeaderHTML(title);
    } else {
      const div = document.createElement('div');
      div.innerHTML = createHeaderHTML(title);
      document.body.insertBefore(div.firstElementChild, document.body.firstChild);
    }

    // Inicializar widget de usuario
    if (window.Auth && window.Auth.updateUserWidget) {
      window.Auth.updateUserWidget();
    }

    // Cargar el idioma guardado y traducir
    loadSavedLanguage().then(() => initLanguageSelector());

    console.log('[GlobalHeader] Header inicializado');
  }

  async function loadSavedLanguage() {
    const saved = localStorage.getItem('appLanguage') || 'es';
    currentLanguage = SUPPORTED_LANGUAGES.includes(saved) ? saved : 'es';
    await Promise.all(SUPPORTED_LANGUAGES.map(lang => loadTranslations(lang)));
    translatePage(currentLanguage);
  }

  function updateHeaderTitle(newTitle) {
    const el = document.querySelector('.global-header .header-title');
    if (el) {
      el.textContent = newTitle;
      el.dataset.originalText = newTitle;
      translatePage();
    }
  }

  // ------------------------------------------------------------------
  // API pública
  // ------------------------------------------------------------------
  window.GlobalHeader = {
    init: initGlobalHeader,
    updateTitle: updateHeaderTitle,
    config: HEADER_CONFIG,
    translate,
    translatePage,
    changeLanguage,
    getCurrentLanguage: () => currentLanguage,
    getSupportedLanguages: () => SUPPORTED_LANGUAGES
  };

  // Auto-inicialización
  const script = document.querySelector('script[src*="globalHeader.js"]');
  const autoInit = !(script && script.dataset.autoInit === 'false');

  if (autoInit) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => initGlobalHeader());
    } else {
      initGlobalHeader();
    }
  }

})();
