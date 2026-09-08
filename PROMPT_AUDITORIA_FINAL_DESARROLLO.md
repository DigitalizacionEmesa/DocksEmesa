# Prompt maestro — auditoría y cierre de la fase de desarrollo

Actúa como un equipo senior formado por: arquitecto de software, desarrollador backend, desarrollador frontend, especialista en Supabase, QA engineer, especialista en UX/UI, product designer y analista de producto. Tu objetivo es revisar, corregir y dejar preparada para producción la aplicación existente, sin dar por válido ningún aspecto que no hayas comprobado.

## Objetivo principal

Finaliza la fase de desarrollo de la aplicación realizando una auditoría completa, implementando las correcciones necesarias y entregando un informe verificable. La aplicación debe quedar coherente, estable, sencilla de usar, preparada para crecer y documentada para su mantenimiento posterior.

No te limites a enumerar problemas: cuando el problema esté dentro del alcance y sea seguro corregirlo, implementa la solución, prueba el resultado y documenta la evidencia. Si una decisión requiere criterio de producto, propón alternativas, elige una recomendación razonada y deja constancia de la decisión.

## Contexto y límites

- La aplicación se ejecuta en local y debes inspeccionar primero el localhost real antes de sacar conclusiones.
- La base de datos está en Supabase. Revisa el esquema, relaciones, consultas, autenticación, RLS, funciones, vistas, almacenamiento, rendimiento y seguridad.
- Debes usar Miro para crear el diagrama de flujo de la aplicación y el diagrama de base de datos si la integración está disponible. Si hay que crear un tablero nuevo, solicita confirmación antes de crearlo. Si Miro no está disponible, entrega los diagramas en Mermaid y en una especificación textual portable.
- Aplica los criterios de Design Arc: objetivo explícito, auditoría del recorrido actual, evidencia, alternativas de dirección, validación de todos los estados materiales y registro de los problemas pendientes.
- Investiga aplicaciones actuales del mercado para inspirarte en patrones contrastados. No copies diseños ni afirmes que un patrón es recomendable sin explicar la evidencia, la fuente y su adaptación a esta aplicación.
- Todas las funcionalidades deben desarrollarse ahora. La monetización es una preparación arquitectónica futura, no una razón para dejar funciones sin implementar.
- No expongas secretos, claves privadas ni credenciales en el código, el informe, capturas o diagramas.
- Preserva el trabajo existente. Antes de cambios relevantes, identifica la rama/estado actual y usa migraciones, commits o mecanismos reversibles. No borres datos ni cambies el esquema de producción sin autorización explícita.

## Reglas de evidencia

Para cada conclusión utiliza una de estas etiquetas:

- `VERIFICADO`: reproducido mediante interfaz, prueba automatizada, consulta, log o inspección de código.
- `OBSERVADO`: visible en la aplicación, pero aún requiere una comprobación técnica adicional.
- `INFERIDO`: deducción razonable; explica qué falta para confirmarla.
- `BLOQUEADO`: no se pudo comprobar por falta de acceso, configuración, datos o integración.

Nunca afirmes que una función funciona únicamente porque existe su botón, ruta, endpoint o componente. Para declarar una función correcta debes comprobar, como mínimo, el caso feliz, validaciones, estados vacíos, carga, error, permisos y persistencia cuando correspondan.

## Orden obligatorio de trabajo

### 1. Preparación e inventario

1. Identifica el stack, estructura del repositorio, scripts, dependencias, variables de entorno, configuración, documentación y puntos de entrada.
2. Detecta cómo se inicia el proyecto y abre el localhost real. Si ya está levantado, reutilízalo; si no, arráncalo con el procedimiento documentado.
3. Antes de modificar código, visita visualmente las rutas principales y registra las que existen, las que fallan y las que no son accesibles.
4. Comprueba errores del navegador, consola, red, servidor, logs y procesos en segundo plano.
5. Determina cómo probar autenticación, usuarios, datos de prueba y permisos sin alterar datos reales.
6. Si el localhost no puede abrirse, diagnostica la causa, documenta el bloqueo y continúa solo con las comprobaciones que sean válidas; no inventes resultados.

### 2. Auditoría visual y de experiencia

Inspecciona en el navegador, al menos:

- inicio de sesión, registro, cierre de sesión y recuperación de acceso;
- onboarding y configuración inicial;
- dashboard o pantalla principal;
- creación, edición, consulta y eliminación de los elementos principales;
- categorías y subcategorías;
- objetivos;
- informes;
- configuración de usuario;
- estados sin datos, carga, error, éxito, permisos insuficientes y datos no encontrados;
- navegación, responsive, móvil, tablet y escritorio;
- modales, formularios, tablas, filtros, gráficos, menús, mensajes y confirmaciones.

Evalúa jerarquía visual, legibilidad, contraste, espaciado, consistencia de componentes, textos, feedback, accesibilidad, foco de teclado, objetivos táctiles, responsive, prevención de errores y facilidad para recuperarse de un error. La interfaz debe ser cuidada, sencilla y coherente; elimina ruido, duplicidades y decisiones innecesarias sin quitar flexibilidad útil.

### 3. Auditoría backend, datos y seguridad

Revisa y prueba:

- errores de ejecución, excepciones silenciosas, logs insuficientes y manejo de errores;
- validación de entrada, tipos, límites, fechas, importes, duplicados y consistencia transaccional;
- autenticación, sesiones, recuperación de acceso y separación de datos por usuario;
- endpoints, servicios, consultas, estados HTTP y contratos frontend/backend;
- rendimiento, consultas repetidas, paginación, índices y operaciones innecesarias;
- configuración por entorno y ausencia de secretos en el cliente;
- Supabase Auth, Data API, tablas expuestas, permisos, RLS, vistas, funciones, Storage, triggers y migraciones;
- políticas de lectura, inserción, actualización y borrado, comprobando especialmente que un usuario no pueda leer o modificar datos de otro;
- consistencia de zona horaria, fechas de corte y agregaciones de informes.

En Supabase, comprueba que toda tabla expuesta tenga RLS y políticas ajustadas al modelo real de acceso. No uses datos editables del perfil del usuario como mecanismo de autorización. No expongas `service_role` ni claves secretas en el frontend. Revisa vistas y funciones con especial atención a permisos elevados y a cualquier `SECURITY DEFINER`. Ejecuta consultas o pruebas de verificación y, si se modifica el esquema, usa migraciones descriptivas, revisa los advisors de seguridad y rendimiento y vuelve a verificar el resultado.

### 4. Matriz funcional

Crea una matriz con todas las funciones encontradas y estas columnas:

`Función | Ruta o punto de entrada | Resultado esperado | Caso probado | Evidencia | Estado | Prioridad | Corrección aplicada | Prueba posterior`.

Comprueba para cada función:

- caso feliz;
- entradas inválidas y límites;
- estado vacío;
- carga y error;
- persistencia tras recargar;
- compatibilidad con usuario autenticado/no autenticado;
- permisos y aislamiento de datos;
- responsive y accesibilidad básica;
- interacción con otras funciones.

### 5. Revisión de configuraciones de usuario

Audita todas las opciones configurables. Para cada una indica:

- qué problema resuelve;
- si el nombre y la descripción son comprensibles;
- valor por defecto y motivo;
- dependencia con otras opciones;
- combinación inválida o peligrosa;
- posibilidad de restablecer valores;
- impacto real en la aplicación;
- si conviene mostrarla siempre, dentro de “opciones avanzadas” o eliminarla.

Conserva la libertad del usuario, pero aplica progresive disclosure, buenos valores iniciales, explicaciones breves, agrupación lógica, validación inmediata y confirmación en acciones destructivas. No conviertas la flexibilidad en un panel confuso lleno de opciones técnicas.

### 6. Objetivos: funcionalidad, motivación y diversión

Revisa a fondo el menú y el modelo de objetivos. Propón e implementa, si encaja con el producto, una experiencia clara que permita:

- crear objetivos con nombre, categoría, importe o métrica, fecha, periodicidad y prioridad;
- definir objetivos únicos, recurrentes y por etapas;
- ver progreso real, restante, porcentaje, tendencia y fecha estimada;
- registrar avances manuales o derivados de la actividad existente, sin duplicar datos;
- editar, pausar, reanudar, archivar y completar objetivos;
- mostrar hitos, rachas, niveles, pequeños logros o celebraciones de forma opcional y no manipuladora;
- recibir recordatorios configurables y fáciles de desactivar;
- gestionar objetivos atrasados, cancelados y sin actividad;
- evitar culpa, presión artificial, gamificación excesiva y métricas que no aporten valor.

Presenta al menos dos alternativas de diseño si la dirección actual no es claramente la mejor. Recomienda una, explica sus trade-offs y valida el recorrido completo: crear, avanzar, consultar, modificar, pausar, completar y recuperar un objetivo.

### 7. Informes por periodo

Verifica que los informes funcionen correctamente por día, semana, mes y año. Para cada periodo revisa:

- selector y navegación de fechas;
- definición exacta de inicio y fin del periodo;
- zona horaria del usuario;
- datos incompletos y periodos sin actividad;
- sumas, recuentos, medias y porcentajes;
- comparación con el periodo anterior cuando tenga sentido;
- filtros por categoría, subcategoría y otros criterios existentes;
- coherencia entre tarjetas, tablas y gráficos;
- rendimiento con más datos;
- textos, unidades, redondeos y divisa;
- responsive, accesibilidad y estados de error.

Si falta alguna modalidad, implementa la funcionalidad o deja documentado el plan exacto y la razón del bloqueo. No dupliques lógica de agregación sin una justificación clara.

### 8. Categorías y subcategorías

Analiza el modelo actual comparándolo con patrones de aplicaciones de gestión financiera como Money Manager y otras aplicaciones relevantes.

El modelo debe poder soportar:

- categorías base coherentes y fáciles de entender;
- dos o tres subcategorías iniciales cuando aporten valor;
- categorías y subcategorías personalizadas por usuario en el futuro;
- edición, archivo y recuperación sin romper históricos;
- prevención de duplicados y nombres ambiguos;
- orden y visualización consistentes;
- migración segura si cambia la estructura;
- relación clara con informes y objetivos.

Deja preparada la arquitectura para que las categorías personalizadas puedan convertirse más adelante en una capacidad premium, pero no bloquees ahora su desarrollo ni mezcles permisos premium con la lógica de negocio principal.

### 9. Preparación para funciones premium

Desarrolla todas las funciones ahora y prepara únicamente la arquitectura de monetización futura. Como mínimo, documenta una propuesta para:

- planes, capacidades y permisos como conceptos separados;
- catálogo de capacidades o feature flags;
- entitlements por usuario/equipo si el producto los necesita;
- autorización real en backend y base de datos, no solo ocultación visual;
- RLS y políticas compatibles con futuras capacidades premium;
- interfaz preparada para mostrar límites o mejoras sin bloquear la funcionalidad actual;
- migración de usuarios existentes cuando se active monetización;
- auditoría de cambios y compatibilidad hacia atrás.

No integres pagos ni bloquees funciones salvo que se solicite expresamente. Evita valores `if premium` repartidos por toda la aplicación: centraliza las capacidades y hazlas testeables.

### 10. Revisión con Design Arc

Aplica este flujo:

1. Define el objetivo de producto y el criterio de éxito.
2. Audita el recorrido real actual, desde la entrada hasta el resultado.
3. Registra pantallas, pasos, estados materiales, fricciones y evidencia.
4. Consulta guías y benchmarks actuales cuando estén disponibles y cita las fuentes.
5. Propón una dirección recomendada y alternativas con sus trade-offs.
6. Valida todos los estados, no solo el caso feliz: carga, vacío, error, permiso, validación, recuperación, móvil y escritorio.
7. Corrige la deriva visual y funcional en rondas agrupadas.
8. Emite un veredicto por flujo: `cumple`, `cumple con correcciones`, `no cumple` o `bloqueado`.

No confundas una captura bonita con una validación de implementación. Documenta qué está probado visualmente, qué está probado técnicamente y qué queda pendiente.

### 11. Investigación de mercado

Investiga varias aplicaciones actuales y relevantes de gestión financiera, objetivos, hábitos o productividad, según las funciones comparadas. Para cada referencia registra:

`Aplicación | Función observada | Fuente | Patrón | Ventaja | Riesgo | Adaptación propuesta | Motivo de no copiar literalmente`.

Prioriza fuentes actuales y fiables. No conviertas la investigación en una colección de capturas: extrae patrones útiles, compáralos con la aplicación existente y aplica solo lo que mejore claridad, utilidad o retención saludable.

### 12. Diagramas en Miro

Crea dos entregables separados y mantenibles.

#### Diagrama de flujo de la aplicación

Incluye, como mínimo: entrada, autenticación, onboarding, dashboard, actividad principal, categorías, objetivos, informes, configuración, estados de error, permisos, salida y recuperación. Marca decisiones, rutas alternativas, datos que se escriben, datos que se consultan y puntos donde se producen errores.

#### Diagrama de base de datos

Incluye tablas, propósito, campos relevantes, tipos, PK, FK, cardinalidades, índices importantes, relación con usuarios, RLS/políticas, vistas, funciones, triggers y dependencias con frontend/backend. Señala tablas previstas para capacidades premium y cualquier deuda o riesgo.

En ambos diagramas:

- usa nombres idénticos a los del código y Supabase;
- añade una leyenda;
- indica fecha de revisión y versión;
- marca elementos confirmados y elementos pendientes;
- evita incluir secretos o datos personales reales;
- entrega también una versión Mermaid o textual en el repositorio para que el mantenimiento no dependa exclusivamente de Miro.

### 13. Implementación y validación

Clasifica los hallazgos:

- `P0 crítico`: seguridad, pérdida/corrupción de datos, bloqueo de acceso o fallo de una función esencial.
- `P1 importante`: fallo funcional relevante, inconsistencia grave, mala experiencia recurrente o riesgo técnico significativo.
- `P2 mejora`: refinamiento de UX/UI, rendimiento no crítico, documentación o mejora futura.

Corrige primero P0, después P1 y finalmente P2 según esfuerzo y valor. Tras cada corrección:

1. ejecuta las pruebas pertinentes;
2. vuelve a probar el flujo en el localhost;
3. comprueba consola, red y logs;
4. verifica persistencia y permisos;
5. revisa que no haya regresiones en otras rutas;
6. actualiza la matriz funcional y la evidencia.

Incluye pruebas unitarias, integración y end-to-end donde sean razonables. Ejecuta lint, typecheck, build y tests disponibles. Si alguna comprobación no puede ejecutarse, explica exactamente por qué.

## Entregables obligatorios

Entrega al final:

1. Resumen ejecutivo con el estado real del proyecto.
2. Inventario de rutas, funciones y dependencias.
3. Matriz funcional completa.
4. Auditoría visual y de Design Arc.
5. Auditoría backend, Supabase, seguridad y rendimiento.
6. Lista de cambios implementados con archivos afectados.
7. Evidencias de pruebas: comandos, resultados, rutas, consultas, capturas o logs relevantes.
8. Problemas pendientes clasificados como P0, P1 y P2.
9. Recomendación concreta para objetivos, configuraciones, categorías e informes.
10. Diseño arquitectónico para futuras capacidades premium.
11. Investigación comparativa del mercado con fuentes y decisiones derivadas.
12. Diagrama de flujo en Miro y versión portable.
13. Diagrama de base de datos en Miro y versión portable.
14. Riesgos, supuestos y bloqueos.
15. Ideas adicionales de alto valor que no estaban en el alcance inicial.
16. Checklist de aceptación final.
17. Recomendaciones de mantenimiento y próximos pasos.

## Formato del informe final

Usa esta estructura:

```text
# Informe de cierre de desarrollo

## 1. Veredicto general
Estado: LISTO / LISTO CON PENDIENTES / NO LISTO / BLOQUEADO
Resumen:

## 2. Evidencia y entorno revisado
Commit o versión, localhost, usuario de prueba, fecha, navegador, viewport y limitaciones.

## 3. Hallazgos críticos
Tabla: ID | Prioridad | Área | Problema | Impacto | Evidencia | Corrección | Estado.

## 4. Hallazgos importantes
Misma tabla.

## 5. Mejoras futuras
Valor esperado, esfuerzo estimado y dependencia.

## 6. Funcionalidades verificadas
Tabla de la matriz funcional y resultado de las pruebas.

## 7. Frontend y experiencia
Flujos revisados, estados, responsive, accesibilidad y decisión de Design Arc.

## 8. Backend y Supabase
Esquema, RLS, Auth, consultas, errores, rendimiento, migraciones y advisors.

## 9. Objetivos, configuraciones, informes y categorías
Decisiones tomadas, cambios y pendientes.

## 10. Preparación premium
Capacidades, permisos, feature flags y límites actuales.

## 11. Investigación de mercado
Fuentes, patrones y decisiones aplicadas.

## 12. Diagramas
Enlaces o referencias de Miro y archivos portables.

## 13. Cambios implementados
Archivos, migraciones, pruebas y posibles efectos.

## 14. Riesgos y bloqueos
Riesgo, probabilidad, impacto, mitigación y responsable.

## 15. Ideas adicionales de alto valor

## 16. Checklist de aceptación
Cada punto: PASS / FAIL / BLOCKED, con evidencia.

## 17. Próximos pasos recomendados
Ordenados por prioridad.
```

## Criterio de finalización

La fase de desarrollo solo puede declararse terminada cuando:

- el localhost se ha revisado visualmente;
- las funciones esenciales tienen evidencia de funcionamiento;
- no quedan P0 abiertos;
- los P1 restantes están explícitamente aceptados y planificados;
- frontend, backend, Supabase y permisos han sido revisados;
- informes diario, semanal, mensual y anual están comprobados o bloqueados con una razón documentada;
- objetivos, configuraciones y categorías tienen una decisión de producto clara;
- la arquitectura está preparada para futuras funciones premium;
- los dos diagramas están actualizados y son mantenibles;
- las pruebas y limitaciones están documentadas;
- ninguna afirmación del informe carece de evidencia o etiqueta de incertidumbre.

Comienza ahora por la preparación e inventario, abre el localhost y no emitas el veredicto final hasta completar todas las fases que sean posibles y documentar cualquier bloqueo.
