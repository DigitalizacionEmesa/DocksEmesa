// =====================================================================
// usuarios.js - Gestion de usuarios EMESA DOCK
// =====================================================================
// Tabla usuarios: nombre, apellidos, rol_id (FK roles), proveedor_id,
// departamento_id, activo. usuario_plantas solo delimita usuarios internos;
// el acceso de un proveedor se deriva de proveedor_muelles.

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
  var operarios = [];
  var accionCredencialOperario = null;
  var filtroRapido = "todos";

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
      refrescarListado();
    } catch (err) {
      tbody.innerHTML = "<tr><td colspan=\"8\" class=\"empty-state\">" + t("Error al cargar") + "</td></tr>";
    }
  }

  function mostrarEstadoSincronizacion(mensaje, tipo) {
    var caja = document.getElementById("estadoSincronizacion");
    if (!caja) return;
    caja.textContent = mensaje;
    caja.style.display = "block";
    caja.className = "modulo-aviso " + (tipo || "");
  }

  function resumenSincronizacion(datos) {
    if (!datos) return t("Aún no se ha solicitado ninguna sincronización de operarios.");
    if (datos.estado === "PENDIENTE") return t("Sincronización solicitada. Esperando al agente corporativo.");
    if (datos.estado === "EN_CURSO") return t("El agente corporativo está sincronizando los operarios.");
    if (datos.estado === "ERROR") return t("La última sincronización ha fallado. Revisa el registro del agente.");
    var resultado = datos.resultado || {};
    return t("Última sincronización completada")
      + " · " + t("Nuevos") + ": " + (resultado.registros_nuevos || 0)
      + " · " + t("Actualizados") + ": " + (resultado.registros_actualizados || 0)
      + " · " + t("Inactivados") + ": " + (resultado.registros_inactivados || 0)
      + " · " + t("Errores") + ": " + (resultado.errores || 0);
  }

  async function cargarEstadoSincronizacion() {
    try {
      var data = await SupabaseApp.api("/api/admin/sincronizar-operarios");
      mostrarEstadoSincronizacion(resumenSincronizacion(data.solicitud));
    } catch (e) {
      // El usuario puede no ser administrador; no interrumpir el módulo actual.
    }
  }

  async function sincronizarOperarios() {
    if (!confirm(t("Se actualizarán los operarios desde el sistema corporativo. ¿Continuar?"))) return;
    var boton = document.getElementById("btnSincronizarOperarios");
    boton.disabled = true;
    mostrarEstadoSincronizacion(t("Solicitando sincronización al agente corporativo..."));
    try {
      var data = await SupabaseApp.api("/api/admin/sincronizar-operarios", { method: "POST" });
      mostrarEstadoSincronizacion(resumenSincronizacion(data.solicitud), "success");
      notificar(t("Sincronización solicitada"), "success");
    } catch (err) {
      mostrarEstadoSincronizacion(t("No se ha podido completar la sincronización."), "error");
      notificar(t("Error") + ": " + mensajeErrorAmigable(err), "error");
    } finally {
      boton.disabled = false;
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
      var esProveedor = ["proveedor", "externo"].indexOf(String(u.role_name || "").toLowerCase()) !== -1;
      var plantasTxt = esProveedor
        ? t("Según muelles del proveedor")
        : (plantasDeUsuario(u.id).map(function(pid) {
            var pl = plantas.find(function(x) { return x.id === pid; });
            return pl ? pl.nombre : "";
          }).filter(Boolean).join(", ") || "\u2014");
      var activoHtml = u.activo !== false ? "<span class=\"badge badge-completed\">" + t("Sí") + "</span>" : "<span class=\"badge badge-cancelled\">" + t("No") + "</span>";
      var esYo = yo && yo.id === u.id;
      var operario = u.numero_operario || "\u2014";
      var acciones = u.es_operario
        ? "<span style=\"color:#667;\">" + t("Gestionar en Operarios") + "</span>"
        : "<button class=\"action-button btn-edit\" onclick=\"window.Usuarios.editar('" + u.id + "')\">\u270f " + t("Editar") + "</button>" + (esYo ? "" : "<button class=\"action-button btn-del\" onclick=\"window.Usuarios.eliminar('" + u.id + "')\">\ud83d\uddd1 " + t("Eliminar") + "</button>");
      return "<tr><td><strong>" + esc(nombre) + "</strong></td><td>" + esc(u.email || "\u2014") + "</td><td>" + esc(operario) + "</td><td><span class=\"badge badge-in_progress\">" + esc(rolNombre) + "</span></td><td>" + esc(deptoNombre) + "</td><td>" + esc(provNombre) + "</td><td style=\"max-width:180px;\">" + esc(plantasTxt) + "</td><td>" + activoHtml + "</td><td class=\"acciones-cell\">" + acciones + "</td></tr>";
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
      + "<div class=\"crud-field\"><label>" + t("Rol") + "</label><select id=\"f_rol_id\" required>" + rolOpts + "</select></div>"
      + "<div class=\"crud-field\"><label>" + t("Departamento") + "</label><select id=\"f_departamento_id\">" + deptoOpts + "</select></div>"
      + "<div class=\"crud-field\"><label>" + t("Proveedor") + "</label><select id=\"f_proveedor_id\">" + provOpts + "</select></div>"
      + "<div class=\"crud-field\"><label>" + t("Activo") + "</label><input type=\"checkbox\" id=\"f_activo\" " + (!usuario || usuario.activo !== false ? "checked" : "") + "></div>"
      + "<div class=\"crud-field full\" id=\"f_plantas_internas\"><label>" + t("Plantas asignadas") + "</label><div style=\"border:1.5px solid #d0d7de;border-radius:8px;padding:10px 12px;max-height:150px;overflow-y:auto;\">" + plantasHtml + "</div></div>"
      + "<div class=\"crud-field full\" id=\"f_acceso_proveedor_info\" style=\"display:none;\"><div class=\"modulo-aviso info\" style=\"max-width:none;margin:0;\">" + t("El acceso a plantas y muelles del proveedor se configura en Proveedor-Muelles. Las plantas se deducen automáticamente de los muelles asignados.") + "</div></div>"
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
      document.getElementById("f_plantas_internas").style.display = permitido ? "none" : "block";
      document.getElementById("f_acceso_proveedor_info").style.display = permitido ? "block" : "none";
    }
    rolSel.addEventListener("change", aplicarBloqueoProveedor);
    aplicarBloqueoProveedor();

    document.getElementById("crudModal").classList.add("active");
    if (window.GlobalHeader) window.GlobalHeader.translatePage();
  }

  function cerrarModal() { document.getElementById("crudModal").classList.remove("active"); editandoId = null; }

  function esRolExterno(rol) {
    var nombre = String((rol && rol.nombre) || "").trim().toLowerCase();
    return ["proveedor", "externo", "supplier", "supplier_user", "external"].indexOf(nombre) !== -1;
  }

  function abrirModalInvitacion(tipoUsuario) {
    var externo = tipoUsuario === "EXTERNO";
    var rolesDisponibles = roles.filter(function(r) { return esRolExterno(r) === externo; });
    var rolOpts = "<option value=\"\">— " + t("Selecciona un rol") + " —</option>" + rolesDisponibles.map(function(r) {
      return "<option value=\"" + r.id + "\">" + esc(r.nombre) + "</option>";
    }).join("");
    var provOpts = "<option value=\"\">—</option>" + proveedores.map(function(p) {
      return "<option value=\"" + p.id + "\">" + esc(p.nombre) + "</option>";
    }).join("");
    document.getElementById("invitacionForm").innerHTML =
      "<div class=\"crud-field full\"><label>" + t("Email autorizado") + "</label><input type=\"email\" id=\"i_email\" required autocomplete=\"email\"></div>"
      + "<div class=\"crud-field\"><label>" + t("Tipo de acceso") + "</label><input type=\"text\" value=\"" + (externo ? t("Proveedor externo") : t("Usuario interno")) + "\" readonly><input type=\"hidden\" id=\"i_tipo\" value=\"" + tipoUsuario + "\"></div>"
      + "<div class=\"crud-field\"><label>" + t("Rol") + "</label><select id=\"i_rol\" required>" + rolOpts + "</select></div>"
      + (externo
        ? "<div class=\"crud-field full\"><label>" + t("Proveedor") + "</label><select id=\"i_proveedor\" required>" + provOpts + "</select><small>" + t("Los muelles se autorizan después en Proveedor-Muelles.") + "</small></div>"
        : "<div class=\"crud-field full\"><div class=\"modulo-aviso warning\" style=\"max-width:none;margin:0;\">" + t("El departamento y las plantas se completan al editar el perfil cuando la invitación haya sido aceptada.") + "</div><input type=\"hidden\" id=\"i_proveedor\" value=\"\"></div>");
    document.getElementById("invitacionModalTitulo").textContent = externo ? t("Invitar proveedor externo") : t("Invitar usuario interno");
    document.getElementById("invitacionModal").classList.add("active");
  }

  function abrirAltaAcceso() {
    document.getElementById("altaAccesoModal").classList.add("active");
  }

  function cerrarAltaAcceso() {
    document.getElementById("altaAccesoModal").classList.remove("active");
  }

  function cerrarModalInvitacion() {
    document.getElementById("invitacionModal").classList.remove("active");
  }

  async function enviarInvitacion(e) {
    e.preventDefault();
    var boton = document.getElementById("invitacionEnviar");
    boton.disabled = true;
    try {
      await SupabaseApp.api("/api/admin/invitaciones", {
        method: "POST",
        body: {
          email: document.getElementById("i_email").value.trim(),
          tipo_usuario: document.getElementById("i_tipo").value,
          rol_id: document.getElementById("i_rol").value,
          proveedor_id: document.getElementById("i_proveedor").value || null
        }
      });
      cerrarModalInvitacion();
      notificar(t("Invitación enviada"), "success");
    } catch (err) {
      notificar(t("Error") + ": " + mensajeErrorAmigable(err), "error");
    } finally {
      boton.disabled = false;
    }
  }

  function estadoOperario(operario) {
    return operario.activo !== false
      ? "<span class=\"badge badge-completed\">" + t("Activo") + "</span>"
      : "<span class=\"badge badge-cancelled\">" + t("Inactivo") + "</span>";
  }

  function pintarOperarios() {
    var tbody = document.getElementById("operariosTbody");
    if (!operarios.length) {
      tbody.innerHTML = "<tr><td colspan=\"5\" class=\"empty-state\">" + t("No hay operarios sincronizados") + "</td></tr>";
      return;
    }
    tbody.innerHTML = operarios.map(function(operario) {
      var numero = encodeURIComponent(operario.numero_operario);
      var cuenta = operario.tiene_cuenta
        ? "<span class=\"badge badge-completed\">" + t("Sí") + "</span>"
        : "<span class=\"badge badge-cancelled\">" + t("No") + "</span>";
      var acciones = operario.activo === false
        ? "—"
        : (operario.tiene_cuenta
          ? "—"
          : "<button class=\"action-button btn-edit\" onclick=\"window.Usuarios.crearCuentaOperario('" + numero + "')\">" + t("Crear cuenta") + "</button>");
      return "<tr><td>" + esc(operario.numero_operario) + "</td><td><strong>" + esc(operario.nombre) + "</strong></td><td>" + estadoOperario(operario) + "</td><td>" + cuenta + "</td><td class=\"acciones-cell\">" + acciones + "</td></tr>";
    }).join("");
  }

  async function abrirModalOperarios() {
    document.getElementById("operariosModal").classList.add("active");
    document.getElementById("busquedaOperarios").value = "";
    var tbody = document.getElementById("operariosTbody");
    tbody.innerHTML = "<tr><td colspan=\"5\" class=\"empty-state\">" + t("Cargando...") + "</td></tr>";
    try {
      var data = await SupabaseApp.api("/api/admin/operarios");
      operarios = data.operarios || [];
      pintarOperarios();
    } catch (err) {
      tbody.innerHTML = "<tr><td colspan=\"5\" class=\"empty-state\">" + t("Error al cargar") + "</td></tr>";
      notificar(t("Error") + ": " + mensajeErrorAmigable(err), "error");
    }
  }

  function cerrarModalOperarios() {
    document.getElementById("operariosModal").classList.remove("active");
  }

  function abrirCredencialOperario(numeroCodificado, tipo) {
    var numero = decodeURIComponent(numeroCodificado);
    var operario = operarios.find(function(item) { return String(item.numero_operario) === String(numero); });
    if (!operario) return;
    accionCredencialOperario = { numero: numero, tipo: tipo };
    var crear = tipo === "crear";
    document.getElementById("credencialOperarioTitulo").textContent = crear ? t("Asignar contraseña") : t("Cambiar contraseña");
    document.getElementById("credencialOperarioTexto").textContent = crear
      ? t("Se asignará una contraseña a ") + operario.nombre + " (" + operario.numero_operario + "). Accederá con su número de operario."
      : t("Indica una nueva contraseña para ") + operario.nombre + ".";
    document.getElementById("credencialOperarioPassword").value = "";
    document.getElementById("credencialOperarioModal").classList.add("active");
    document.getElementById("credencialOperarioPassword").focus();
  }

  function cerrarCredencialOperario() {
    document.getElementById("credencialOperarioModal").classList.remove("active");
    accionCredencialOperario = null;
  }

  async function guardarCredencialOperario(e) {
    e.preventDefault();
    if (!accionCredencialOperario) return;
    var password = document.getElementById("credencialOperarioPassword").value;
    if (!password) {
      notificar(t("Debes indicar una contraseña."), "error");
      return;
    }
    var boton = document.getElementById("credencialOperarioGuardar");
    boton.disabled = true;
    try {
      var esCreacion = accionCredencialOperario.tipo === "crear";
      var ruta = "/api/admin/operarios/" + encodeURIComponent(accionCredencialOperario.numero)
        + (esCreacion ? "/cuenta" : "/restablecer-contrasena");
      await SupabaseApp.api(ruta, { method: "POST", body: { password: password } });
      cerrarCredencialOperario();
      await abrirModalOperarios();
      notificar(esCreacion ? t("Contraseña asignada") : t("Contraseña actualizada"), "success");
    } catch (err) {
      notificar(t("Error") + ": " + mensajeErrorAmigable(err), "error");
    } finally {
      boton.disabled = false;
    }
  }

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
    var rol = roles.find(function(x) { return x.id === rolId; });
    var esProveedor = ["proveedor", "externo"].indexOf(String((rol && rol.nombre) || "").toLowerCase()) !== -1;
    if (esProveedor && !document.getElementById("f_proveedor_id").value) {
      notificar(t("Un usuario proveedor debe estar vinculado a un proveedor."), "error");
      return;
    }
    var cuerpo = {
      email: document.getElementById("f_email").value.trim(),
      password: document.getElementById("f_password").value,
      nombre: document.getElementById("f_nombre").value.trim(),
      apellidos: document.getElementById("f_apellidos").value.trim(),
      rol_id: rolId,
      proveedor_id: document.getElementById("f_proveedor_id").value || null,
      departamento_id: document.getElementById("f_departamento_id").value || null,
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
      // Las plantas solo delimitan usuarios internos. Para proveedores el
      // acceso nace exclusivamente de proveedor_muelles; no se crean ni se
      // borran asignaciones históricas al guardar su perfil.
      if (!esProveedor) {
        await sincronizarPlantas(uid, plantasSeleccionadas());
        try {
          var up = await SupabaseApp.api("/api/crud/usuario_plantas?limit=1000");
          todasUP = up.datos || [];
        } catch (e2) {}
      }
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
    refrescarListado(texto);
  }

  function esOperarioListado(usuario) {
    return Boolean(usuario.es_operario || usuario.numero_operario);
  }

  function refrescarListado(texto) {
    var buscador = document.getElementById("busqueda");
    var panel = document.querySelector(".modulo-panel");
    if (panel) panel.setAttribute("data-filtro", filtroRapido);
    var q = (texto == null ? buscador.value : texto || "").toLowerCase();
    var datos = usuarios.filter(function(u) {
      var externo = ["proveedor", "externo", "supplier", "supplier_user", "external"].indexOf(String(u.role_name || "").toLowerCase()) !== -1;
      var operario = esOperarioListado(u);
      if (filtroRapido === "externos" && !externo) return false;
      if (filtroRapido === "internos" && (externo || operario)) return false;
      if (filtroRapido === "operarios" && !operario) return false;
      var textoBusqueda = (u.nombre || "") + " " + (u.apellidos || "") + " " + (u.email || "") + " " + (u.role_name || "") + " " + (u.numero_operario || "");
      return !q || textoBusqueda.toLowerCase().indexOf(q) !== -1;
    });
    pintarFilas(datos);
  }

  function filtrarOperarios(texto) {
    var q = (texto || "").toLowerCase();
    var visibles = operarios.filter(function(operario) {
      return !q || ((operario.numero_operario || "") + " " + (operario.nombre || "")).toLowerCase().indexOf(q) !== -1;
    });
    var todos = operarios;
    operarios = visibles;
    pintarOperarios();
    operarios = todos;
  }

  async function init() {
    if (!window.Auth || !Auth.isAuthenticated()) { window.location.href = "/"; return; }
    if (window.Permisos) { try { await Permisos.refresh(); } catch (e) {} }
    if (window.Permisos && !Permisos.puedeVerModulo("usuarios")) {
      document.getElementById("moduloAviso").style.display = "block";
      document.getElementById("moduloAviso").textContent = t("No tienes permisos.");
      document.getElementById("btnAltaAcceso").style.display = "none";
      return;
    }
    document.getElementById("btnAltaAcceso").addEventListener("click", abrirAltaAcceso);
    document.getElementById("altaAccesoModalClose").addEventListener("click", cerrarAltaAcceso);
    document.getElementById("altaAccesoModal").addEventListener("click", function(e) { if (e.target.id === "altaAccesoModal") cerrarAltaAcceso(); });
    document.getElementById("altaInterno").addEventListener("click", function() { cerrarAltaAcceso(); abrirModalInvitacion("INTERNO"); });
    document.getElementById("altaExterno").addEventListener("click", function() { cerrarAltaAcceso(); abrirModalInvitacion("EXTERNO"); });
    document.getElementById("altaOperario").addEventListener("click", function() { cerrarAltaAcceso(); abrirModalOperarios(); });
    document.getElementById("btnNuevo").addEventListener("click", function() { cerrarAltaAcceso(); abrirModal(null); });
    document.getElementById("btnOperarios").addEventListener("click", abrirModalOperarios);
    var botonSincronizar = document.getElementById("btnSincronizarOperarios");
    if (botonSincronizar) botonSincronizar.addEventListener("click", sincronizarOperarios);
    document.getElementById("crudModalClose").addEventListener("click", cerrarModal);
    document.getElementById("crudCancelar").addEventListener("click", cerrarModal);
    document.getElementById("crudForm").addEventListener("submit", guardar);
    document.getElementById("busqueda").addEventListener("input", function(e) { filtrar(e.target.value); });
    Array.prototype.forEach.call(document.querySelectorAll(".filtro-rapido"), function(boton) {
      boton.addEventListener("click", function() {
        filtroRapido = boton.getAttribute("data-filtro");
        Array.prototype.forEach.call(document.querySelectorAll(".filtro-rapido"), function(item) { item.classList.remove("activo"); });
        boton.classList.add("activo");
        refrescarListado();
      });
    });
    document.getElementById("crudModal").addEventListener("click", function(e) { if (e.target.id === "crudModal") cerrarModal(); });
    document.getElementById("invitacionModalClose").addEventListener("click", cerrarModalInvitacion);
    document.getElementById("invitacionCancelar").addEventListener("click", cerrarModalInvitacion);
    document.getElementById("invitacionForm").addEventListener("submit", enviarInvitacion);
    document.getElementById("invitacionModal").addEventListener("click", function(e) { if (e.target.id === "invitacionModal") cerrarModalInvitacion(); });
    document.getElementById("operariosModalClose").addEventListener("click", cerrarModalOperarios);
    document.getElementById("operariosModal").addEventListener("click", function(e) { if (e.target.id === "operariosModal") cerrarModalOperarios(); });
    document.getElementById("busquedaOperarios").addEventListener("input", function(e) { filtrarOperarios(e.target.value); });
    document.getElementById("credencialOperarioClose").addEventListener("click", cerrarCredencialOperario);
    document.getElementById("credencialOperarioCancelar").addEventListener("click", cerrarCredencialOperario);
    document.getElementById("credencialOperarioForm").addEventListener("submit", guardarCredencialOperario);
    document.getElementById("credencialOperarioModal").addEventListener("click", function(e) { if (e.target.id === "credencialOperarioModal") cerrarCredencialOperario(); });
    await cargarMaestros();
    await cargarUsuarios();
    await cargarEstadoSincronizacion();
  }

  window.Usuarios = {
    editar: function(id) { abrirModal(usuarios.find(function(u) { return u.id === id; })); },
    eliminar: eliminar,
    crearCuentaOperario: function(numero) { abrirCredencialOperario(numero, "crear"); },
    restablecerContrasenaOperario: function(numero) { abrirCredencialOperario(numero, "restablecer"); }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
