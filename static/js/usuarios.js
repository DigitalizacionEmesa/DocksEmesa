// =====================================================================
// usuarios.js - Gestion de usuarios EMESA DOCK
// =====================================================================
// Tabla usuarios: nombre, apellidos, rol_id (FK roles), proveedor_id,
// departamento_id, activo. Las plantas se asignan aqui y se guardan
// en la tabla usuario_plantas.

(function () {
  "use strict";

  var t = (window.GlobalHeader && window.GlobalHeader.translate)
    ? function(key) { return window.GlobalHeader.translate(key); }
    : function(key) { return key; };

  var usuarios = [];
  var roles = [];
  var proveedores = [];
  var departamentos = [];
  var plantas = [];
  var todasUP = [];          // filas de usuario_plantas (para saber las plantas de cada usuario)
  var editandoId = null;

  function esc(texto) {
    var div = document.createElement("div");
    div.textContent = texto == null ? "" : String(texto);
    return div.innerHTML;
  }

  function mensajeErrorAmigable(err) {
    var msg = (err && err.message) || "";
    if (msg.indexOf("23505") !== -1 || msg.indexOf("duplicate") !== -1) return t("Ya existe un usuario con ese email.");
    if (msg.indexOf("password") !== -1) return t("La contrasena no cumple los requisitos.");
    return msg || t("Error");
  }

  function notificar(mensaje, tipo) {
    var div = document.createElement("div");
    div.className = "mensaje-temporal " + tipo;
    div.textContent = mensaje;
    document.body.appendChild(div);
    requestAnimationFrame(function() { div.classList.add("mostrar"); });
    setTimeout(function() { div.classList.remove("mostrar"); setTimeout(function() { div.remove(); }, 350); }, 2600);
  }

  function rolTxt(nombre) {
    var map = { admin: "Admin", interno: "Interno", proveedor: "Proveedor", externo: "Externo" };
    return t(map[nombre] || nombre);
  }

  async function cargarMaestros() {
    try {
      var res = await Promise.all([
        SupabaseApp.api("/api/crud/roles?limit=50"),
        SupabaseApp.api("/api/crud/proveedores?limit=200"),
        SupabaseApp.api("/api/crud/departamentos?limit=200"),
        SupabaseApp.api("/api/crud/plantas?limit=500"),
        SupabaseApp.api("/api/crud/usuario_plantas?limit=1000")
      ]);
      roles = res[0].datos || [];
      proveedores = res[1].datos || [];
      departamentos = res[2].datos || [];
      plantas = res[3].datos || [];
      todasUP = res[4].datos || [];
    } catch (e) { roles = []; proveedores = []; departamentos = []; plantas = []; todasUP = []; }
  }

  async function cargarUsuarios() {
    var tbody = document.getElementById("moduloTbody");
    tbody.innerHTML = "<tr><td colspan=\"8\" class=\"empty-state\">" + t("Cargando...") + "</td></tr>";
    try {
      var data = await SupabaseApp.api("/api/usuarios");
      usuarios = data.usuarios || [];
      pintarFilas(usuarios);
    } catch (err) {
      tbody.innerHTML = "<tr><td colspan=\"8\" class=\"empty-state\">" + t("Error al cargar") + "</td></tr>";
    }
  }

  function plantasDeUsuario(uid) {
    return todasUP.filter(function(f) { return f.usuario_id === uid; }).map(function(f) { return f.planta_id; });
  }

  function pintarFilas(datos) {
    var tbody = document.getElementById("moduloTbody");
    var thead = document.getElementById("moduloThead");
    thead.innerHTML = "<tr><th>" + t("Nombre") + "</th><th>Email</th><th>" + t("Operario") + "</th><th>" + t("Rol") + "</th><th>" + t("Depto") + "</th><th>" + t("Proveedor") + "</th><th>" + t("Plantas") + "</th><th>" + t("Activo") + "</th><th>" + t("Acciones") + "</th></tr>";
    if (!datos.length) { tbody.innerHTML = "<tr><td colspan=\"9\" class=\"empty-state\">" + t("No hay registros") + "</td></tr>"; return; }
    var yo = window.Auth ? Auth.getCurrentUser() : null;
    tbody.innerHTML = datos.map(function(u) {
      var nombre = ((u.nombre || "") + " " + (u.apellidos || "")).trim() || "\u2014";
      var rolNombre = u.role_name ? rolTxt(u.role_name) : "\u2014";
      var deptoNombre = "\u2014";
      if (u.departamento_id) { var d = departamentos.find(function(x) { return x.id === u.departamento_id; }); deptoNombre = d ? d.nombre : u.departamento_id.slice(0,8); }
      var provNombre = "\u2014";
      if (u.proveedor_id) { var p = proveedores.find(function(x) { return x.id === u.proveedor_id; }); provNombre = p ? p.nombre : u.proveedor_id.slice(0,8); }
      var plantasTxt = plantasDeUsuario(u.id).map(function(pid) {
        var pl = plantas.find(function(x) { return x.id === pid; });
        return pl ? pl.nombre : "";
      }).filter(Boolean).join(", ") || "\u2014";
      var activoHtml = u.activo !== false ? "<span class=\"badge badge-completed\">" + t("Sí") + "</span>" : "<span class=\"badge badge-cancelled\">" + t("No") + "</span>";
      var esYo = yo && yo.id === u.id;
      var operario = u.numero_operario ? u.numero_operario + (u.origen_operario ? " · " + u.origen_operario : "") : "\u2014";
      return "<tr><td><strong>" + esc(nombre) + "</strong></td><td>" + esc(u.email || "\u2014") + "</td><td>" + esc(operario) + "</td><td><span class=\"badge badge-in_progress\">" + esc(rolNombre) + "</span></td><td>" + esc(deptoNombre) + "</td><td>" + esc(provNombre) + "</td><td style=\"max-width:180px;\">" + esc(plantasTxt) + "</td><td>" + activoHtml + "</td><td class=\"acciones-cell\"><button class=\"action-button btn-edit\" onclick=\"window.Usuarios.editar('" + u.id + "')\">\u270f " + t("Editar") + "</button>" + (esYo ? "" : "<button class=\"action-button btn-del\" onclick=\"window.Usuarios.eliminar('" + u.id + "')\">\ud83d\uddd1 " + t("Eliminar") + "</button>") + "</td></tr>";
    }).join("");
    if (window.GlobalHeader) window.GlobalHeader.translatePage();
  }

  function abrirModal(usuario) {
    editandoId = usuario ? usuario.id : null;
    document.getElementById("crudModalTitulo").textContent = usuario ? t("Editar usuario") : t("Nuevo usuario");
    var esCrear = !usuario;
    var selVal = function(val, actual) { return val === actual ? " selected" : ""; };

    var rolOpts = "<option value=\"\">\u2014 " + t("Selecciona un rol") + " \u2014</option>" + roles.map(function(r) {
      return "<option value=\"" + r.id + "\"" + selVal(r.id, usuario ? usuario.rol_id : null) + ">" + esc(r.nombre) + "</option>";
    }).join("");

    var provOpts = "<option value=\"\">\u2014</option>" + proveedores.map(function(p) {
      return "<option value=\"" + p.id + "\"" + selVal(p.id, usuario ? usuario.proveedor_id : null) + ">" + esc(p.nombre) + "</option>";
    }).join("");

    var deptoOpts = "<option value=\"\">\u2014</option>" + departamentos.map(function(d) {
      return "<option value=\"" + d.id + "\"" + selVal(d.id, usuario ? usuario.departamento_id : null) + ">" + esc(d.nombre) + "</option>";
    }).join("");

    // Plantas asignadas al usuario (checkboxes)
    var idsAsignadas = usuario ? plantasDeUsuario(usuario.id) : [];
    var plantasHtml = plantas.length
      ? plantas.map(function(p) {
          var marcada = idsAsignadas.indexOf(p.id) !== -1 ? " checked" : "";
          return "<label style=\"display:flex;align-items:center;gap:6px;margin-bottom:4px;cursor:pointer;font-weight:500;\">"
            + "<input type=\"checkbox\" class=\"up-chk\" value=\"" + p.id + "\"" + marcada + ">"
            + esc(p.nombre) + "</label>";
        }).join("")
      : "<div style=\"color:#888;font-size:.85rem;\">" + t("No hay plantas creadas todavia.") + "</div>";

    document.getElementById("crudForm").innerHTML =
      "<div class=\"crud-field\"><label>" + t("Email") + "</label><input type=\"email\" id=\"f_email\" value=\"" + esc(usuario ? usuario.email : "") + "\" " + (esCrear ? "required" : "readonly") + "></div>"
      + "<div class=\"crud-field\"><label>" + (esCrear ? t("Contrasena") : t("Nueva contrasena (opcional)")) + "</label><input type=\"password\" id=\"f_password\" " + (esCrear ? "required" : "") + " placeholder=\"" + (esCrear ? "\u2022\u2022\u2022\u2022\u2022\u2022" : t("Dejar vacio")) + "\"></div>"
      + "<div class=\"crud-field\"><label>" + t("Nombre") + "</label><input type=\"text\" id=\"f_nombre\" value=\"" + esc(usuario ? usuario.nombre : "") + "\" required></div>"
      + "<div class=\"crud-field\"><label>" + t("Apellidos") + "</label><input type=\"text\" id=\"f_apellidos\" value=\"" + esc(usuario ? usuario.apellidos : "") + "\"></div>"
      + "<div class=\"crud-field\"><label>" + t("Número de operario") + "</label><input type=\"text\" id=\"f_numero_operario\" value=\"" + esc(usuario ? usuario.numero_operario : "") + "\" inputmode=\"numeric\"></div>"
      + "<div class=\"crud-field\"><label>" + t("Origen del operario") + "</label><select id=\"f_origen_operario\"><option value=\"\">—</option><option value=\"EMESA\"" + selVal("EMESA", usuario ? usuario.origen_operario : "") + ">EMESA</option><option value=\"MAPEX\"" + selVal("MAPEX", usuario ? usuario.origen_operario : "") + ">MAPEX</option></select></div>"
      + "<div class=\"crud-field\"><label>" + t("Rol") + "</label><select id=\"f_rol_id\" required>" + rolOpts + "</select></div>"
      + "<div class=\"crud-field\"><label>" + t("Departamento") + "</label><select id=\"f_departamento_id\">" + deptoOpts + "</select></div>"
      + "<div class=\"crud-field\"><label>" + t("Proveedor") + "</label><select id=\"f_proveedor_id\">" + provOpts + "</select></div>"
      + "<div class=\"crud-field\"><label>" + t("Activo") + "</label><input type=\"checkbox\" id=\"f_activo\" " + (!usuario || usuario.activo !== false ? "checked" : "") + "></div>"
      + "<div class=\"crud-field full\"><label>" + t("Plantas asignadas") + "</label><div style=\"border:1.5px solid #d0d7de;border-radius:8px;padding:10px 12px;max-height:150px;overflow-y:auto;\">" + plantasHtml + "</div></div>"
      + (esCrear ? "" : "<input type=\"hidden\" id=\"f_id\" value=\"" + (usuario ? usuario.id : "") + "\">");

    // El proveedor solo se rellena para el rol externo: admin/interno lo tienen bloqueado (gris)
    var rolSel = document.getElementById("f_rol_id");
    var provSel = document.getElementById("f_proveedor_id");
    function nombreRolSeleccionado() {
      var r = roles.find(function(x) { return x.id === rolSel.value; });
      return (r ? r.nombre : "").toLowerCase();
    }
    function aplicarBloqueoProveedor() {
      var permitido = nombreRolSeleccionado() === "externo" || nombreRolSeleccionado() === "proveedor";
      provSel.disabled = !permitido;
      if (!permitido) provSel.value = "";
    }
    rolSel.addEventListener("change", aplicarBloqueoProveedor);
    aplicarBloqueoProveedor();

    document.getElementById("crudModal").classList.add("active");
    if (window.GlobalHeader) window.GlobalHeader.translatePage();
  }

  function cerrarModal() { document.getElementById("crudModal").classList.remove("active"); editandoId = null; }

  function plantasSeleccionadas() {
    return Array.prototype.slice.call(document.querySelectorAll(".up-chk:checked")).map(function(c) { return c.value; });
  }

  // Sincroniza las plantas del usuario en la tabla usuario_plantas
  async function sincronizarPlantas(uid, ids) {
    var misFilas = todasUP.filter(function(f) { return f.usuario_id === uid; });
    for (var i = 0; i < misFilas.length; i++) {
      await SupabaseApp.api("/api/crud/usuario_plantas/" + misFilas[i].id, { method: "DELETE" });
    }
    for (var j = 0; j < ids.length; j++) {
      await SupabaseApp.api("/api/crud/usuario_plantas", { method: "POST", body: { usuario_id: uid, planta_id: ids[j] } });
    }
  }

  async function guardar(e) {
    e.preventDefault();
    var rolId = document.getElementById("f_rol_id").value;
    if (!rolId) { notificar(t("El usuario debe tener un rol asignado."), "error"); return; }
    var cuerpo = {
      email: document.getElementById("f_email").value.trim(),
      password: document.getElementById("f_password").value,
      nombre: document.getElementById("f_nombre").value.trim(),
      apellidos: document.getElementById("f_apellidos").value.trim(),
      rol_id: rolId,
      proveedor_id: document.getElementById("f_proveedor_id").value || null,
      departamento_id: document.getElementById("f_departamento_id").value || null,
      numero_operario: document.getElementById("f_numero_operario").value.trim() || null,
      origen_operario: document.getElementById("f_origen_operario").value || null,
      activo: document.getElementById("f_activo").checked
    };
    if (editandoId) { delete cuerpo.email; if (!cuerpo.password) delete cuerpo.password; }
    var btn = document.getElementById("crudGuardar"); btn.disabled = true;
    try {
      var uid = editandoId;
      var respuesta;
      if (editandoId) {
        await SupabaseApp.api("/api/usuarios/" + editandoId, { method: "PUT", body: cuerpo });
      } else {
        respuesta = await SupabaseApp.api("/api/usuarios", { method: "POST", body: cuerpo });
        uid = respuesta.id;
      }
      // Sincronizar plantas
      await sincronizarPlantas(uid, plantasSeleccionadas());
      // Refrescar el mapa local de usuario_plantas
      try {
        var up = await SupabaseApp.api("/api/crud/usuario_plantas?limit=1000");
        todasUP = up.datos || [];
      } catch (e2) {}
      cerrarModal(); await cargarUsuarios(); notificar(t("Operacion completada"), "success");
    } catch (err) { notificar(t("Error") + ": " + mensajeErrorAmigable(err), "error"); }
    finally { btn.disabled = false; }
  }

  async function eliminar(id) {
    if (!confirm(t("Seguro que deseas eliminar este usuario?"))) return;
    try { await SupabaseApp.api("/api/usuarios/" + id, { method: "DELETE" }); await cargarUsuarios(); notificar(t("Usuario eliminado"), "success"); }
    catch (err) { notificar(t("Error") + ": " + mensajeErrorAmigable(err), "error"); }
  }

  function filtrar(texto) {
    var q = (texto || "").toLowerCase();
    if (!q) { pintarFilas(usuarios); return; }
    pintarFilas(usuarios.filter(function(u) { return ((u.nombre||"") + " " + (u.apellidos||"") + (u.email||"") + (u.role_name||"")).toLowerCase().indexOf(q) !== -1; }));
  }

  async function init() {
    if (!window.Auth || !Auth.isAuthenticated()) { window.location.href = "/"; return; }
    if (window.Permisos) { try { await Permisos.refresh(); } catch (e) {} }
    if (window.Permisos && !Permisos.puedeVerModulo("usuarios")) {
      document.getElementById("moduloAviso").style.display = "block";
      document.getElementById("moduloAviso").textContent = t("No tienes permisos.");
      document.getElementById("btnNuevo").style.display = "none";
      return;
    }
    document.getElementById("btnNuevo").addEventListener("click", function() { abrirModal(null); });
    document.getElementById("crudModalClose").addEventListener("click", cerrarModal);
    document.getElementById("crudCancelar").addEventListener("click", cerrarModal);
    document.getElementById("crudForm").addEventListener("submit", guardar);
    document.getElementById("busqueda").addEventListener("input", function(e) { filtrar(e.target.value); });
    document.getElementById("crudModal").addEventListener("click", function(e) { if (e.target.id === "crudModal") cerrarModal(); });
    await cargarMaestros();
    await cargarUsuarios();
  }

  window.Usuarios = {
    editar: function(id) { abrirModal(usuarios.find(function(u) { return u.id === id; })); },
    eliminar: eliminar
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
