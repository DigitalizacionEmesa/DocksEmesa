// =====================================================================
// supabase.js - Configuración de Supabase para MESA DOCK
// =====================================================================
// MESA DOCK está conectado a Supabase. La autenticación y las consultas
// se realizan a través del backend Flask (que usa el cliente Python de
// Supabase con la clave de servicio), de modo que la clave secreta
// nunca llega al navegador.
//
// Si más adelante quieres consultas directas desde el navegador,
// pega aquí la ANON KEY pública y el SDK se cargará automáticamente
// desde el CDN (window.SupabaseApp.getClient()).

const SUPABASE_CONFIG = {
  url: 'https://aeqvtjenbnhglhuchokw.supabase.co',
  // ANON KEY pública (opcional para cliente directo):
  anonKey: ''
};

const SupabaseApp = (function () {
  'use strict';

  let client = null;

  // Carga dinámica del SDK de Supabase para el navegador (si hay anonKey)
  function loadSdk() {
    return new Promise((resolve, reject) => {
      if (window.supabase) { resolve(); return; }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // Devuelve un cliente Supabase listo para consultas directas.
  // Si no hay anonKey configurada, devuelve null (usa la API del backend).
  async function getClient() {
    if (client) return client;
    if (!SUPABASE_CONFIG.anonKey) return null;

    await loadSdk();
    client = window.supabase.createClient(
      SUPABASE_CONFIG.url,
      SUPABASE_CONFIG.anonKey
    );
    return client;
  }

  // Fetch helper para los endpoints del backend
  async function apiFetch(url, options = {}) {
    const opts = {
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    };
    if (options.body !== undefined) {
      opts.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, opts);
    let data = null;
    try { data = await response.json(); } catch (e) { /* sin cuerpo */ }

    if (!response.ok) {
      const err = new Error((data && data.error) || `Error HTTP ${response.status}`);
      err.status = response.status;
      throw err;
    }
    return data;
  }

  return {
    config: SUPABASE_CONFIG,
    getClient: getClient,
    api: apiFetch
  };
})();

window.SupabaseApp = SupabaseApp;
console.log('⚡ SupabaseApp configurado:', SUPABASE_CONFIG.url);
