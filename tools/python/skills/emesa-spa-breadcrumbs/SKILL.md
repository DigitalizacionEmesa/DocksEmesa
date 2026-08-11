---
name: emesa-spa-breadcrumbs
description: Crear, portar o estandarizar breadcrumbs para aplicaciones SPA con estética EMESA fija, manteniendo colores, tipografía, espaciado, posición relativa respecto al encabezado y sidebar, y navegación jerárquica simple. Usar cuando el usuario pida breadcrumbs, migas de pan o navegación SPA corporativa con patrón jerárquico Inicio / Configuración / subsección, y quiera el mismo patrón visual y funcional corporativo.
---

# Emesa Spa Breadcrumbs

## Overview

Implementar un breadcrumb corporativo EMESA reutilizable para cualquier SPA sin depender del proyecto origen.
La skill debe reproducir siempre el mismo patrón visual y funcional: franja inmediatamente bajo el header, antes del layout principal con sidebar, navegación jerárquica simple y estilo cromático/espaciado estable.

## Secretos requeridos (si aplica)

No requiere secretos.

## Contrato visual fijo

- `font-family`: `Open Sans`, `Segoe UI`, Tahoma, Arial, sans-serif
- `font-style`: `normal`
- `font-size` base: `15px`
- `font-weight` base: `400`
- `line-height`: `1.2`
- `min-height` del contenedor: `50px`
- ajuste vertical del texto/item: `top: 1px`
- `letter-spacing`: `0`
- contenedor exterior: `nav` con `aria-label="Breadcrumb"`
- wrapper exterior sin fondo propio (`background: transparent`), sin borde inferior y sin padding extra
- contenedor interno con:
        - `display: flex`
        - `align-items: center`
        - `gap: 0`
        - `padding: 10px 20px`
        - `min-height: 50px`
        - `box-sizing: border-box`
        - `font-size: 15px`
        - `background: #d1e7dd`
        - `border-bottom: 1px solid #c3e6de`
        - `color: #3b4a5a`
        - `position: relative`
        - `z-index: 101`
        - `overflow-x: auto`
- item general:
        - `display: inline-flex`
        - `align-items: center`
        - `position: relative`
        - `top: 1px`
        - `line-height: 1.2`
        - `font-style: normal`
        - `font-weight: 400`
        - `color: #3b4a5a`
- item navegable:
        - color `#1e6bb8`
        - `font-size: 15px`
        - `font-weight: 400`
        - sin subrayado por defecto
        - con subrayado al hover
        - cursor `pointer`
- item final (actual):
        - color `#1f2d3d`
        - `font-size: 15px`
        - `font-weight: 700`
        - `font-style: normal`
        - no clicable
- separador:
        - texto `>`
        - color `#7c8a99`
        - `font-size: 14px`
        - `font-weight: 400`
        - `margin: 0 14px` para abrir el espacio visual entre texto y separador

## Posición y layout obligatorios

Usar siempre este orden estructural en el DOM cuando exista header + sidebar:

1. `header.header`
2. `nav.breadcrumb-wrapper`
3. contenedor principal de layout (`.app-layout` o equivalente)
4. sidebar dentro del layout principal
5. área de contenido a la derecha del sidebar

Reglas:

- El breadcrumb va inmediatamente debajo del header.
- El breadcrumb no va dentro del sidebar.
- El breadcrumb no flota sobre el contenido principal.
- El sidebar empieza debajo del breadcrumb, dentro del layout principal.
- El breadcrumb debe ocupar todo el ancho disponible por encima del layout principal.
- No usar estilo oscuro para el breadcrumb EMESA.

## Contrato funcional obligatorio

El breadcrumb no debe comportarse como historial acumulativo libre.
Debe comportarse como jerarquía fija de navegación, con profundidad máxima 3.

Patrones permitidos:

- `Inicio`
- `Inicio > Configuración`
- `Inicio > Configuración > Submenú`

Reglas de interacción:

- En `Inicio`, el breadcrumb solo muestra `Inicio` y no es clicable.
- En cualquier vista del sidebar que no pertenezca a Configuración, el breadcrumb solo muestra `Inicio` y no es clicable.
- En la landing de Configuración, el breadcrumb muestra `Inicio > Configuración`.
- En una subsección de Configuración, el breadcrumb muestra `Inicio > Configuración > Nombre de subsección`.
- En subsecciones de Configuración, `Inicio` y `Configuración` son clicables.
- El último item nunca es clicable.
- El breadcrumb solo debe permitir volver a `Configuración` o a `Inicio` según el nivel actual.
- No persistir un stack arbitrario ni acumular pasos anteriores ajenos a la jerarquía visible.

## API mínima esperada

- `updateBreadcrumb(target)`
- `navigateToBreadcrumb(target)`
- `goBack(currentTarget)`
- `ensureInitialState(target)`
- `getLabelForTarget(target)`

## CSS de referencia obligatorio

```css
.breadcrumb-wrapper {
        background: transparent;
        border-bottom: none;
        padding: 0;
}

.breadcrumb-container {
        display: flex;
        align-items: center;
gap: 0;
        overflow-x: auto;
        padding: 10px 20px;
        min-height: 50px;
        box-sizing: border-box;
        background: #d1e7dd;
        border-bottom: 1px solid #c3e6de;
        position: relative;
        z-index: 101;
        color: #3b4a5a;
        font-family: "Open Sans", "Segoe UI", Tahoma, Arial, sans-serif;
        font-size: 15px;
        font-style: normal;
        font-weight: 400;
        line-height: 1.2;
        letter-spacing: 0;
}

.breadcrumb-item {
        display: inline-flex;
        align-items: center;
        position: relative;
        top: 1px;
        line-height: 1.2;
}

.breadcrumb-clickable {
        color: #1e6bb8;
        font-family: "Open Sans", "Segoe UI", Tahoma, Arial, sans-serif;
        font-size: 15px;
        font-style: normal;
        font-weight: 400;
        text-decoration: none;
}

.breadcrumb-clickable:hover {
        text-decoration: underline;
}

.breadcrumb-last {
        color: #1f2d3d;
        font-family: "Open Sans", "Segoe UI", Tahoma, Arial, sans-serif;
        font-size: 15px;
        font-style: normal;
        font-weight: 700;
}

.breadcrumb-separator {
        color: #7c8a99;
        font-size: 14px;
        font-weight: 400;
margin: 0 14px;
}
```

## Restricciones obligatorias

- No cambiar la estética a tema oscuro.
- No convertir el breadcrumb en un bloque tipo tabs.
- No incrustarlo dentro del sidebar.
- No sustituir la jerarquía por un historial acumulativo de clicks.
- No añadir iconografía innecesaria salvo que el proyecto ya la use de forma consistente.
- No usar tamaños o espaciados arbitrarios distintos a los definidos, salvo adaptación responsive justificada.
- No cambiar la tipografía corporativa del breadcrumb por fuentes del framework o del navegador.

## Criterio de aceptación

- Funciona en proyectos independientes a este repositorio.
- Mantiene siempre el mismo aspecto EMESA para breadcrumb SPA.
- Mantiene la jerarquía `Inicio`, `Inicio > Configuración` o `Inicio > Configuración > Submenú`.
- Permite volver hacia arriba solo dentro de esa jerarquía visible.
- Define explícitamente fuente, tamaño, peso, estilo, colores, altura y comportamiento.
