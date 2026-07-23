import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";

/* ============================================================
   SISTEMA DE AUDITORÍAS · ACTIVOS · ACCIONES CORRECTIVAS/PREVENTIVAS
   Persistencia vía window.storage (shared)

   NOTA DE ARQUITECTURA
   Esta app no tiene backend/SQL propio: usa window.storage (clave/valor)
   como capa de persistencia, igual que la versión original. Las "tablas"
   solicitadas (TiposAuditoria, PlantillasAuditoria, Activos, Acciones,
   EvidenciasAcciones, HistorialAcciones) se modelan como claves de storage:
     - "tipos-auditoria"  -> catálogo de tipos + su plantilla (secciones/criterios)
     - "activos"          -> catálogo de activos
     - "acciones"         -> acciones correctivas/preventivas (incluye
                              evidencias e historial embebidos por acción)
     - "audit-index" / "audit:<id>"  -> igual que antes (no se tocó)
     - "sucursales" / "users" / "config" -> igual que antes
   ============================================================ */

/* ---------- Paleta corporativa ---------- */
const C = {
  navy: "#12245C",
  navyDeep: "#0B1740",
  royal: "#1E3A9C",
  royalLight: "#3457C9",
  sky: "#EEF1FB",
  paper: "#FFFFFF",
  line: "#DCE1F2",
  ink: "#101833",
  slate: "#5B6584",
  gold: "#C9A24B",
};

/* ============================================================
   ESCALA DE EVALUACIÓN POR CRITERIO: 0 a 5
   (según matriz oficial en Excel: Reactivo/Base=0, Nivel 1..5)
   La calificación final de cada auditoría se sigue mostrando en 0–10:
   Promedio obtenido (0–5) x 2 = Calificación final (0–10)
   ============================================================ */
const ESCALA = [
  { v: 5, label: "Excelente - Revista", color: "#1E8F4E" },
  { v: 4, label: "Bien - Estándar OK", color: "#7CB93B" },
  { v: 3, label: "Regular", color: "#E6B93B" },
  { v: 2, label: "Malo", color: "#E28A34" },
  { v: 1, label: "Crítico", color: "#C22B2B" },
  { v: 0, label: "Reactivo / Defectuoso base", color: "#9E1F1F" },
];
const scaleColor = (v) => (ESCALA.find((e) => e.v === v) || {}).color || "#B7BEDA";

const NIVELES_FINALES = [
  { min: 9.5, max: 10, label: "Excelente", color: "#1E8F4E" },
  { min: 8.5, max: 9.49, label: "Muy bueno", color: "#3AA65A" },
  { min: 7.0, max: 8.49, label: "Bueno", color: "#A9C93B" },
  { min: 6.0, max: 6.99, label: "Aceptable", color: "#E6B93B" },
  { min: 5.0, max: 5.99, label: "Regular", color: "#E28A34" },
  { min: 0, max: 4.99, label: "Crítico", color: "#C22B2B" },
];
function nivelDe(score) {
  if (score == null || isNaN(score)) return { label: "—", color: "#B7BEDA" };
  const n = NIVELES_FINALES.find((n) => score >= n.min && score <= n.max);
  return n || NIVELES_FINALES[NIVELES_FINALES.length - 1];
}

/* ============================================================
   PLANTILLA DEL SISTEMA: "Auditoría Integral Sucursal e Inventarios"
   NO ELIMINAR — esta es la auditoría original, ahora convertida en la
   primera plantilla dentro del catálogo de Tipos de Auditoría.
   Cada criterio conserva su "reactivo" (nivel 0) y sus 5 "niveles"
   (1 a 5), tal como en la matriz oficial del Excel.
   ============================================================ */
const SECCIONES_INTEGRAL = [
  {
    id: "peps",
    name: "PEPS / FIFO",
    criteria: [
      { key: "etiquetado_color", name: "Etiquetado por color de periodo", reactivo: "Sin etiquetas o color incorrecto en la mayoría.", niveles: ["Etiquetado en menos del 50% de los productos.", "Etiquetado en 50–80%, con errores frecuentes.", "Etiquetado en más del 80%, errores aislados.", "100% etiquetado con el color correcto.", "Control visual impecable por periodos."] },
      { key: "material_antiguedad", name: "Material acomodado por antigüedad", reactivo: "Sin ningún orden por antigüedad.", niveles: ["Orden solo en algunas zonas aisladas.", "Orden parcial, varias zonas sin respetar FIFO.", "FIFO respetado casi en todo el almacén.", "FIFO respetado al 100%.", "Rotación perfecta y sistemática."] },
      { key: "identificacion_fecha", name: "Identificación de producto y fecha", reactivo: "Imposible ubicar fechas o productos.", niveles: ["Se requiere mucho tiempo/búsqueda.", "Se ubica con cierta dificultad.", "Se ubica con facilidad, mínimo esfuerzo.", "Identificación inmediata y visible.", "Lectura e identificación instantánea."] },
      { key: "sin_errores_etiquetado", name: "Sin errores de etiquetado", reactivo: "Más del 30% con error o sin etiqueta.", niveles: ["Entre 20–30% con error.", "Entre 10–20% con error.", "Entre 1–10% con error.", "0% de error en muestras.", "Cero errores de etiquetado en auditoría."] },
      { key: "estado_fisico_producto", name: "Estado físico del producto", reactivo: "Daño grave generalizado (golpes, empaque roto).", niveles: ["Daños visibles en varios productos.", "Daños menores aislados.", "Buen estado, detalles mínimos.", "Perfecto estado físico.", "Empaques e integridad impecable."] },
    ],
  },
  {
    id: "cinco_s",
    name: "5'S",
    criteria: [
      { key: "seiri", name: "Seiri (Clasificación)", reactivo: "Todo mezclado; exceso de objetos innecesarios u obsoletos.", niveles: ["Objetos innecesarios acumulados en esquinas.", "Clasificación básica, algunos objetos dudosos sin retirar.", "Casi todo clasificado; tarjetas rojas aplicadas.", "Solo lo necesario en el área; nada obsoleto.", "Área libre de cualquier elemento innecesario."] },
      { key: "seiton", name: "Seiton (Orden)", reactivo: "Sin lugares asignados; herramientas tiradas o perdidas.", niveles: ["Lugares asignados de palabra pero no respetados.", "Identificación parcial de siluetas o estanterías.", "Áreas bien delimitadas; desvíos mínimos.", "Un lugar para cada cosa y delimitado.", "Ubicación e identificación perfecta al 100%."] },
      { key: "seiso", name: "Seiso (Limpieza)", reactivo: "Suciedad extrema, basura en el piso y polvo arraigado.", niveles: ["Limpieza esporádica; polvo visible.", "Se limpia al final del turno; fuentes activas.", "Áreas limpias; se identifican fuentes.", "Limpieza impecable; rutina establecida.", "Impecabilidad visual total en toda el área."] },
      { key: "seiketsu", name: "Seiketsu (Estandarización)", reactivo: "No existen manuales, ayudas visuales ni estándares.", niveles: ["Estándares escritos pero nadie los conoce ni sigue.", "Ayudas visuales básicas colocadas pero desactualizadas.", "Instrucciones visuales claras en la mayoría.", "Estándares visuales perfectos y legibles.", "Estandarización visual total y autosustentable."] },
      { key: "shitsuke", name: "Shitsuke (Disciplina)", reactivo: "El personal ignora las reglas por completo.", niveles: ["Se requiere supervisión constante para mantener el orden.", "El personal cumple solo cuando se le indica.", "Hábito generalizado; pequeños descuidos corregidos.", "Cultura de mejora continua; disciplina autónoma.", "Hábitos 5'S totalmente arraigados en el equipo."] },
    ],
  },
  {
    id: "seguridad",
    name: "Seguridad y espacio",
    criteria: [
      { key: "pasillos_libres", name: "Pasillos libres", reactivo: "Pasillos completamente bloqueados con pallets o cajas.", niveles: ["Obstrucción en más del 50% de los pasillos.", "Bloqueos intermitentes por mercancía en tránsito.", "Pasillos despejados; detalles mínimos temporales.", "100% libres de obstáculos.", "Pasillos impecables, libres y señalizados."] },
      { key: "extintores_botiquin", name: "Extintores y botiquín", reactivo: "Faltantes, vencidos u obstruidos totalmente.", niveles: ["Existentes pero sin revisiones y acceso difícil.", "Vigentes pero con señalización deficiente.", "Completos, señalizados y libres; falta firma.", "Vigentes, 100% accesibles y señalizados.", "Equipos de emergencia perfectos con bitácora al día."] },
      { key: "salidas_emergencia", name: "Salidas de emergencia", reactivo: "Bloqueadas por completo o bajo llave sin acceso.", niveles: ["Señalizadas pero con objetos estorbando el paso.", "Despejadas pero con apertura difícil.", "Libres y operativas; detalles mínimos.", "100% despejadas y operativas.", "Accesos impecables y libres."] },
      { key: "racks_anaqueles", name: "Racks y anaqueles", reactivo: "Con deformaciones graves, sueltos o riesgo de colapso.", niveles: ["Golpes visibles y sin anclaje al piso.", "Sobrecargados en niveles superiores sin señal de peso.", "Firmes y anclados; detalles estéticos mínimos.", "Anclados y con capacidad de carga visible.", "Racks perfectos estructuralmente y rotulados."] },
      { key: "condiciones_seguridad", name: "Condiciones de seguridad", reactivo: "Personal expuesto a riesgos sin EPP; cables expuestos.", niveles: ["EPP incompleto; uso de herramientas hechizas.", "Instalaciones eléctricas seguras pero informales.", "Condiciones seguras en general; desvíos mínimos.", "Cero riesgos; EPP completo e instalaciones perfectas.", "Cultura de prevención total y cero riesgos activos."] },
    ],
  },
  {
    id: "sucursal",
    name: "Estado de sucursal y mobiliario",
    criteria: [
      { key: "fachada", name: "Fachada e instalaciones", reactivo: "Fachada dañada, pintura desprendida, vidrios rotos.", niveles: ["Falta pintura y mantenimiento severo de anuncios.", "Pintura gastada por el sol pero estructura sana.", "Limpia y con buena presentación; detalles mínimos.", "Excelente estado, pintada y limpia.", "Fachada perfecta que cumple al 100% el estándar corporativo."] },
      { key: "iluminacion_pisos", name: "Iluminación y pisos", reactivo: "Más del 50% de luces fundidas; baches peligrosos.", niveles: ["Iluminación deficiente; pisos agrietados.", "Luces intermitentes; pisos limpios con desgaste.", "Máximo 1 o 2 luminarias fundidas; pisos sanos.", "Iluminación total al 100%; pisos impecables.", "Visibilidad perfecta y pisos libres de imperfecciones."] },
      { key: "estacionamiento", name: "Estacionamiento", reactivo: "Sin cajones marcados; basura acumulada y baches.", niveles: ["Líneas casi invisibles; baches menores.", "Cajones identificados pero falta delimitar áreas.", "Funcionales pero requieren pintura o ajuste.", "Perfectamente señalizado, limpio y sin baches.", "Cajones, flechas y áreas exclusivas impecables."] },
      { key: "estanterias_mostrador", name: "Estanterías y mostrador", reactivo: "Mobiliario roto, astillado o inestable con riesgo.", niveles: ["Rayados profundamente, sucios y con óxido visible.", "Funcionales pero requieren pintura y ajuste.", "Limpios y firmes; ligeras marcas de uso.", "Impecables, estéticos y limpios diariamente.", "Mobiliario de exhibición en perfecto estado de revista."] },
      { key: "estado_mobiliario", name: "Estado general del mobiliario", reactivo: "Sillas rotas, escritorios inservibles.", niveles: ["Mobiliario obsoleto y acumulado sin dar de baja.", "Desgaste avanzado en sillas de atención.", "Buen estado general; mantenimiento preventivo.", "Mobiliario ergonómico y funcional.", "Todo el mobiliario operativo en óptimas condiciones."] },
    ],
  },
  {
    id: "imagen",
    name: "Imagen y presentación",
    criteria: [
      { key: "uniforme", name: "Uniforme del personal", reactivo: "Nadie usa uniforme o está en condiciones deplorables.", niveles: ["Menos del 50% usa uniforme completo.", "Uniforme completo pero sin gafete o calzado no oficial.", "Uniforme completo y limpio; mínimos desvíos.", "100% del personal con uniforme oficial y limpio.", "Presentación impecable alineada al código de vestimenta."] },
      { key: "limpieza_mostrador", name: "Limpieza de mostrador", reactivo: "Lleno de polvo, manchas, tazas de café y desorden.", niveles: ["Papelería acumulada de días anteriores.", "Despejado al frente pero papelería mínima internamente.", "Limpio y ordenado; papelería necesaria.", "Impecable, libre de objetos personales.", "Estación de servicio sanitizada y despejada al 100%."] },
      { key: "promociones", name: "Promociones visibles", reactivo: "No hay promociones o están rotas y vencidas.", niveles: ["Promociones vencidas aún exhibidas al público.", "Pocas promociones colocadas; sin orden visual.", "Promociones vigentes; falta mejorar ubicación.", "Promociones del mes actualizadas y visibles.", "Material POP vigente y con alto impacto."] },
      { key: "senalizacion", name: "Señalización", reactivo: "Ausente; los clientes no ubican las áreas de la tienda.", niveles: ["Señalización improvisada con hojas impresas o a mano.", "Señalización corporativa incompleta o maltratada.", "Señalización corporativa completa; detalles mínimos de alineación.", "Señalización clara, corporativa y limpia.", "Guías visuales perfectas y homologadas según manual."] },
      { key: "imagen_corporativa", name: "Imagen corporativa", reactivo: "Violación total de los colores y logotipos de la marca.", niveles: ["Uso de logotipos obsoletos o combinación libre.", "Elementos de marca presentes pero con contaminación.", "Buena identidad; se respeta el manual de marca.", "Cumplimiento exacto de la identidad.", "Atmósfera corporativa excelente y unificada."] },
    ],
  },
  {
    id: "equipo",
    name: "Equipo y herramientas",
    criteria: [
      { key: "herramientas_disponibles", name: "Herramientas disponibles", reactivo: "No hay herramientas básicas para operar.", niveles: ["Herramientas insuficientes; el personal se turna.", "Herramientas completas pero guardadas sin control.", "Inventario completo; retrasos mínimos de localización.", "Herramientas completas y disponibles al instante.", "Kit completo con checklist de asignación diaria."] },
      { key: "buen_estado_fisico", name: "Buen estado físico", reactivo: "Herramientas oxidadas, rotas o peligrosas.", niveles: ["Falta mantenimiento correctivo; mangos flojos.", "Desgaste visible que no impide el uso.", "Buen estado; limpieza periódica evidente.", "Herramientas completas, calibradas y cuidadas.", "Equipos con rendimiento constante y sin fallas."] },
      { key: "funcionamiento_correcto", name: "Funcionamiento correcto", reactivo: "Los equipos principales no encienden o fallan.", niveles: ["Fallas constantes que interrumpen el servicio.", "Funcionamiento intermitente; requiere trucos.", "Operación normal; fallas muy esporádicas.", "Funcionamiento óptimo al 100% de capacidad.", "Funcionamiento óptimo y sin fallas."] },
      { key: "uso_adecuado", name: "Uso adecuado", reactivo: "Uso negligente que daña el equipo o pone en riesgo.", niveles: ["Falta de capacitación en el uso de herramientas.", "Uso correcto sin seguir manuales oficiales.", "Personal capacitado, uso adecuado casi total.", "Uso técnico exacto siguiendo protocolos.", "Cero malas prácticas en el manejo del equipamiento."] },
      { key: "computadoras_impresoras", name: "Computadoras e impresoras", reactivo: "Inservibles; no permiten facturar ni cobrar.", niveles: ["Extremadamente lentas; causan filas de clientes.", "Operativas pero fallan impresoras de tickets.", "Equipos rápidos, detalles menores de red.", "Sistemas al día, equipos rápidos y de red.", "Atención ultra rápida, cero demoras."] },
    ],
  },
];

/* ============================================================
   CATÁLOGO DE TIPOS DE AUDITORÍA (dinámico, editable sin tocar código)
   Se persiste en storage bajo la clave "tipos-auditoria". Este arreglo
   sólo se usa como semilla inicial la primera vez que corre la app.
   ============================================================ */
const TIPOS_AUDITORIA_SEED = [
  {
    id: "integral",
    nombre: "Auditoría Integral Sucursal e Inventarios",
    descripcion: "Plantilla original del sistema: PEPS/FIFO, 5'S, seguridad y espacio, estado de sucursal, imagen y presentación, equipo y herramientas.",
    sistema: true,
    activo: true,
    moduloInventario: true,
    secciones: SECCIONES_INTEGRAL,
  },
  { id: "vehiculos", nombre: "Auditoría de Vehículos", descripcion: "", sistema: false, activo: true, moduloInventario: false, secciones: [] },
  { id: "seguridad_tipo", nombre: "Auditoría de Seguridad", descripcion: "", sistema: false, activo: true, moduloInventario: false, secciones: [] },
  { id: "inventarios_tipo", nombre: "Auditoría de Inventarios", descripcion: "", sistema: false, activo: true, moduloInventario: false, secciones: [] },
  { id: "otro", nombre: "Otro", descripcion: "Plantilla genérica editable.", sistema: false, activo: true, moduloInventario: false, secciones: [] },
];

const ALL_CRITERIA_OF = (secciones) => (secciones || []).flatMap((s) => s.criteria.map((c) => ({ ...c, sectionId: s.id, sectionName: s.name, id: `${s.id}__${c.key}` })));

/* ---------- Catálogos auxiliares: Activos y Acciones ---------- */
const TIPOS_ACTIVO = ["Vehículo", "Equipo", "Herramienta", "Mobiliario", "Maquinaria", "Otro"];
const ESTADOS_ACTIVO = ["Operativo", "En mantenimiento", "Fuera de servicio", "De baja"];
const PRIORIDADES = ["Alta", "Media", "Baja"];
const PRIORIDAD_COLOR = { Alta: "#C22B2B", Media: "#E28A34", Baja: "#3AA65A" };
const ESTADOS_ACCION = ["Abierta", "En proceso", "Pendiente de validación", "Cerrada"];
const ESTADO_ACCION_COLOR = {
  Abierta: { bg: "#FBE7E7", fg: "#B33030", bd: "#F0BEBE" },
  "En proceso": { bg: "#FFF4DE", fg: "#9A6A00", bd: "#F0D6A0" },
  "Pendiente de validación": { bg: "#EAF0FF", fg: "#1E3A9C", bd: "#C9D6F5" },
  Cerrada: { bg: "#E4F6EA", fg: "#1E7A3D", bd: "#B7E4C6" },
};

/* ---------- Storage helpers ---------- */
async function sGet(key, shared = true) {
  try {
    const r = await window.storage.get(key, shared);
    return r ? JSON.parse(r.value) : null;
  } catch (e) {
    return null;
  }
}
async function sSet(key, value, shared = true) {
  try {
    await window.storage.set(key, JSON.stringify(value), shared);
    return true;
  } catch (e) {
    console.error("storage set error", key, e);
    return false;
  }
}

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function diasRestantes(fechaCompromiso) {
  if (!fechaCompromiso) return null;
  const hoy = new Date(todayISO() + "T00:00:00");
  const f = new Date(fechaCompromiso + "T00:00:00");
  return Math.round((f - hoy) / 86400000);
}
function accionEstadoTiempo(accion) {
  if (!accion || accion.estado === "Cerrada") return "normal";
  const d = diasRestantes(accion.fechaCompromiso);
  if (d == null) return "normal";
  if (d < 0) return "vencida";
  if (d <= 3) return "proxima";
  return "normal";
}

function resizeImageFile(file, maxW = 640, quality = 0.55) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ============================================================
   ICONOS (SVG inline, minimal)
   ============================================================ */
const Icon = ({ name, size = 18, color = "currentColor" }) => {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    list: <><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></>,
    book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5v13Z" /><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-3" /></>,
    store: <><path d="M3 9l1.5-5h15L21 9" /><path d="M3 9h18v11H3z" /><path d="M9 20v-6h6v6" /></>,
    users: <><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20c0-3.6 3-6 6.5-6s6.5 2.4 6.5 6" /><circle cx="17.5" cy="8.5" r="2.6" /><path d="M21.5 20c0-2.7-1.9-5-4.7-5.7" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9c.4.5.9.8 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>,
    eye: <><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" /><circle cx="12" cy="12" r="3" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" /></>,
    download: <><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M5 21h14" /></>,
    camera: <><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13.5" r="3.5" /></>,
    trash: <><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></>,
    check: <><path d="M20 6 9 17l-5-5" /></>,
    chevronDown: <><path d="M6 9l6 6 6-6" /></>,
    x: <><path d="M18 6 6 18M6 6l12 12" /></>,
    info: <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
    filter: <><path d="M4 5h16M7 12h10M10 19h4" /></>,
    building: <><path d="M4 22V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v18" /><path d="M15 9h4a1 1 0 0 1 1 1v12" /><path d="M9 8h.01M9 12h.01M9 16h.01M4 22h16" /></>,
    arrowRight: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    arrowLeft: <><path d="M19 12H5M11 18l-6-6 6-6" /></>,
    box: <><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /><path d="m20.3 7-8.3-5-8.3 5 8.3 5 8.3-5Z" /><path d="M3.3 17V7l8.7 5v10z" /><path d="M20.3 17V7l-8.7 5v10z" /></>,
    sig: <><path d="M3 17s2-1 4-1 3 2 5 2 3-2 5-2 4 1 4 1" /><path d="M3 21h18" /></>,
    flag: <><path d="M4 22V4" /><path d="M4 4h14l-2 4 2 4H4" /></>,
    alert: <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>,
    layers: <><path d="m12 2 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5" /><path d="m3 17 9 5 9-5" /></>,
  };
  return <svg {...p}>{paths[name] || null}</svg>;
};

/* ============================================================
   COMPONENTES PEQUEÑOS
   ============================================================ */
function ScoreBadge({ score, size = "md" }) {
  const n = nivelDe(score);
  const pad = size === "sm" ? "2px 8px" : "3px 10px";
  const fs = size === "sm" ? 11 : 12.5;
  return (
    <span style={{ background: n.color + "22", color: n.color, border: `1px solid ${n.color}55`, padding: pad, borderRadius: 999, fontSize: fs, fontWeight: 700, whiteSpace: "nowrap" }}>
      {score != null && !isNaN(score) ? score.toFixed(1) : "—"} · {n.label}
    </span>
  );
}

/* Insignia para promedios de sección en escala 0–5 (antes de multiplicar x2) */
function SeccionScoreBadge({ avg, size = "sm" }) {
  const color = avg != null ? scaleColor(Math.round(avg)) : "#B7BEDA";
  const pad = size === "sm" ? "2px 8px" : "3px 10px";
  const fs = size === "sm" ? 11 : 12.5;
  return (
    <span style={{ background: color + "22", color, border: `1px solid ${color}55`, padding: pad, borderRadius: 999, fontSize: fs, fontWeight: 700, whiteSpace: "nowrap" }}>
      {avg != null && !isNaN(avg) ? avg.toFixed(1) : "—"} /5
    </span>
  );
}

function StatusPill({ status }) {
  const map = {
    Borrador: { bg: "#FFF4DE", fg: "#9A6A00", bd: "#F0D6A0" },
    Finalizada: { bg: "#E4F6EA", fg: "#1E7A3D", bd: "#B7E4C6" },
    Cancelada: { bg: "#FBE7E7", fg: "#B33030", bd: "#F0BEBE" },
  };
  const s = map[status] || map.Borrador;
  return <span style={{ background: s.bg, color: s.fg, border: `1px solid ${s.bd}`, padding: "2px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 700 }}>{status}</span>;
}

function EstadoAccionPill({ estado }) {
  const s = ESTADO_ACCION_COLOR[estado] || ESTADO_ACCION_COLOR.Abierta;
  return <span style={{ background: s.bg, color: s.fg, border: `1px solid ${s.bd}`, padding: "2px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap" }}>{estado}</span>;
}

function PrioridadPill({ prioridad }) {
  const color = PRIORIDAD_COLOR[prioridad] || C.slate;
  return <span style={{ background: color + "1a", color, border: `1px solid ${color}55`, padding: "2px 10px", borderRadius: 999, fontSize: 11, fontWeight: 800 }}>{prioridad}</span>;
}

function Card({ children, style, ...rest }) {
  return (
    <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 14, boxShadow: "0 1px 2px rgba(18,26,64,0.04)", ...style }} {...rest}>
      {children}
    </div>
  );
}

function Btn({ children, onClick, variant = "primary", size = "md", disabled, style, type = "button" }) {
  const sizes = { sm: "6px 12px", md: "10px 16px", lg: "12px 22px" };
  const fsizes = { sm: 12.5, md: 13.5, lg: 14.5 };
  const variants = {
    primary: { background: C.royal, color: "#fff", border: `1px solid ${C.royal}` },
    dark: { background: C.navy, color: "#fff", border: `1px solid ${C.navy}` },
    outline: { background: "#fff", color: C.royal, border: `1px solid ${C.royal}55` },
    ghost: { background: "transparent", color: C.slate, border: "1px solid transparent" },
    danger: { background: "#fff", color: "#C22B2B", border: "1px solid #E9B7B7" },
    subtle: { background: C.sky, color: C.navy, border: `1px solid ${C.line}` },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...variants[variant],
        padding: sizes[size],
        fontSize: fsizes[size],
        borderRadius: 9,
        fontWeight: 650,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        transition: "filter .15s",
        ...style,
      }}
      onMouseEnter={(e) => !disabled && (e.currentTarget.style.filter = "brightness(0.94)")}
      onMouseLeave={(e) => (e.currentTarget.style.filter = "none")}
    >
      {children}
    </button>
  );
}

function Field({ label, children, required, hint }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: C.navy, marginBottom: 5, letterSpacing: 0.2 }}>
        {label} {required && <span style={{ color: "#C22B2B" }}>*</span>}
      </div>
      {children}
      {hint && <div style={{ fontSize: 11, color: C.slate, marginTop: 4 }}>{hint}</div>}
    </label>
  );
}

const inputStyle = {
  width: "100%",
  padding: "9px 12px",
  border: `1px solid ${C.line}`,
  borderRadius: 8,
  fontSize: 13.5,
  color: C.ink,
  background: "#fff",
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

function Input(props) {
  return <input {...props} style={{ ...inputStyle, ...(props.style || {}) }} onFocus={(e) => (e.target.style.borderColor = C.royal)} onBlur={(e) => (e.target.style.borderColor = C.line)} />;
}
function Select(props) {
  return (
    <select {...props} style={{ ...inputStyle, ...(props.style || {}) }}>
      {props.children}
    </select>
  );
}
function TextArea(props) {
  return <textarea {...props} style={{ ...inputStyle, resize: "vertical", minHeight: 60, ...(props.style || {}) }} />;
}

function Modal({ title, onClose, children, width = 640 }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(11,23,64,0.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: width, maxHeight: "88vh", overflow: "auto", boxShadow: "0 20px 60px rgba(11,23,64,0.3)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ position: "sticky", top: 0, background: C.navy, color: "#fff", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderRadius: "16px 16px 0 0" }}>
          <div style={{ fontWeight: 750, fontSize: 15 }}>{title}</div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 8, padding: 6, cursor: "pointer", color: "#fff", display: "flex" }}>
            <Icon name="x" size={16} />
          </button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}

/* ---------- Firma canvas ---------- */
function SignaturePad({ value, onChange, height = 150 }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.strokeStyle = C.navy;
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, c.width, c.height);
      img.src = value;
    }
  }, []);

  const pos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: ((t.clientX - rect.left) / rect.width) * canvasRef.current.width, y: ((t.clientY - rect.top) / rect.height) * canvasRef.current.height };
  };
  const start = (e) => {
    e.preventDefault();
    drawing.current = true;
    last.current = pos(e);
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const c = canvasRef.current;
    const ctx = c.getContext("2d");
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(canvasRef.current.toDataURL("image/png"));
  };
  const clear = () => {
    const c = canvasRef.current;
    c.getContext("2d").clearRect(0, 0, c.width, c.height);
    onChange("");
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={500}
        height={height}
        style={{ width: "100%", height, border: `1.5px dashed ${C.line}`, borderRadius: 10, background: "#FCFDFF", touchAction: "none", cursor: "crosshair" }}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <div style={{ marginTop: 6 }}>
        <Btn variant="ghost" size="sm" onClick={clear}>
          <Icon name="trash" size={13} /> Limpiar firma
        </Btn>
      </div>
    </div>
  );
}

/* ---------- Selector de fotos genérico (para Activos y Acciones) ---------- */
function PhotoPicker({ photos, onChange, max = 4, size = 64, disabled }) {
  const add = async (files) => {
    const arr = Array.from(files).slice(0, max - (photos || []).length);
    const urls = [];
    for (const f of arr) {
      try {
        urls.push(await resizeImageFile(f));
      } catch (e) {}
    }
    onChange([...(photos || []), ...urls]);
  };
  const remove = (i) => onChange((photos || []).filter((_, idx) => idx !== i));
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {(photos || []).map((ev, i) => (
        <div key={i} style={{ position: "relative" }}>
          <img src={ev} alt="" style={{ width: size, height: size, objectFit: "cover", borderRadius: 8, border: `1px solid ${C.line}` }} />
          {!disabled && (
            <button onClick={() => remove(i)} style={{ position: "absolute", top: -6, right: -6, background: "#C22B2B", border: "2px solid #fff", color: "#fff", borderRadius: 999, width: 18, height: 18, fontSize: 10, cursor: "pointer" }}>✕</button>
          )}
        </div>
      ))}
      {!disabled && (photos || []).length < max && (
        <label style={{ width: size, height: size, borderRadius: 8, border: `1.5px dashed ${C.line}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.royal }}>
          <Icon name="camera" size={18} />
          <input type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files.length && add(e.target.files)} />
        </label>
      )}
    </div>
  );
}

/* ---------- Guía modal ---------- */
function GuiaModal({ criterio, onClose }) {
  return (
    <Modal title={`Guía de evaluación · ${criterio.name}`} onClose={onClose} width={720}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Reactivo / defectuoso base (nivel 0)</div>
      <div style={{ background: "#FBE7E7", border: "1px solid #F0BEBE", borderRadius: 10, padding: 12, fontSize: 13.5, color: "#7A2020", marginBottom: 16 }}>{criterio.reactivo}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Niveles de evaluación (1 a 5)</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {criterio.niveles.map((n, i) => (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", background: C.sky, borderRadius: 10, padding: 10 }}>
            <div style={{ minWidth: 26, height: 26, borderRadius: 999, background: scaleColor(i + 1), color: "#fff", fontSize: 11.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</div>
            <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.4 }}>{n}</div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function EscalaLegend({ compact }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {ESCALA.map((e) => (
        <div key={e.v} title={e.label} style={{ display: "flex", alignItems: "center", gap: 5, background: e.color + "1a", border: `1px solid ${e.color}55`, borderRadius: 8, padding: compact ? "3px 7px" : "4px 9px" }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: e.color }} />
          <span style={{ fontSize: 11, fontWeight: 800, color: C.ink }}>{e.v}</span>
          {!compact && <span style={{ fontSize: 10.5, color: C.slate }}>{e.label}</span>}
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   LOGIN
   ============================================================ */
function Login({ onLogin, users }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");

  const submit = (e) => {
    e.preventDefault();
    const u = users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === pass);
    if (!u) return setErr("Correo o contraseña incorrectos.");
    if (u.estatus === "Inactivo") return setErr("Este usuario está inactivo. Contacta al administrador.");
    setErr("");
    onLogin(u);
  };

  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(160deg, ${C.navyDeep}, ${C.royal})`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', system-ui, sans-serif", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 900, display: "flex", borderRadius: 20, overflow: "hidden", boxShadow: "0 30px 80px rgba(0,0,0,0.35)" }}>
        <div style={{ flex: 1, background: `linear-gradient(160deg, ${C.navy}, ${C.royalLight})`, color: "#fff", padding: "48px 40px", display: "flex", flexDirection: "column", justifyContent: "space-between", minWidth: 280 }}>
          <div>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 22 }}>
              <Icon name="layers" size={22} color="#fff" />
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.25 }}>Sistema de Auditorías, Activos y Acciones</div>
            <div style={{ fontSize: 13.5, opacity: 0.8, marginTop: 10, lineHeight: 1.6 }}>Plataforma interna para digitalizar auditorías de cualquier tipo, dar seguimiento a activos y gestionar acciones correctivas y preventivas.</div>
          </div>
          <div style={{ fontSize: 11.5, opacity: 0.65, marginTop: 30 }}>Uso exclusivo del equipo interno</div>
        </div>
        <div style={{ flex: 1, background: "#fff", padding: "48px 40px", minWidth: 300 }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: C.navy, marginBottom: 4 }}>Iniciar sesión</div>
          <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 24 }}>Ingresa con tu cuenta de auditor, administrador o responsable.</div>
          <form onSubmit={submit}>
            <Field label="Correo electrónico" required>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@empresa.com" required />
            </Field>
            <Field label="Contraseña" required>
              <Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••••••" required />
            </Field>
            {err && <div style={{ color: "#C22B2B", fontSize: 12.5, marginBottom: 12, fontWeight: 600 }}>{err}</div>}
            <Btn type="submit" style={{ width: "100%", justifyContent: "center" }} size="lg">
              Iniciar sesión
            </Btn>
          </form>
          <div style={{ marginTop: 22, padding: 12, background: C.sky, borderRadius: 10, fontSize: 11.5, color: C.slate, lineHeight: 1.6 }}>
            <b style={{ color: C.navy }}>Acceso demo</b><br />
            Administrador: admin@empresa.com / admin123<br />
            Auditor: auditor@empresa.com / auditor123<br />
            Responsable: responsable@empresa.com / resp123
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   LAYOUT / NAV
   ============================================================ */
function Sidebar({ view, setView, user, onLogout, config }) {
  const isAdmin = user.role === "Administrador";
  const isResp = user.role === "Responsable";
  const items = isResp
    ? [{ id: "acciones", label: "Mis acciones", icon: "flag" }]
    : [
        { id: "dashboard", label: "Dashboard", icon: "grid" },
        { id: "nueva", label: "Nueva auditoría", icon: "plus" },
        { id: "historial", label: "Historial", icon: "list" },
        { id: "guia", label: "Guía de evaluación", icon: "book" },
        { id: "activos", label: "Activos", icon: "box" },
        { id: "acciones", label: "Acciones", icon: "flag" },
        ...(isAdmin ? [{ id: "tipos", label: "Tipos de auditoría", icon: "layers" }] : []),
        { id: "sucursales", label: "Sucursales", icon: "store" },
        ...(isAdmin ? [{ id: "usuarios", label: "Usuarios", icon: "users" }] : []),
        ...(isAdmin ? [{ id: "config", label: "Configuración", icon: "settings" }] : []),
      ];
  return (
    <div style={{ width: 234, background: C.navyDeep, color: "#fff", display: "flex", flexDirection: "column", flexShrink: 0, minHeight: "100vh" }}>
      <div style={{ padding: "22px 20px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: C.royalLight, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon name="building" size={17} color="#fff" />
        </div>
        <div style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.2 }}>{config?.empresa || "Auditoría Integral"}</div>
      </div>
      <div style={{ flex: 1, padding: "14px 10px", display: "flex", flexDirection: "column", gap: 3 }}>
        {items.map((it) => (
          <button
            key={it.id}
            onClick={() => setView(it.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 9,
              border: "none",
              background: view === it.id ? "rgba(255,255,255,0.12)" : "transparent",
              color: view === it.id ? "#fff" : "rgba(255,255,255,0.68)",
              fontSize: 13.2,
              fontWeight: view === it.id ? 700 : 500,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <Icon name={it.icon} size={16} />
            {it.label}
          </button>
        ))}
      </div>
      <div style={{ padding: 14, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 999, background: C.gold, color: C.navy, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, flexShrink: 0 }}>
            {user.name.slice(0, 1).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.name}</div>
            <div style={{ fontSize: 10.5, opacity: 0.6 }}>{user.role}</div>
          </div>
        </div>
        <button onClick={onLogout} style={{ display: "flex", alignItems: "center", gap: 7, background: "rgba(255,255,255,0.08)", border: "none", color: "#fff", width: "100%", padding: "8px 10px", borderRadius: 8, fontSize: 12, fontWeight: 650, cursor: "pointer" }}>
          <Icon name="logout" size={14} /> Cerrar sesión
        </button>
      </div>
    </div>
  );
}

function PageHeader({ title, subtitle, right }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
      <div>
        <div style={{ fontSize: 21, fontWeight: 800, color: C.navy }}>{title}</div>
        {subtitle && <div style={{ fontSize: 13, color: C.slate, marginTop: 3 }}>{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div style={{ textAlign: "center", padding: "36px 12px", color: C.slate }}>
      <Icon name="box" size={30} color={C.line} />
      <div style={{ marginTop: 10, fontSize: 13 }}>{text}</div>
    </div>
  );
}

function StatCard({ label, value, icon, accent, small }) {
  return (
    <Card style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: C.sky, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name={icon} size={14} color={C.royal} />
        </div>
      </div>
      <div style={{ fontSize: small ? 17 : 26, fontWeight: 800, color: accent || C.navy }}>{value}</div>
    </Card>
  );
}

const th = { padding: "8px 10px", fontWeight: 700 };
const td = { padding: "9px 10px" };
const miniLabel = { fontSize: 11, fontWeight: 700, color: C.slate, marginBottom: 4 };

function IconBtn({ icon, title, onClick, danger }) {
  return (
    <button title={title} onClick={onClick} style={{ background: danger ? "#FBE7E7" : C.sky, border: "none", borderRadius: 7, padding: 6, marginRight: 5, cursor: "pointer", color: danger ? "#C22B2B" : C.royal, display: "inline-flex" }}>
      <Icon name={icon} size={14} />
    </button>
  );
}

/* ---------- Mini gráficas sin dependencias: barras y dona ---------- */
function GroupBarList({ data, title }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div>
      {title && <div style={{ fontWeight: 750, fontSize: 13, color: C.navy, marginBottom: 10 }}>{title}</div>}
      {data.length === 0 ? (
        <div style={{ fontSize: 12, color: C.slate }}>Sin datos.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.map((d) => (
            <div key={d.label}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: C.ink, marginBottom: 3 }}>
                <span style={{ fontWeight: 650 }}>{d.label}</span>
                <span style={{ color: C.slate }}>{d.value}</span>
              </div>
              <div style={{ background: C.sky, borderRadius: 6, height: 8, overflow: "hidden" }}>
                <div style={{ width: `${(d.value / max) * 100}%`, height: "100%", background: d.color || C.royal, borderRadius: 6 }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DonutChart({ data, size = 118 }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <div style={{ fontSize: 12, color: C.slate }}>Sin datos.</div>;
  let acc = 0;
  const stops = data
    .map((d) => {
      const start = (acc / total) * 360;
      acc += d.value;
      const end = (acc / total) * 360;
      return `${d.color} ${start}deg ${end}deg`;
    })
    .join(", ");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
      <div style={{ width: size, height: size, borderRadius: "50%", background: `conic-gradient(${stops})`, flexShrink: 0, position: "relative" }}>
        <div style={{ position: "absolute", inset: size * 0.22, borderRadius: "50%", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15, color: C.navy }}>{total}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {data.map((d) => (
          <div key={d.label} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: d.color }} />
            <span style={{ color: C.ink, fontWeight: 650 }}>{d.label}</span>
            <span style={{ color: C.slate }}>({d.value})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   DASHBOARD
   ============================================================ */
function Dashboard({ index, acciones, activos, tiposAuditoria, setView, startNueva, user }) {
  const stats = useMemo(() => {
    const total = index.length;
    const thisMonth = index.filter((a) => a.fecha && a.fecha.slice(0, 7) === todayISO().slice(0, 7)).length;
    const withScore = index.filter((a) => a.finalScore != null);
    const avg = withScore.length ? withScore.reduce((s, a) => s + a.finalScore, 0) / withScore.length : null;
    return { total, thisMonth, avg };
  }, [index]);

  const accStats = useMemo(() => {
    const abiertas = acciones.filter((a) => a.estado !== "Cerrada").length;
    const cerradas = acciones.filter((a) => a.estado === "Cerrada").length;
    const vencidas = acciones.filter((a) => accionEstadoTiempo(a) === "vencida").length;
    const proximas = acciones.filter((a) => accionEstadoTiempo(a) === "proxima").length;

    const byKey = (fn) => {
      const map = {};
      acciones.forEach((a) => {
        const k = fn(a) || "Sin asignar";
        map[k] = (map[k] || 0) + 1;
      });
      return Object.entries(map).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
    };
    const porResponsable = byKey((a) => a.asignadoA);
    const porLugar = byKey((a) => a.lugar);
    const porTipoAuditoria = byKey((a) => (tiposAuditoria.find((t) => t.id === a.tipoAuditoriaId)?.nombre) || (a.origen === "Independiente" ? "Independiente" : "—"));
    const porActivo = byKey((a) => (activos.find((x) => x.id === a.activoId)?.nombre) || null).filter((d) => d.label !== "Sin asignar");
    const porPrioridad = PRIORIDADES.map((p) => ({ label: p, value: acciones.filter((a) => a.prioridad === p).length, color: PRIORIDAD_COLOR[p] }));

    return { abiertas, cerradas, vencidas, proximas, porResponsable, porLugar, porTipoAuditoria, porActivo, porPrioridad };
  }, [acciones, activos, tiposAuditoria]);

  const recent = [...index].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "")).slice(0, 6);

  return (
    <div>
      <PageHeader title={`Hola, ${user.name.split(" ")[0]}`} subtitle="Resumen general de auditorías, activos y acciones." />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px,1fr))", gap: 14, marginBottom: 22 }}>
        <StatCard label="Auditorías totales" value={stats.total} icon="list" />
        <StatCard label="Auditorías este mes" value={stats.thisMonth} icon="grid" />
        <StatCard label="Promedio general" value={stats.avg != null ? stats.avg.toFixed(1) : "—"} icon="check" accent={stats.avg != null ? nivelDe(stats.avg).color : undefined} />
        <StatCard label="Activos registrados" value={activos.length} icon="box" />
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <Btn onClick={startNueva} size="lg"><Icon name="plus" size={16} /> Nueva auditoría</Btn>
        <Btn variant="outline" size="lg" onClick={() => setView("historial")}><Icon name="list" size={16} /> Ver historial</Btn>
        <Btn variant="subtle" size="lg" onClick={() => setView("guia")}><Icon name="book" size={16} /> Guía de evaluación</Btn>
        <Btn variant="subtle" size="lg" onClick={() => setView("acciones")}><Icon name="flag" size={16} /> Ver acciones</Btn>
      </div>

      <div style={{ fontWeight: 800, fontSize: 15.5, color: C.navy, marginBottom: 12 }}>Acciones correctivas y preventivas</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 14, marginBottom: 20 }}>
        <StatCard label="Abiertas" value={accStats.abiertas} icon="flag" />
        <StatCard label="Cerradas" value={accStats.cerradas} icon="check" accent="#1E7A3D" />
        <StatCard label="Vencidas" value={accStats.vencidas} icon="alert" accent="#C22B2B" />
        <StatCard label="Próximas a vencer" value={accStats.proximas} icon="alert" accent="#9A6A00" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px,1fr))", gap: 16, marginBottom: 20 }}>
        <Card style={{ padding: 18 }}><GroupBarList title="Acciones por responsable" data={accStats.porResponsable} /></Card>
        <Card style={{ padding: 18 }}><GroupBarList title="Acciones por lugar" data={accStats.porLugar} /></Card>
        <Card style={{ padding: 18 }}><GroupBarList title="Acciones por tipo de auditoría" data={accStats.porTipoAuditoria} /></Card>
        <Card style={{ padding: 18 }}><GroupBarList title="Acciones por activo" data={accStats.porActivo} /></Card>
        <Card style={{ padding: 18 }}>
          <div style={{ fontWeight: 750, fontSize: 13, color: C.navy, marginBottom: 10 }}>Acciones por prioridad</div>
          <DonutChart data={accStats.porPrioridad} />
        </Card>
      </div>

      <Card style={{ padding: 18 }}>
        <div style={{ fontWeight: 750, fontSize: 14.5, color: C.navy, marginBottom: 12 }}>Auditorías recientes</div>
        {recent.length === 0 ? (
          <EmptyState text="Aún no hay auditorías registradas. Crea la primera desde “Nueva auditoría”." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.8 }}>
              <thead>
                <tr style={{ textAlign: "left", color: C.slate, fontSize: 11 }}>
                  <th style={th}>Folio</th><th style={th}>Tipo</th><th style={th}>Sucursal</th><th style={th}>Fecha</th><th style={th}>Auditor</th><th style={th}>Calificación</th><th style={th}>Estatus</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((a) => (
                  <tr key={a.id} style={{ borderTop: `1px solid ${C.line}` }}>
                    <td style={td}><b>{a.folio}</b></td>
                    <td style={td}>{a.tipoNombre || "—"}</td>
                    <td style={td}>{a.sucursal}</td>
                    <td style={td}>{a.fecha}</td>
                    <td style={td}>{a.auditor}</td>
                    <td style={td}><ScoreBadge score={a.finalScore} size="sm" /></td>
                    <td style={td}><StatusPill status={a.estatus} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ============================================================
   HISTORIAL
   ============================================================ */
function Historial({ index, sucursales, tiposAuditoria, openAudit, editAudit, printAudit, deleteAudit, user }) {
  const [fFecha, setFFecha] = useState("");
  const [fSucursal, setFSucursal] = useState("");
  const [fAuditor, setFAuditor] = useState("");
  const [fEstatus, setFEstatus] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [q, setQ] = useState("");

  const auditores = [...new Set(index.map((a) => a.auditor).filter(Boolean))];

  const filtered = index.filter((a) => {
    if (fFecha && a.fecha !== fFecha) return false;
    if (fSucursal && a.sucursal !== fSucursal) return false;
    if (fAuditor && a.auditor !== fAuditor) return false;
    if (fEstatus && a.estatus !== fEstatus) return false;
    if (fTipo && a.tipoAuditoriaId !== fTipo) return false;
    if (q && !(a.folio + a.sucursal + a.responsable).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));

  return (
    <div>
      <PageHeader title="Historial de auditorías" subtitle={`${filtered.length} de ${index.length} auditorías`} />
      <Card style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 180px" }}>
            <div style={miniLabel}>Buscar</div>
            <Input placeholder="Folio, sucursal, responsable…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div style={{ flex: "1 1 140px" }}>
            <div style={miniLabel}>Fecha</div>
            <Input type="date" value={fFecha} onChange={(e) => setFFecha(e.target.value)} />
          </div>
          <div style={{ flex: "1 1 170px" }}>
            <div style={miniLabel}>Tipo de auditoría</div>
            <Select value={fTipo} onChange={(e) => setFTipo(e.target.value)}>
              <option value="">Todos</option>
              {tiposAuditoria.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </Select>
          </div>
          <div style={{ flex: "1 1 160px" }}>
            <div style={miniLabel}>Sucursal</div>
            <Select value={fSucursal} onChange={(e) => setFSucursal(e.target.value)}>
              <option value="">Todas</option>
              {sucursales.map((s) => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
            </Select>
          </div>
          <div style={{ flex: "1 1 150px" }}>
            <div style={miniLabel}>Auditor</div>
            <Select value={fAuditor} onChange={(e) => setFAuditor(e.target.value)}>
              <option value="">Todos</option>
              {auditores.map((a) => <option key={a} value={a}>{a}</option>)}
            </Select>
          </div>
          <div style={{ flex: "1 1 140px" }}>
            <div style={miniLabel}>Estatus</div>
            <Select value={fEstatus} onChange={(e) => setFEstatus(e.target.value)}>
              <option value="">Todos</option>
              <option>Borrador</option><option>Finalizada</option><option>Cancelada</option>
            </Select>
          </div>
          {(fFecha || fSucursal || fAuditor || fEstatus || fTipo || q) && (
            <Btn variant="ghost" size="sm" onClick={() => { setFFecha(""); setFSucursal(""); setFAuditor(""); setFEstatus(""); setFTipo(""); setQ(""); }}>Limpiar</Btn>
          )}
        </div>
      </Card>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 20 }}><EmptyState text="No se encontraron auditorías con esos filtros." /></div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.6 }}>
              <thead>
                <tr style={{ textAlign: "left", background: C.sky, color: C.navy }}>
                  {["Folio", "Tipo", "Fecha", "Sucursal", "Responsable", "Auditor", "Calificación", "% Cumpl.", "Nivel", "Balance", "Estatus", "Acciones"].map((h) => (
                    <th key={h} style={{ ...th, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id} style={{ borderTop: `1px solid ${C.line}` }}>
                    <td style={{ ...td, fontWeight: 700 }}>{a.folio}</td>
                    <td style={td}>{a.tipoNombre || "—"}</td>
                    <td style={td}>{a.fecha}</td>
                    <td style={td}>{a.sucursal}</td>
                    <td style={td}>{a.responsable}</td>
                    <td style={td}>{a.auditor}</td>
                    <td style={td}>{a.finalScore != null ? a.finalScore.toFixed(1) : "—"}</td>
                    <td style={td}>{a.percent != null ? a.percent.toFixed(0) + "%" : "—"}</td>
                    <td style={td}><ScoreBadge score={a.finalScore} size="sm" /></td>
                    <td style={{ ...td, color: (a.balance || 0) < 0 ? "#C22B2B" : C.ink }}>{a.balance != null ? `$${a.balance.toFixed(2)}` : "—"}</td>
                    <td style={td}><StatusPill status={a.estatus} /></td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      <IconBtn icon="eye" title="Ver" onClick={() => openAudit(a.id)} />
                      <IconBtn icon="edit" title="Editar" onClick={() => editAudit(a.id)} />
                      <IconBtn icon="download" title="Descargar PDF" onClick={() => printAudit(a.id)} />
                      {user.role === "Administrador" && <IconBtn icon="trash" title="Eliminar" onClick={() => deleteAudit(a.id)} danger />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ============================================================
   CRUD GENÉRICO (Sucursales / Usuarios)
   ============================================================ */
function CrudTable({ title, subtitle, items, columns, onSave, onDelete, emptyText, formFields, initialForm, canDelete = true, canEdit = true }) {
  const [modal, setModal] = useState(null); // null | {mode:'new'|'edit', data}
  const [form, setForm] = useState(initialForm);

  const openNew = () => { setForm(initialForm); setModal({ mode: "new" }); };
  const openEdit = (item) => { setForm(item); setModal({ mode: "edit" }); };
  const save = () => { onSave(form, modal.mode); setModal(null); };

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} right={canEdit && <Btn onClick={openNew}><Icon name="plus" size={15} /> Agregar</Btn>} />
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {items.length === 0 ? <div style={{ padding: 20 }}><EmptyState text={emptyText} /></div> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: C.sky, color: C.navy, textAlign: "left" }}>{columns.map((c) => <th key={c.key} style={th}>{c.label}</th>)}<th style={th}></th></tr></thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} style={{ borderTop: `1px solid ${C.line}` }}>
                  {columns.map((c) => <td key={c.key} style={td}>{c.render ? c.render(it) : it[c.key]}</td>)}
                  <td style={{ ...td, textAlign: "right" }}>
                    {canEdit && <IconBtn icon="edit" title="Editar" onClick={() => openEdit(it)} />}
                    {canDelete && <IconBtn icon="trash" title="Eliminar" onClick={() => onDelete(it.id)} danger />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {modal && (
        <Modal title={modal.mode === "new" ? "Agregar" : "Editar"} onClose={() => setModal(null)} width={480}>
          {formFields.map((f) => (
            <Field key={f.key} label={f.label} required={f.required}>
              {f.type === "select" ? (
                <Select value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                  {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </Select>
              ) : (
                <Input type={f.type || "text"} value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              )}
            </Field>
          ))}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
            <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
            <Btn onClick={save}>Guardar</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ============================================================
   GUÍA DE EVALUACIÓN (pantalla) — dinámica por tipo de auditoría
   ============================================================ */
function GuiaScreen({ tiposAuditoria }) {
  const conPlantilla = tiposAuditoria.filter((t) => (t.secciones || []).length > 0);
  const [tipoId, setTipoId] = useState((conPlantilla[0] || tiposAuditoria[0])?.id || "");
  const tipo = tiposAuditoria.find((t) => t.id === tipoId) || conPlantilla[0] || tiposAuditoria[0];
  const secciones = tipo?.secciones || [];
  const [sec, setSec] = useState("todas");
  const [openCrit, setOpenCrit] = useState(null);
  const list = sec === "todas" ? secciones : secciones.filter((s) => s.id === sec);

  return (
    <div>
      <PageHeader title="Guía de evaluación" subtitle="Consulta cómo se evalúa cada criterio, su reactivo y sus 5 niveles de cumplimiento, por tipo de auditoría." />
      <Card style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 260px" }}>
            <div style={miniLabel}>Tipo de auditoría</div>
            <Select value={tipoId} onChange={(e) => { setTipoId(e.target.value); setSec("todas"); }}>
              {tiposAuditoria.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </Select>
          </div>
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.navy, margin: "14px 0 8px" }}>Escala general de calificación por criterio (0–5)</div>
        <EscalaLegend />
        <div style={{ fontSize: 11.5, color: C.slate, marginTop: 10 }}>La calificación final de la auditoría se muestra en escala 0–10: promedio obtenido (0–5) × 2 = calificación final.</div>
      </Card>
      {secciones.length === 0 ? (
        <Card style={{ padding: 20 }}><EmptyState text="Esta plantilla aún no tiene secciones ni criterios definidos. Un administrador puede configurarlos en “Tipos de auditoría”." /></Card>
      ) : (
        <>
          <div style={{ marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn size="sm" variant={sec === "todas" ? "primary" : "subtle"} onClick={() => setSec("todas")}>Todas las secciones</Btn>
            {secciones.map((s) => (
              <Btn key={s.id} size="sm" variant={sec === s.id ? "primary" : "subtle"} onClick={() => setSec(s.id)}>{s.name}</Btn>
            ))}
          </div>
          {list.map((s) => (
            <Card key={s.id} style={{ padding: 16, marginBottom: 14 }}>
              <div style={{ fontWeight: 800, color: C.navy, fontSize: 14.5, marginBottom: 10 }}>{s.name}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 10 }}>
                {s.criteria.map((c) => (
                  <div key={c.key} style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 12, background: C.sky }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: C.ink, marginBottom: 6 }}>{c.name}</div>
                    <div style={{ fontSize: 11.5, color: C.slate, marginBottom: 8 }}>{c.reactivo}</div>
                    <Btn size="sm" variant="outline" onClick={() => setOpenCrit({ ...c, sectionName: s.name })}>Ver niveles</Btn>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </>
      )}
      {openCrit && <GuiaModal criterio={openCrit} onClose={() => setOpenCrit(null)} />}
    </div>
  );
}

/* ============================================================
   CÁLCULO DE AUDITORÍA (genérico por plantilla/secciones)
   ============================================================ */
function calcAudit(audit, secciones) {
  const list = secciones || [];
  const secAverages = list.map((s) => {
    const crits = s.criteria.map((c) => `${s.id}__${c.key}`);
    const vals = crits.map((id) => audit.scores?.[id]?.calificacion).filter((v) => v !== null && v !== undefined && v !== "");
    const avg = vals.length ? vals.reduce((a, b) => a + Number(b), 0) / vals.length : null; // escala 0–5
    return { id: s.id, name: s.name, avg };
  });
  const withVals = secAverages.filter((s) => s.avg != null);
  const avg5 = withVals.length ? withVals.reduce((a, s) => a + s.avg, 0) / withVals.length : null;
  const finalScore = avg5 != null ? avg5 * 2 : null; // escala 0–10
  const percent = finalScore != null ? (finalScore / 10) * 100 : null;
  const entrada = Number(audit.inventario?.entradaMonto || 0);
  const salida = Number(audit.inventario?.salidaMonto || 0);
  const balance = entrada - salida;
  return { secAverages, avg5, finalScore, percent, balance };
}

function emptyAudit(folio, user, tipoId) {
  return {
    id: uid(),
    folio,
    tipoAuditoriaId: tipoId || "",
    sucursal: "",
    fecha: todayISO(),
    responsable: "",
    auditor: user.name,
    estatus: "Borrador",
    createdBy: user.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    scores: {},
    inventario: { entradaNumero: "", entradaMonto: "", salidaNumero: "", salidaMonto: "" },
    comentarios: "",
    encargadoNombre: "",
    encargadoFirma: "",
    auditorNombre: user.name,
    auditorFirma: "",
  };
}

/* ============================================================
   ACCIONES CORRECTIVAS / PREVENTIVAS — formulario de creación/edición
   ============================================================ */
function AccionFormModal({ initial, sucursales, users, activos, user, origenFijo, contextInfo, onSave, onClose }) {
  const [form, setForm] = useState(() => ({
    titulo: initial?.titulo || "",
    descripcion: initial?.descripcion || "",
    asignadoA: initial?.asignadoA || "",
    lugar: initial?.lugar || "",
    activoId: initial?.activoId || "",
    prioridad: initial?.prioridad || "Media",
    fechaCompromiso: initial?.fechaCompromiso || "",
    evidencias: initial?.evidencias || [],
  }));
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const valido = form.titulo && form.descripcion && form.asignadoA && form.lugar && form.fechaCompromiso && form.prioridad;

  const submit = () => {
    if (!valido) return;
    const activo = activos.find((a) => a.id === form.activoId);
    onSave({
      ...form,
      activoNombre: activo ? activo.nombre : "",
      origen: origenFijo || "Independiente",
    });
  };

  return (
    <Modal title={initial?.id ? "Editar acción" : "Nueva acción correctiva / preventiva"} onClose={onClose} width={620}>
      {contextInfo && <div style={{ background: C.sky, border: `1px solid ${C.line}`, borderRadius: 10, padding: 10, fontSize: 12, color: C.navy, marginBottom: 14 }}>{contextInfo}</div>}
      <Field label="Título" required><Input value={form.titulo} onChange={(e) => set("titulo", e.target.value)} placeholder="Resumen breve del hallazgo o pendiente" /></Field>
      <Field label="Descripción detallada" required><TextArea rows={3} value={form.descripcion} onChange={(e) => set("descripcion", e.target.value)} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Responsable (asignado a)" required>
          <Input list="acc-users" value={form.asignadoA} onChange={(e) => set("asignadoA", e.target.value)} placeholder="Nombre del responsable" />
          <datalist id="acc-users">{users.map((u) => <option key={u.id} value={u.name} />)}</datalist>
        </Field>
        <Field label="Prioridad" required>
          <Select value={form.prioridad} onChange={(e) => set("prioridad", e.target.value)}>
            {PRIORIDADES.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </Field>
        <Field label="Lugar" required>
          <Select value={form.lugar} onChange={(e) => set("lugar", e.target.value)}>
            <option value="">Selecciona…</option>
            {sucursales.map((s) => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
          </Select>
        </Field>
        <Field label="Fecha de compromiso" required><Input type="date" value={form.fechaCompromiso} onChange={(e) => set("fechaCompromiso", e.target.value)} /></Field>
        <Field label="Activo relacionado (opcional)" hint="Solo si el hallazgo se refiere a un activo del catálogo.">
          <Select value={form.activoId} onChange={(e) => set("activoId", e.target.value)}>
            <option value="">Ninguno</option>
            {activos.map((a) => <option key={a.id} value={a.id}>{a.nombre} ({a.tipo})</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Evidencias fotográficas"><PhotoPicker photos={form.evidencias} onChange={(v) => set("evidencias", v)} /></Field>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
        <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
        <Btn disabled={!valido} onClick={submit}>Guardar acción</Btn>
      </div>
    </Modal>
  );
}

/* ---------- Detalle / seguimiento de una acción ---------- */
function AccionDetailModal({ accion, sucursales, users, activos, user, onSave, onDelete, onClose }) {
  const isResp = user.role === "Responsable";
  const canClose = user.role === "Administrador" || user.role === "Auditor";
  const canEditFull = !isResp;
  const canDelete = user.role === "Administrador";
  const misma = !isResp || accion.asignadoA === user.name;

  const [comentario, setComentario] = useState("");
  const [local, setLocal] = useState(accion);

  const registrar = (evento) => ({ fecha: new Date().toISOString(), usuario: user.name, evento });

  const persist = (patch, evento) => {
    const next = { ...local, ...patch, historial: [...(local.historial || []), registrar(evento)] };
    setLocal(next);
    onSave(next);
  };

  const cambiarEstado = (estado) => persist({ estado }, `Estado cambiado a "${estado}"`);
  const agregarComentario = () => {
    if (!comentario.trim()) return;
    const next = { ...local, comentarios: [...(local.comentarios || []), { fecha: new Date().toISOString(), usuario: user.name, texto: comentario.trim() }] };
    setLocal(next);
    onSave(next);
    setComentario("");
  };
  const agregarEvidencias = (fotos) => persist({ evidencias: fotos }, "Evidencia agregada");

  const tiempo = accionEstadoTiempo(local);
  const dias = diasRestantes(local.fechaCompromiso);

  return (
    <Modal title={local.titulo} onClose={onClose} width={700}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <EstadoAccionPill estado={local.estado} />
        <PrioridadPill prioridad={local.prioridad} />
        <span style={{ fontSize: 11.5, color: C.slate, alignSelf: "center" }}>Origen: {local.origen}{local.folioAuditoria ? ` · ${local.folioAuditoria}` : ""}</span>
        {tiempo === "vencida" && <span style={{ fontSize: 11, fontWeight: 800, color: "#C22B2B" }}>Vencida ({Math.abs(dias)} días)</span>}
        {tiempo === "proxima" && <span style={{ fontSize: 11, fontWeight: 800, color: "#9A6A00" }}>Vence en {dias} días</span>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 12.5, marginBottom: 14 }}>
        <div><b>Responsable:</b> {local.asignadoA}</div>
        <div><b>Lugar:</b> {local.lugar}</div>
        <div><b>Fecha compromiso:</b> {local.fechaCompromiso}</div>
        <div><b>Activo relacionado:</b> {local.activoNombre || "—"}</div>
        <div><b>Creado por:</b> {local.creadoPor}</div>
        <div><b>Fecha de creación:</b> {(local.fechaCreacion || "").slice(0, 10)}</div>
      </div>
      <div style={{ fontSize: 13, color: C.ink, background: C.sky, borderRadius: 10, padding: 12, marginBottom: 14 }}>{local.descripcion}</div>

      <Field label="Evidencias fotográficas"><PhotoPicker photos={local.evidencias} onChange={agregarEvidencias} disabled={false} /></Field>

      {canEditFull && (
        <Field label="Cambiar estado">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {ESTADOS_ACCION.map((e) => (
              <Btn key={e} size="sm" variant={local.estado === e ? "primary" : "subtle"} disabled={e === "Cerrada" && !canClose} onClick={() => cambiarEstado(e)}>{e}</Btn>
            ))}
          </div>
        </Field>
      )}
      {isResp && (
        <Field label="Marcar como terminada para revisión" hint="Solo puedes moverla a “Pendiente de validación”; el cierre final lo confirma un auditor o administrador.">
          <Btn size="sm" variant={local.estado === "Pendiente de validación" ? "primary" : "subtle"} disabled={!misma} onClick={() => cambiarEstado("Pendiente de validación")}>Enviar a validación</Btn>
        </Field>
      )}

      <div style={{ fontWeight: 700, fontSize: 12.5, color: C.navy, marginTop: 16, marginBottom: 8 }}>Comentarios</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10, maxHeight: 160, overflow: "auto" }}>
        {(local.comentarios || []).length === 0 && <div style={{ fontSize: 12, color: C.slate }}>Sin comentarios todavía.</div>}
        {(local.comentarios || []).map((c, i) => (
          <div key={i} style={{ background: C.sky, borderRadius: 8, padding: 8, fontSize: 12 }}>
            <div style={{ fontWeight: 700, color: C.navy }}>{c.usuario} <span style={{ fontWeight: 400, color: C.slate }}>· {new Date(c.fecha).toLocaleString()}</span></div>
            <div>{c.texto}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Input value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Escribe un comentario…" />
        <Btn size="sm" onClick={agregarComentario}>Agregar</Btn>
      </div>

      <div style={{ fontWeight: 700, fontSize: 12.5, color: C.navy, marginTop: 16, marginBottom: 8 }}>Historial de cambios</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 140, overflow: "auto", fontSize: 11.5, color: C.slate }}>
        {(local.historial || []).slice().reverse().map((h, i) => (
          <div key={i}>• {h.evento} — <b>{h.usuario}</b> · {new Date(h.fecha).toLocaleString()}</div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18 }}>
        <div>{canDelete && <Btn variant="danger" size="sm" onClick={() => onDelete(local.id)}><Icon name="trash" size={13} /> Eliminar</Btn>}</div>
        <Btn variant="ghost" onClick={onClose}>Cerrar ventana</Btn>
      </div>
    </Modal>
  );
}

/* ============================================================
   MÓDULO "ACCIONES" — tabla principal con filtros
   ============================================================ */
function AccionesScreen({ acciones, sucursales, users, activos, tiposAuditoria, user, onCreate, onSave, onDelete }) {
  const isResp = user.role === "Responsable";
  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState(null);

  const [fEstado, setFEstado] = useState("");
  const [fPrioridad, setFPrioridad] = useState("");
  const [fResponsable, setFResponsable] = useState("");
  const [fLugar, setFLugar] = useState("");
  const [fTipoActivo, setFTipoActivo] = useState("");
  const [fTipoAud, setFTipoAud] = useState("");
  const [fFecha, setFFecha] = useState("");
  const [fActivo, setFActivo] = useState("");

  const visibles = isResp ? acciones.filter((a) => a.asignadoA === user.name) : acciones;

  const responsables = [...new Set(acciones.map((a) => a.asignadoA).filter(Boolean))];

  const filtered = visibles.filter((a) => {
    if (fEstado && a.estado !== fEstado) return false;
    if (fPrioridad && a.prioridad !== fPrioridad) return false;
    if (fResponsable && a.asignadoA !== fResponsable) return false;
    if (fLugar && a.lugar !== fLugar) return false;
    if (fFecha && a.fechaCompromiso !== fFecha) return false;
    if (fActivo && a.activoId !== fActivo) return false;
    if (fTipoAud && a.tipoAuditoriaId !== fTipoAud) return false;
    if (fTipoActivo) {
      const act = activos.find((x) => x.id === a.activoId);
      if (!act || act.tipo !== fTipoActivo) return false;
    }
    return true;
  }).sort((a, b) => (b.updatedAt || b.fechaCreacion || "").localeCompare(a.updatedAt || a.fechaCreacion || ""));

  const rowStyle = (a) => {
    const t = accionEstadoTiempo(a);
    if (t === "vencida") return { background: "#FBE7E7" };
    if (t === "proxima") return { background: "#FFF7E6" };
    return {};
  };

  return (
    <div>
      <PageHeader
        title={isResp ? "Mis acciones" : "Acciones correctivas y preventivas"}
        subtitle={`${filtered.length} de ${visibles.length} acciones`}
        right={!isResp && <Btn onClick={() => setShowForm(true)}><Icon name="plus" size={15} /> Nueva acción</Btn>}
      />

      {!isResp && (
        <Card style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 140px" }}>
              <div style={miniLabel}>Estado</div>
              <Select value={fEstado} onChange={(e) => setFEstado(e.target.value)}><option value="">Todos</option>{ESTADOS_ACCION.map((e) => <option key={e}>{e}</option>)}</Select>
            </div>
            <div style={{ flex: "1 1 120px" }}>
              <div style={miniLabel}>Prioridad</div>
              <Select value={fPrioridad} onChange={(e) => setFPrioridad(e.target.value)}><option value="">Todas</option>{PRIORIDADES.map((p) => <option key={p}>{p}</option>)}</Select>
            </div>
            <div style={{ flex: "1 1 160px" }}>
              <div style={miniLabel}>Responsable</div>
              <Select value={fResponsable} onChange={(e) => setFResponsable(e.target.value)}><option value="">Todos</option>{responsables.map((r) => <option key={r}>{r}</option>)}</Select>
            </div>
            <div style={{ flex: "1 1 160px" }}>
              <div style={miniLabel}>Lugar</div>
              <Select value={fLugar} onChange={(e) => setFLugar(e.target.value)}><option value="">Todos</option>{sucursales.map((s) => <option key={s.id}>{s.nombre}</option>)}</Select>
            </div>
            <div style={{ flex: "1 1 160px" }}>
              <div style={miniLabel}>Tipo de activo</div>
              <Select value={fTipoActivo} onChange={(e) => setFTipoActivo(e.target.value)}><option value="">Todos</option>{TIPOS_ACTIVO.map((t) => <option key={t}>{t}</option>)}</Select>
            </div>
            <div style={{ flex: "1 1 160px" }}>
              <div style={miniLabel}>Activo</div>
              <Select value={fActivo} onChange={(e) => setFActivo(e.target.value)}><option value="">Todos</option>{activos.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</Select>
            </div>
            <div style={{ flex: "1 1 180px" }}>
              <div style={miniLabel}>Tipo de auditoría</div>
              <Select value={fTipoAud} onChange={(e) => setFTipoAud(e.target.value)}><option value="">Todos</option>{tiposAuditoria.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}</Select>
            </div>
            <div style={{ flex: "1 1 140px" }}>
              <div style={miniLabel}>Fecha compromiso</div>
              <Input type="date" value={fFecha} onChange={(e) => setFFecha(e.target.value)} />
            </div>
            {(fEstado || fPrioridad || fResponsable || fLugar || fTipoActivo || fTipoAud || fFecha || fActivo) && (
              <Btn variant="ghost" size="sm" onClick={() => { setFEstado(""); setFPrioridad(""); setFResponsable(""); setFLugar(""); setFTipoActivo(""); setFTipoAud(""); setFFecha(""); setFActivo(""); }}>Limpiar</Btn>
            )}
          </div>
        </Card>
      )}

      <Card style={{ padding: 0, overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 20 }}><EmptyState text="No hay acciones que coincidan." /></div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.6 }}>
              <thead>
                <tr style={{ textAlign: "left", background: C.sky, color: C.navy }}>
                  {["Acción", "Responsable", "Lugar", "Activo", "Prioridad", "Fecha compromiso", "Días restantes", "Estado", "Origen", "Creado por"].map((h) => (
                    <th key={h} style={{ ...th, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => {
                  const dias = diasRestantes(a.fechaCompromiso);
                  const t = accionEstadoTiempo(a);
                  return (
                    <tr key={a.id} style={{ borderTop: `1px solid ${C.line}`, cursor: "pointer", ...rowStyle(a) }} onClick={() => setDetail(a)}>
                      <td style={{ ...td, fontWeight: 700, maxWidth: 220 }}>{a.titulo}</td>
                      <td style={td}>{a.asignadoA}</td>
                      <td style={td}>{a.lugar}</td>
                      <td style={td}>{a.activoNombre || "—"}</td>
                      <td style={td}><PrioridadPill prioridad={a.prioridad} /></td>
                      <td style={td}>{a.fechaCompromiso}</td>
                      <td style={{ ...td, fontWeight: 700, color: t === "vencida" ? "#C22B2B" : t === "proxima" ? "#9A6A00" : C.ink }}>
                        {dias == null ? "—" : dias < 0 ? `Vencida ${Math.abs(dias)}d` : `${dias}d`}
                      </td>
                      <td style={td}><EstadoAccionPill estado={a.estado} /></td>
                      <td style={td}>{a.origen}{a.folioAuditoria ? ` · ${a.folioAuditoria}` : ""}</td>
                      <td style={td}>{a.creadoPor}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showForm && (
        <AccionFormModal
          sucursales={sucursales} users={users} activos={activos} user={user}
          onClose={() => setShowForm(false)}
          onSave={(a) => { onCreate(a); setShowForm(false); }}
        />
      )}
      {detail && (
        <AccionDetailModal
          accion={detail} sucursales={sucursales} users={users} activos={activos} user={user}
          onClose={() => setDetail(null)}
          onSave={(a) => { onSave(a); setDetail(a); }}
          onDelete={(id) => { onDelete(id); setDetail(null); }}
        />
      )}
    </div>
  );
}

/* ============================================================
   MÓDULO "ACTIVOS"
   ============================================================ */
const EMPTY_ACTIVO = { tipo: "Equipo", nombre: "", descripcion: "", numEconomico: "", numSerie: "", placas: "", ubicacion: "", responsable: "", estado: "Operativo", fotos: [], observaciones: "" };

function ActivosScreen({ activos, sucursales, acciones, user, onSave, onDelete }) {
  const [modal, setModal] = useState(null); // {mode:'new'|'edit', data}
  const [form, setForm] = useState(EMPTY_ACTIVO);
  const [historialDe, setHistorialDe] = useState(null);
  const canEdit = user.role === "Administrador" || user.role === "Auditor";
  const canDelete = user.role === "Administrador";

  const openNew = () => { setForm(EMPTY_ACTIVO); setModal({ mode: "new" }); };
  const openEdit = (a) => { setForm(a); setModal({ mode: "edit" }); };
  const save = () => {
    if (!form.nombre) return;
    onSave(modal.mode === "new" ? { ...form, id: uid() } : form, modal.mode);
    setModal(null);
  };

  return (
    <div>
      <PageHeader title="Activos" subtitle={`${activos.length} activos registrados`} right={canEdit && <Btn onClick={openNew}><Icon name="plus" size={15} /> Registrar activo</Btn>} />
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {activos.length === 0 ? (
          <div style={{ padding: 20 }}><EmptyState text="No hay activos registrados todavía." /></div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.8 }}>
              <thead>
                <tr style={{ textAlign: "left", background: C.sky, color: C.navy }}>
                  {["Foto", "Tipo", "Nombre", "N° económico", "Ubicación", "Responsable", "Estado", ""].map((h) => <th key={h} style={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {activos.map((a) => (
                  <tr key={a.id} style={{ borderTop: `1px solid ${C.line}` }}>
                    <td style={td}>{a.fotos?.[0] ? <img src={a.fotos[0]} style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 6 }} /> : <div style={{ width: 36, height: 36, borderRadius: 6, background: C.sky }} />}</td>
                    <td style={td}>{a.tipo}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{a.nombre}</td>
                    <td style={td}>{a.numEconomico || "—"}</td>
                    <td style={td}>{a.ubicacion || "—"}</td>
                    <td style={td}>{a.responsable || "—"}</td>
                    <td style={td}><StatusPill status={a.estado === "Operativo" ? "Finalizada" : a.estado === "De baja" ? "Cancelada" : "Borrador"} /> <span style={{ fontSize: 11, color: C.slate }}>{a.estado}</span></td>
                    <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                      <IconBtn icon="list" title="Historial" onClick={() => setHistorialDe(a)} />
                      {canEdit && <IconBtn icon="edit" title="Editar" onClick={() => openEdit(a)} />}
                      {canDelete && <IconBtn icon="trash" title="Eliminar" onClick={() => onDelete(a.id)} danger />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {modal && (
        <Modal title={modal.mode === "new" ? "Registrar activo" : "Editar activo"} onClose={() => setModal(null)} width={620}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Tipo de activo" required>
              <Select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>{TIPOS_ACTIVO.map((t) => <option key={t}>{t}</option>)}</Select>
            </Field>
            <Field label="Nombre" required><Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></Field>
            <Field label="Número económico"><Input value={form.numEconomico} onChange={(e) => setForm({ ...form, numEconomico: e.target.value })} /></Field>
            <Field label="Número de serie"><Input value={form.numSerie} onChange={(e) => setForm({ ...form, numSerie: e.target.value })} /></Field>
            <Field label="Placas (si aplica)"><Input value={form.placas} onChange={(e) => setForm({ ...form, placas: e.target.value })} /></Field>
            <Field label="Ubicación">
              <Select value={form.ubicacion} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })}>
                <option value="">Selecciona…</option>
                {sucursales.map((s) => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
              </Select>
            </Field>
            <Field label="Responsable"><Input value={form.responsable} onChange={(e) => setForm({ ...form, responsable: e.target.value })} /></Field>
            <Field label="Estado"><Select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>{ESTADOS_ACTIVO.map((s) => <option key={s}>{s}</option>)}</Select></Field>
          </div>
          <Field label="Descripción"><TextArea rows={2} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} /></Field>
          <Field label="Fotografías"><PhotoPicker photos={form.fotos} onChange={(v) => setForm({ ...form, fotos: v })} /></Field>
          <Field label="Observaciones"><TextArea rows={2} value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} /></Field>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
            <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
            <Btn onClick={save}>Guardar</Btn>
          </div>
        </Modal>
      )}

      {historialDe && (
        <Modal title={`Historial · ${historialDe.nombre}`} onClose={() => setHistorialDe(null)} width={600}>
          {(() => {
            const relacionadas = acciones.filter((a) => a.activoId === historialDe.id).sort((a, b) => (b.fechaCreacion || "").localeCompare(a.fechaCreacion || ""));
            if (relacionadas.length === 0) return <EmptyState text="Este activo no tiene auditorías ni acciones relacionadas todavía." />;
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {relacionadas.map((a) => (
                  <div key={a.id} style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <b style={{ fontSize: 13 }}>{a.titulo}</b>
                      <EstadoAccionPill estado={a.estado} />
                    </div>
                    <div style={{ fontSize: 11.5, color: C.slate }}>{a.origen}{a.folioAuditoria ? ` · ${a.folioAuditoria}` : ""} · Compromiso: {a.fechaCompromiso} · Responsable: {a.asignadoA}</div>
                  </div>
                ))}
              </div>
            );
          })()}
        </Modal>
      )}
    </div>
  );
}

/* ============================================================
   EDITOR DE PLANTILLA — secciones y criterios de un tipo de auditoría
   (así se agregan nuevos tipos de auditoría sin tocar código)
   ============================================================ */
function TemplateEditor({ secciones, onChange }) {
  const addSeccion = () => onChange([...secciones, { id: uid(), name: "Nueva sección", criteria: [] }]);
  const updateSeccion = (idx, patch) => onChange(secciones.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  const removeSeccion = (idx) => onChange(secciones.filter((_, i) => i !== idx));

  const addCriterio = (idx) => {
    const s = secciones[idx];
    updateSeccion(idx, { criteria: [...s.criteria, { key: uid(), name: "Nuevo criterio", reactivo: "", niveles: ["", "", "", "", ""] }] });
  };
  const updateCriterio = (idx, cIdx, patch) => {
    const s = secciones[idx];
    updateSeccion(idx, { criteria: s.criteria.map((c, i) => (i === cIdx ? { ...c, ...patch } : c)) });
  };
  const updateNivel = (idx, cIdx, nIdx, value) => {
    const s = secciones[idx];
    const c = s.criteria[cIdx];
    const niveles = c.niveles.slice();
    niveles[nIdx] = value;
    updateCriterio(idx, cIdx, { niveles });
  };
  const removeCriterio = (idx, cIdx) => {
    const s = secciones[idx];
    updateSeccion(idx, { criteria: s.criteria.filter((_, i) => i !== cIdx) });
  };

  return (
    <div>
      {secciones.length === 0 && <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 12 }}>Esta plantilla todavía no tiene secciones. Agrega la primera para empezar a construir sus criterios.</div>}
      {secciones.map((s, idx) => (
        <Card key={s.id} style={{ padding: 14, marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <Input value={s.name} onChange={(e) => updateSeccion(idx, { name: e.target.value })} placeholder="Nombre de la sección" style={{ fontWeight: 700 }} />
            <Btn variant="danger" size="sm" onClick={() => removeSeccion(idx)}><Icon name="trash" size={13} /></Btn>
          </div>
          {s.criteria.map((c, cIdx) => (
            <div key={c.key} style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 10, marginBottom: 8, background: C.sky }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <Input value={c.name} onChange={(e) => updateCriterio(idx, cIdx, { name: e.target.value })} placeholder="Nombre del criterio" />
                <Btn variant="danger" size="sm" onClick={() => removeCriterio(idx, cIdx)}><Icon name="trash" size={13} /></Btn>
              </div>
              <Field label="Reactivo / defectuoso base (nivel 0)"><TextArea rows={1} value={c.reactivo} onChange={(e) => updateCriterio(idx, cIdx, { reactivo: e.target.value })} /></Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[0, 1, 2, 3, 4].map((nIdx) => (
                  <Field key={nIdx} label={`Nivel ${nIdx + 1}`}><TextArea rows={1} value={c.niveles[nIdx] || ""} onChange={(e) => updateNivel(idx, cIdx, nIdx, e.target.value)} /></Field>
                ))}
              </div>
            </div>
          ))}
          <Btn size="sm" variant="outline" onClick={() => addCriterio(idx)}><Icon name="plus" size={13} /> Agregar criterio</Btn>
        </Card>
      ))}
      <Btn variant="subtle" onClick={addSeccion}><Icon name="plus" size={14} /> Agregar sección</Btn>
    </div>
  );
}

/* ============================================================
   ADMINISTRACIÓN · TIPOS DE AUDITORÍA
   ============================================================ */
function TiposAuditoriaScreen({ tipos, onSave, onDelete }) {
  const [modal, setModal] = useState(null); // {mode:'new'|'edit', data}
  const [form, setForm] = useState(null);

  const openNew = () => { setForm({ id: uid(), nombre: "", descripcion: "", sistema: false, activo: true, moduloInventario: false, secciones: [] }); setModal({ mode: "new" }); };
  const openEdit = (t) => { setForm(t); setModal({ mode: "edit" }); };
  const save = () => {
    if (!form.nombre.trim()) return;
    onSave(form, modal.mode);
    setModal(null);
  };

  return (
    <div>
      <PageHeader title="Tipos de auditoría" subtitle="Catálogo dinámico de plantillas — agrega nuevos tipos sin modificar el código." right={<Btn onClick={openNew}><Icon name="plus" size={15} /> Nuevo tipo de auditoría</Btn>} />
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ background: C.sky, color: C.navy, textAlign: "left" }}><th style={th}>Nombre</th><th style={th}>Secciones</th><th style={th}>Criterios</th><th style={th}>Estatus</th><th style={th}></th></tr></thead>
          <tbody>
            {tipos.map((t) => (
              <tr key={t.id} style={{ borderTop: `1px solid ${C.line}` }}>
                <td style={{ ...td, fontWeight: 700 }}>{t.nombre} {t.sistema && <span style={{ fontSize: 10, color: C.slate, fontWeight: 500 }}>(plantilla del sistema)</span>}</td>
                <td style={td}>{(t.secciones || []).length}</td>
                <td style={td}>{ALL_CRITERIA_OF(t.secciones).length}</td>
                <td style={td}><StatusPill status={t.activo ? "Finalizada" : "Cancelada"} /></td>
                <td style={{ ...td, textAlign: "right" }}>
                  <IconBtn icon="edit" title="Editar" onClick={() => openEdit(t)} />
                  {!t.sistema && <IconBtn icon="trash" title="Eliminar" onClick={() => onDelete(t.id)} danger />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {modal && (
        <Modal title={modal.mode === "new" ? "Nuevo tipo de auditoría" : `Editar · ${form.nombre}`} onClose={() => setModal(null)} width={820}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
            <Field label="Nombre" required><Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></Field>
            <Field label="Estatus">
              <Select value={form.activo ? "1" : "0"} onChange={(e) => setForm({ ...form, activo: e.target.value === "1" })}>
                <option value="1">Activo (visible en Nueva auditoría)</option>
                <option value="0">Inactivo (oculto)</option>
              </Select>
            </Field>
          </div>
          <Field label="Descripción"><TextArea rows={2} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} /></Field>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: C.navy, fontWeight: 700, marginBottom: 16 }}>
            <input type="checkbox" checked={!!form.moduloInventario} onChange={(e) => setForm({ ...form, moduloInventario: e.target.checked })} />
            Incluye paso de "Resultado de inventario" (entradas/salidas y balance)
          </label>

          <div style={{ fontWeight: 800, color: C.navy, fontSize: 14, marginBottom: 10, borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>Secciones y criterios de evaluación</div>
          {form.sistema && (
            <div style={{ fontSize: 11.5, color: C.slate, background: C.sky, borderRadius: 8, padding: 10, marginBottom: 12 }}>
              Esta es la plantilla original del sistema. Puedes ajustar la redacción de los criterios, pero se recomienda no eliminar secciones para conservar la auditoría tal como funciona hoy.
            </div>
          )}
          <TemplateEditor secciones={form.secciones} onChange={(secciones) => setForm({ ...form, secciones })} />

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
            <Btn onClick={save}>Guardar tipo de auditoría</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ============================================================
   WIZARD — NUEVA / EDITAR AUDITORÍA (dinámico por tipo/plantilla)
   ============================================================ */
const STEP_LABELS_MAP = { datos: "Datos generales", evaluacion: "Evaluación por secciones", inventario: "Resultado de inventario", comentarios: "Comentarios y firmas", resumen: "Resumen final" };

function Wizard({ initialAudit, tipos, sucursales, users, activos, user, onSaveDraft, onFinalize, onCancel, onPrint, onCreateAccion, readOnly }) {
  const [audit, setAudit] = useState(initialAudit);
  const [step, setStep] = useState(0);
  const [openAcc, setOpenAcc] = useState(null);
  const [guiaCrit, setGuiaCrit] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [accionDraft, setAccionDraft] = useState(null); // {critId, criterioName, sectionName}

  const tipo = tipos.find((t) => t.id === audit.tipoAuditoriaId) || null;
  const secciones = tipo?.secciones || [];

  const steps = useMemo(() => {
    const arr = ["datos", "evaluacion"];
    if (tipo?.moduloInventario) arr.push("inventario");
    arr.push("comentarios", "resumen");
    return arr;
  }, [tipo?.moduloInventario]);
  const stepKey = steps[step] || steps[0];

  const calc = useMemo(() => calcAudit(audit, secciones), [audit, secciones]);

  const setField = (k, v) => setAudit((a) => ({ ...a, [k]: v }));
  const setScore = (critId, patch) => setAudit((a) => ({ ...a, scores: { ...a.scores, [critId]: { ...(a.scores[critId] || {}), ...patch } } }));

  const addEvidence = async (critId, files) => {
    const arr = Array.from(files).slice(0, 3 - ((audit.scores[critId]?.evidencias || []).length));
    const urls = [];
    for (const f of arr) {
      try {
        const url = await resizeImageFile(f);
        urls.push(url);
      } catch (e) {}
    }
    setScore(critId, { evidencias: [...(audit.scores[critId]?.evidencias || []), ...urls] });
  };
  const removeEvidence = (critId, idx) => {
    const cur = audit.scores[critId]?.evidencias || [];
    setScore(critId, { evidencias: cur.filter((_, i) => i !== idx) });
  };

  const doSave = async (finalize) => {
    setSaving(true);
    const updated = { ...audit, tipoNombre: tipo?.nombre || "", updatedAt: new Date().toISOString(), estatus: finalize ? "Finalizada" : audit.estatus === "Finalizada" ? "Finalizada" : "Borrador" };
    if (finalize) await onFinalize(updated);
    else await onSaveDraft(updated);
    setAudit(updated);
    setSaving(false);
    setSavedMsg(finalize ? "Auditoría finalizada y guardada." : "Borrador guardado.");
    setTimeout(() => setSavedMsg(""), 2500);
  };

  const canFinalize = audit.tipoAuditoriaId && audit.sucursal && audit.responsable && audit.auditorFirma && audit.encargadoFirma;

  return (
    <div>
      <PageHeader
        title={`${audit.folio} · ${audit.estatus}`}
        subtitle={readOnly ? "Auditoría finalizada — solo lectura para tu rol." : "Captura por bloques: completa cada paso y guarda cuando quieras."}
        right={
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="ghost" onClick={onCancel}><Icon name="arrowLeft" size={15} /> Volver</Btn>
            <Btn variant="outline" onClick={() => onPrint(audit)}><Icon name="download" size={15} /> Descargar PDF</Btn>
          </div>
        }
      />

      {/* Steps */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, overflowX: "auto", paddingBottom: 4 }}>
        {steps.map((k, i) => (
          <button
            key={k}
            onClick={() => setStep(i)}
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 999, border: `1px solid ${step === i ? C.royal : C.line}`,
              background: step === i ? C.royal : "#fff", color: step === i ? "#fff" : C.slate, fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
            }}
          >
            <span style={{ width: 18, height: 18, borderRadius: 999, background: step === i ? "rgba(255,255,255,0.25)" : C.sky, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10.5 }}>{i + 1}</span>
            {STEP_LABELS_MAP[k]}
          </button>
        ))}
      </div>

      {stepKey === "datos" && (
        <Card style={{ padding: 22, maxWidth: 640 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Field label="Folio"><Input value={audit.folio} disabled style={{ background: C.sky, fontWeight: 700 }} /></Field>
            <Field label="Tipo de auditoría" required>
              <Select value={audit.tipoAuditoriaId} disabled={readOnly} onChange={(e) => setField("tipoAuditoriaId", e.target.value)}>
                <option value="">Selecciona…</option>
                {tipos.filter((t) => t.activo).map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </Select>
            </Field>
            <Field label="Fecha" required><Input type="date" value={audit.fecha} disabled={readOnly} onChange={(e) => setField("fecha", e.target.value)} /></Field>
            <Field label="Sucursal / lugar" required>
              <Select value={audit.sucursal} disabled={readOnly} onChange={(e) => setField("sucursal", e.target.value)}>
                <option value="">Selecciona…</option>
                {sucursales.map((s) => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
              </Select>
            </Field>
            <Field label="Responsable / encargado" required><Input value={audit.responsable} disabled={readOnly} onChange={(e) => setField("responsable", e.target.value)} placeholder="Nombre del encargado de sucursal" /></Field>
            <Field label="Auditor" required><Input value={audit.auditor} disabled={readOnly} onChange={(e) => { setField("auditor", e.target.value); setField("auditorNombre", e.target.value); }} /></Field>
            <Field label="Estatus"><Select value={audit.estatus} disabled><option>{audit.estatus}</option></Select></Field>
          </div>
          {!audit.tipoAuditoriaId && <div style={{ fontSize: 12, color: "#9A6A00", background: "#FFF4DE", border: "1px solid #F0D6A0", padding: 10, borderRadius: 8 }}>Selecciona un tipo de auditoría para cargar su plantilla de evaluación.</div>}
        </Card>
      )}

      {stepKey === "evaluacion" && (
        <div>
          {!audit.tipoAuditoriaId ? (
            <Card style={{ padding: 20 }}><EmptyState text="Primero selecciona un tipo de auditoría en el paso “Datos generales”." /></Card>
          ) : secciones.length === 0 ? (
            <Card style={{ padding: 20 }}><EmptyState text="Esta plantilla aún no tiene criterios definidos. Un administrador puede configurarlos en “Tipos de auditoría”." /></Card>
          ) : (
            <>
              <Card style={{ padding: 14, marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.navy, marginBottom: 8 }}>Escala 0–5 por criterio (el resultado final se muestra en 0–10)</div>
                <EscalaLegend compact />
              </Card>
              {secciones.map((sec) => {
                const critIds = sec.criteria.map((c) => `${sec.id}__${c.key}`);
                const vals = critIds.map((id) => audit.scores[id]?.calificacion).filter((v) => v !== null && v !== undefined && v !== "");
                const avg = vals.length ? vals.reduce((a, b) => a + Number(b), 0) / vals.length : null;
                const open = openAcc === sec.id;
                return (
                  <Card key={sec.id} style={{ marginBottom: 12, overflow: "hidden" }}>
                    <button onClick={() => setOpenAcc(open ? null : sec.id)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", background: C.sky, border: "none", cursor: "pointer" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ fontWeight: 800, color: C.navy, fontSize: 14 }}>{sec.name}</div>
                        <span style={{ fontSize: 11, color: C.slate }}>{vals.length}/{sec.criteria.length} evaluados</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <SeccionScoreBadge avg={avg} />
                        <span style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}><Icon name="chevronDown" size={16} color={C.navy} /></span>
                      </div>
                    </button>
                    {open && (
                      <div style={{ padding: "6px 18px 18px" }}>
                        {sec.criteria.map((c) => {
                          const id = `${sec.id}__${c.key}`;
                          const s = audit.scores[id] || {};
                          return (
                            <div key={id} style={{ borderTop: `1px solid ${C.line}`, padding: "16px 0" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                                <div style={{ fontWeight: 700, fontSize: 13.3, color: C.ink }}>{c.name}</div>
                                <div style={{ display: "flex", gap: 6 }}>
                                  <Btn size="sm" variant="ghost" onClick={() => setGuiaCrit(c)}><Icon name="book" size={13} /> Ver guía</Btn>
                                  {!readOnly && (
                                    <Btn size="sm" variant="outline" onClick={() => setAccionDraft({ critId: id, criterioName: c.name, sectionName: sec.name })}>
                                      <Icon name="flag" size={13} /> Generar acción
                                    </Btn>
                                  )}
                                </div>
                              </div>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                                {ESCALA.slice().reverse().map((e) => (
                                  <button
                                    key={e.v}
                                    disabled={readOnly}
                                    onClick={() => setScore(id, { calificacion: e.v })}
                                    title={e.label}
                                    style={{
                                      width: 40, height: 36, borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: readOnly ? "default" : "pointer",
                                      border: `1.5px solid ${s.calificacion === e.v ? e.color : C.line}`,
                                      background: s.calificacion === e.v ? e.color : "#fff",
                                      color: s.calificacion === e.v ? "#fff" : C.slate,
                                    }}
                                  >{e.v}</button>
                                ))}
                              </div>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
                                <Field label="Observación"><TextArea disabled={readOnly} value={s.observacion || ""} onChange={(e) => setScore(id, { observacion: e.target.value })} placeholder="¿Qué se observó?" /></Field>
                                <Field label="Acción"><TextArea disabled={readOnly} value={s.accion || ""} onChange={(e) => setScore(id, { accion: e.target.value })} placeholder="Acción correctiva a tomar" /></Field>
                              </div>
                              <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 12, alignItems: "start" }}>
                                <Field label="Fecha compromiso"><Input type="date" disabled={readOnly} value={s.fechaCompromiso || ""} onChange={(e) => setScore(id, { fechaCompromiso: e.target.value })} /></Field>
                                <Field label={`Evidencias fotográficas (${(s.evidencias || []).length}/3)`}>
                                  <PhotoPicker photos={s.evidencias} max={3} onChange={(fotos) => setScore(id, { evidencias: fotos })} disabled={readOnly} />
                                </Field>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>
                );
              })}
            </>
          )}
        </div>
      )}

      {stepKey === "inventario" && (
        <Card style={{ padding: 22, maxWidth: 700 }}>
          <div style={{ fontWeight: 800, color: C.navy, fontSize: 14.5, marginBottom: 14 }}>Resultado de inventario</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.royal, marginBottom: 8, textTransform: "uppercase" }}>Ajuste de entrada</div>
              <Field label="Número de ajuste de entrada"><Input disabled={readOnly} value={audit.inventario.entradaNumero} onChange={(e) => setField("inventario", { ...audit.inventario, entradaNumero: e.target.value })} /></Field>
              <Field label="Cantidad / monto"><Input type="number" disabled={readOnly} value={audit.inventario.entradaMonto} onChange={(e) => setField("inventario", { ...audit.inventario, entradaMonto: e.target.value })} /></Field>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#C22B2B", marginBottom: 8, textTransform: "uppercase" }}>Ajuste de salida</div>
              <Field label="Número de ajuste de salida"><Input disabled={readOnly} value={audit.inventario.salidaNumero} onChange={(e) => setField("inventario", { ...audit.inventario, salidaNumero: e.target.value })} /></Field>
              <Field label="Cantidad / monto"><Input type="number" disabled={readOnly} value={audit.inventario.salidaMonto} onChange={(e) => setField("inventario", { ...audit.inventario, salidaMonto: e.target.value })} /></Field>
            </div>
          </div>
          <div style={{ marginTop: 12, padding: 16, background: C.sky, borderRadius: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>Balance automático (Entrada − Salida)</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: calc.balance < 0 ? "#C22B2B" : C.navy }}>${calc.balance.toFixed(2)}</div>
          </div>
          <div style={{ fontSize: 11.5, color: C.slate, marginTop: 8 }}>Este resumen es una referencia rápida de auditoría, no reemplaza el módulo contable completo.</div>
        </Card>
      )}

      {stepKey === "comentarios" && (
        <Card style={{ padding: 22, maxWidth: 780 }}>
          <Field label="Comentarios generales"><TextArea disabled={readOnly} rows={4} value={audit.comentarios} onChange={(e) => setField("comentarios", e.target.value)} placeholder="Observaciones generales de la auditoría…" /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 16 }}>
            <div>
              <Field label="Nombre del encargado" required><Input disabled={readOnly} value={audit.encargadoNombre} onChange={(e) => setField("encargadoNombre", e.target.value)} /></Field>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: C.navy, marginBottom: 5 }}>Firma del encargado <span style={{ color: "#C22B2B" }}>*</span></div>
              {readOnly ? (audit.encargadoFirma ? <img src={audit.encargadoFirma} style={{ width: "100%", border: `1px solid ${C.line}`, borderRadius: 10 }} /> : <EmptyState text="Sin firma" />) : <SignaturePad value={audit.encargadoFirma} onChange={(v) => setField("encargadoFirma", v)} />}
            </div>
            <div>
              <Field label="Nombre del auditor" required><Input disabled={readOnly} value={audit.auditorNombre} onChange={(e) => setField("auditorNombre", e.target.value)} /></Field>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: C.navy, marginBottom: 5 }}>Firma del auditor <span style={{ color: "#C22B2B" }}>*</span></div>
              {readOnly ? (audit.auditorFirma ? <img src={audit.auditorFirma} style={{ width: "100%", border: `1px solid ${C.line}`, borderRadius: 10 }} /> : <EmptyState text="Sin firma" />) : <SignaturePad value={audit.auditorFirma} onChange={(v) => setField("auditorFirma", v)} />}
            </div>
          </div>
        </Card>
      )}

      {stepKey === "resumen" && (
        <div>
          <Card style={{ padding: 22, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 20 }}>
              <div>
                <div style={{ fontSize: 12, color: C.slate, fontWeight: 700 }}>{tipo?.nombre?.toUpperCase() || "AUDITORÍA"}</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.navy }}>{audit.sucursal || "—"}</div>
                <div style={{ fontSize: 12, color: C.slate, marginTop: 8 }}>{audit.fecha} · Responsable: {audit.responsable || "—"} · Auditor: {audit.auditor || "—"}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 34, fontWeight: 800, color: C.navy }}>{calc.finalScore != null ? calc.finalScore.toFixed(1) : "—"}<span style={{ fontSize: 15, color: C.slate }}> /10</span></div>
                <ScoreBadge score={calc.finalScore} />
                <div style={{ fontSize: 12, color: C.slate, marginTop: 4 }}>{calc.percent != null ? calc.percent.toFixed(0) : "—"}% de cumplimiento</div>
              </div>
            </div>
          </Card>
          <Card style={{ padding: 18, marginBottom: 16 }}>
            <div style={{ fontWeight: 750, fontSize: 13.5, color: C.navy, marginBottom: 12 }}>Promedio por sección (escala 0–5)</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 10 }}>
              {calc.secAverages.map((s) => (
                <div key={s.id} style={{ background: C.sky, borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.ink, marginBottom: 6 }}>{s.name}</div>
                  <SeccionScoreBadge avg={s.avg} />
                </div>
              ))}
            </div>
          </Card>
          {tipo?.moduloInventario && (
            <Card style={{ padding: 18, marginBottom: 16 }}>
              <div style={{ fontWeight: 750, fontSize: 13.5, color: C.navy, marginBottom: 10 }}>Resultado de inventario</div>
              <div style={{ fontSize: 13 }}>Balance final: <b style={{ color: calc.balance < 0 ? "#C22B2B" : C.navy }}>${calc.balance.toFixed(2)}</b></div>
            </Card>
          )}
          <Card style={{ padding: 18, marginBottom: 16 }}>
            <div style={{ fontWeight: 750, fontSize: 13.5, color: C.navy, marginBottom: 10 }}>Comentarios y firmas</div>
            <div style={{ fontSize: 13, color: C.ink, marginBottom: 12 }}>{audit.comentarios || <span style={{ color: C.slate }}>Sin comentarios</span>}</div>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              <div style={{ fontSize: 12 }}>Encargado: <b>{audit.encargadoNombre || "—"}</b> {audit.encargadoFirma ? <span style={{ color: "#1E7A3D" }}>✓ firmado</span> : <span style={{ color: "#C22B2B" }}>sin firma</span>}</div>
              <div style={{ fontSize: 12 }}>Auditor: <b>{audit.auditorNombre || "—"}</b> {audit.auditorFirma ? <span style={{ color: "#1E7A3D" }}>✓ firmado</span> : <span style={{ color: "#C22B2B" }}>sin firma</span>}</div>
            </div>
          </Card>
          {!canFinalize && !readOnly && (
            <div style={{ background: "#FFF4DE", border: "1px solid #F0D6A0", color: "#9A6A00", padding: 12, borderRadius: 10, fontSize: 12.5, marginBottom: 16 }}>
              Para finalizar la auditoría se requiere: tipo de auditoría, sucursal, responsable y ambas firmas.
            </div>
          )}
        </div>
      )}

      {!readOnly && (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22, flexWrap: "wrap", gap: 10 }}>
          <div>{step > 0 && <Btn variant="ghost" onClick={() => setStep(step - 1)}><Icon name="arrowLeft" size={15} /> Atrás</Btn>}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {savedMsg && <span style={{ color: "#1E7A3D", fontSize: 12, fontWeight: 700 }}>{savedMsg}</span>}
            <Btn variant="outline" disabled={saving} onClick={() => doSave(false)}>Guardar borrador</Btn>
            {step < steps.length - 1 && <Btn onClick={() => setStep(step + 1)}>Siguiente <Icon name="arrowRight" size={15} /></Btn>}
            {step === steps.length - 1 && <Btn disabled={saving || !canFinalize} onClick={() => doSave(true)}><Icon name="check" size={15} /> Finalizar auditoría</Btn>}
          </div>
        </div>
      )}
      {readOnly && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 22 }}>
          <Btn onClick={() => onPrint(audit)}><Icon name="download" size={15} /> Descargar PDF</Btn>
        </div>
      )}

      {guiaCrit && <GuiaModal criterio={guiaCrit} onClose={() => setGuiaCrit(null)} />}
      {accionDraft && (
        <AccionFormModal
          sucursales={sucursales} users={users} activos={activos} user={user}
          origenFijo="Auditoría"
          contextInfo={`Generada desde el hallazgo "${accionDraft.criterioName}" (${accionDraft.sectionName}) de la auditoría ${audit.folio}.`}
          initial={{
            titulo: accionDraft.criterioName,
            descripcion: audit.scores[accionDraft.critId]?.observacion || audit.scores[accionDraft.critId]?.accion || "",
            asignadoA: audit.responsable || "",
            lugar: audit.sucursal || "",
            fechaCompromiso: audit.scores[accionDraft.critId]?.fechaCompromiso || "",
            evidencias: audit.scores[accionDraft.critId]?.evidencias || [],
          }}
          onClose={() => setAccionDraft(null)}
          onSave={(a) => {
            onCreateAccion({ ...a, auditoriaId: audit.id, hallazgoId: accionDraft.critId, tipoAuditoriaId: audit.tipoAuditoriaId, folioAuditoria: audit.folio });
            setAccionDraft(null);
          }}
        />
      )}
    </div>
  );
}

/* ============================================================
   VISTA IMPRESIÓN / PDF (dinámica por tipo/plantilla)
   ============================================================ */
function PrintView({ audit, tipo, config }) {
  const secciones = tipo?.secciones || [];
  const calc = useMemo(() => calcAudit(audit, secciones), [audit, secciones]);
  const nivel = nivelDe(calc.finalScore);
  return (
    <div id="pdf-root" style={{ background: "#fff", color: "#101833", fontFamily: "'Segoe UI', system-ui, sans-serif", padding: 28, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `4px solid ${C.royal}`, paddingBottom: 14, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {config?.logo && <img src={config.logo} style={{ height: 46 }} />}
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.navy }}>{config?.empresa || "Empresa"}</div>
            <div style={{ fontSize: 12, color: C.slate }}>{tipo?.nombre || "Auditoría"}</div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: C.slate }}>FOLIO</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.royal }}>{audit.folio}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 18, fontSize: 11.5 }}>
        <div><b>Sucursal</b><br />{audit.sucursal}</div>
        <div><b>Fecha</b><br />{audit.fecha}</div>
        <div><b>Responsable</b><br />{audit.responsable}</div>
        <div><b>Auditor</b><br />{audit.auditor}</div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1, background: C.sky, borderRadius: 10, padding: 14, textAlign: "center" }}>
          <div style={{ fontSize: 10.5, color: C.slate, fontWeight: 700 }}>CALIFICACIÓN FINAL (0–10)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: C.navy }}>{calc.finalScore != null ? calc.finalScore.toFixed(1) : "—"}</div>
        </div>
        <div style={{ flex: 1, background: C.sky, borderRadius: 10, padding: 14, textAlign: "center" }}>
          <div style={{ fontSize: 10.5, color: C.slate, fontWeight: 700 }}>% CUMPLIMIENTO</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: C.navy }}>{calc.percent != null ? calc.percent.toFixed(0) : "—"}%</div>
        </div>
        <div style={{ flex: 1, background: nivel.color + "22", borderRadius: 10, padding: 14, textAlign: "center" }}>
          <div style={{ fontSize: 10.5, color: C.slate, fontWeight: 700 }}>NIVEL</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: nivel.color }}>{nivel.label}</div>
        </div>
      </div>

      {secciones.map((sec) => {
        const secAvg = calc.secAverages.find((s) => s.id === sec.id);
        return (
          <div key={sec.id} style={{ marginBottom: 14, breakInside: "avoid" }}>
            <div style={{ background: C.navy, color: "#fff", padding: "6px 10px", fontSize: 12, fontWeight: 800, display: "flex", justifyContent: "space-between", borderRadius: "6px 6px 0 0" }}>
              <span>{sec.name}</span><span>Promedio: {secAvg?.avg != null ? secAvg.avg.toFixed(1) : "—"} /5</span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5 }}>
              <thead>
                <tr style={{ background: C.sky }}>
                  <th style={ptd}>Criterio</th><th style={ptd}>Calif.</th><th style={ptd}>Observación</th><th style={ptd}>Acción</th><th style={ptd}>Fecha comp.</th>
                </tr>
              </thead>
              <tbody>
                {sec.criteria.map((c) => {
                  const id = `${sec.id}__${c.key}`;
                  const s = audit.scores[id] || {};
                  return (
                    <tr key={id} style={{ borderTop: `1px solid ${C.line}` }}>
                      <td style={ptd}>{c.name}</td>
                      <td style={{ ...ptd, fontWeight: 800, color: scaleColor(s.calificacion) }}>{s.calificacion ?? "—"}</td>
                      <td style={ptd}>{s.observacion || "—"}</td>
                      <td style={ptd}>{s.accion || "—"}</td>
                      <td style={ptd}>{s.fechaCompromiso || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}

      {tipo?.moduloInventario && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 16, breakInside: "avoid" }}>
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 12, color: C.navy, marginBottom: 8 }}>Resultado de inventario</div>
            <div style={{ fontSize: 11 }}>Ajuste entrada: #{audit.inventario.entradaNumero || "—"} — ${Number(audit.inventario.entradaMonto || 0).toFixed(2)}</div>
            <div style={{ fontSize: 11 }}>Ajuste salida: #{audit.inventario.salidaNumero || "—"} — ${Number(audit.inventario.salidaMonto || 0).toFixed(2)}</div>
            <div style={{ fontSize: 13, fontWeight: 800, marginTop: 6, color: calc.balance < 0 ? "#C22B2B" : C.navy }}>Balance: ${calc.balance.toFixed(2)}</div>
          </div>
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 12, color: C.navy, marginBottom: 8 }}>Comentarios generales</div>
            <div style={{ fontSize: 11 }}>{audit.comentarios || "—"}</div>
          </div>
        </div>
      )}
      {!tipo?.moduloInventario && (
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 12, marginTop: 16, breakInside: "avoid" }}>
          <div style={{ fontWeight: 800, fontSize: 12, color: C.navy, marginBottom: 8 }}>Comentarios generales</div>
          <div style={{ fontSize: 11 }}>{audit.comentarios || "—"}</div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 30, marginTop: 26, breakInside: "avoid" }}>
        <div style={{ textAlign: "center" }}>
          {audit.encargadoFirma && <img src={audit.encargadoFirma} style={{ height: 60 }} />}
          <div style={{ borderTop: `1px solid ${C.ink}`, marginTop: 4, paddingTop: 4, fontSize: 11 }}>{audit.encargadoNombre || "Firma del encargado"}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          {audit.auditorFirma && <img src={audit.auditorFirma} style={{ height: 60 }} />}
          <div style={{ borderTop: `1px solid ${C.ink}`, marginTop: 4, paddingTop: 4, fontSize: 11 }}>{audit.auditorNombre || "Firma del auditor"}</div>
        </div>
      </div>

      <div style={{ marginTop: 10, fontSize: 11, fontWeight: 800, color: C.navy }}>Evidencias fotográficas</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
        {secciones.flatMap((sec) => sec.criteria.map((c) => ({ id: `${sec.id}__${c.key}`, name: c.name }))).flatMap(({ id, name }) => (audit.scores[id]?.evidencias || []).map((ev, i) => (
          <div key={id + i} style={{ width: 90 }}>
            <img src={ev} style={{ width: 90, height: 70, objectFit: "cover", borderRadius: 6, border: `1px solid ${C.line}` }} />
            <div style={{ fontSize: 8.5, color: C.slate }}>{name}</div>
          </div>
        )))}
      </div>

      <div style={{ marginTop: 22, fontSize: 9.5, color: C.slate, textAlign: "center" }}>Generado por la plataforma interna de auditorías · {new Date().toLocaleString()}</div>
    </div>
  );
}
const ptd = { padding: "5px 7px", textAlign: "left" };

function ConfigScreen({ config, onSave }) {
  const [form, setForm] = useState(config);
  const handleLogo = async (file) => {
    const url = await resizeImageFile(file, 300, 0.8);
    setForm({ ...form, logo: url });
  };
  return (
    <div>
      <PageHeader title="Configuración básica" subtitle="Identidad de la empresa para el dashboard y los reportes en PDF." />
      <Card style={{ padding: 22, maxWidth: 560 }}>
        <Field label="Nombre de la empresa"><Input value={form.empresa} onChange={(e) => setForm({ ...form, empresa: e.target.value })} /></Field>
        <Field label="Logo">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {form.logo && <img src={form.logo} style={{ height: 40 }} />}
            <label>
              <Btn variant="outline" size="sm" type="button" onClick={(e) => e.currentTarget.nextSibling?.click?.()}>Subir logo</Btn>
              <input type="file" accept="image/*" hidden onChange={(e) => e.target.files[0] && handleLogo(e.target.files[0])} />
            </label>
          </div>
        </Field>
        <div style={{ fontSize: 11.5, color: C.slate, background: C.sky, padding: 10, borderRadius: 8, marginTop: 8, marginBottom: 16 }}>
          Colores corporativos: Azul rey ({C.royal}) y blanco — aplicados en toda la app y en el PDF.
        </div>
        <Btn onClick={() => onSave(form)}>Guardar configuración</Btn>
      </Card>
    </div>
  );
}

/* ============================================================
   APP PRINCIPAL
   ============================================================ */
const DEFAULT_USERS = [
  { id: uid(), name: "Administrador General", email: "admin@empresa.com", password: "admin123", role: "Administrador", estatus: "Activo" },
  { id: uid(), name: "Auditor Demo", email: "auditor@empresa.com", password: "auditor123", role: "Auditor", estatus: "Activo" },
  { id: uid(), name: "Responsable Demo", email: "responsable@empresa.com", password: "resp123", role: "Responsable", estatus: "Activo" },
];
const DEFAULT_SUCURSALES = [
  { id: uid(), nombre: "Sucursal Centro", ciudad: "Chihuahua", responsable: "Por definir", estatus: "Activa" },
  { id: uid(), nombre: "Sucursal Norte", ciudad: "Chihuahua", responsable: "Por definir", estatus: "Activa" },
];
const DEFAULT_CONFIG = { empresa: "Mi Empresa", logo: "", colorPrimario: C.royal, colorSecundario: C.navy };

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [sucursales, setSucursales] = useState([]);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [index, setIndex] = useState([]);
  const [tiposAuditoria, setTiposAuditoria] = useState([]);
  const [activos, setActivos] = useState([]);
  const [acciones, setAcciones] = useState([]);
  const [view, setView] = useState("dashboard");
  const [wizardState, setWizardState] = useState(null); // {audit, mode:'new'|'edit'|'view'}
  const [printAudit, setPrintAudit] = useState(null);

  useEffect(() => {
    (async () => {
      let u = await sGet("users");
      if (!u || !u.length) { u = DEFAULT_USERS; await sSet("users", u); }
      setUsers(u);

      let s = await sGet("sucursales");
      if (!s || !s.length) { s = DEFAULT_SUCURSALES; await sSet("sucursales", s); }
      setSucursales(s);

      let cfg = await sGet("config");
      if (!cfg) { cfg = DEFAULT_CONFIG; await sSet("config", cfg); }
      setConfig(cfg);

      let idx = await sGet("audit-index");
      if (!idx) idx = [];
      setIndex(idx);

      let tipos = await sGet("tipos-auditoria");
      if (!tipos || !tipos.length) { tipos = TIPOS_AUDITORIA_SEED; await sSet("tipos-auditoria", tipos); }
      setTiposAuditoria(tipos);

      let act = await sGet("activos");
      if (!act) act = [];
      setActivos(act);

      let acc = await sGet("acciones");
      if (!acc) acc = [];
      setAcciones(acc);

      const session = await sGet("session", false);
      if (session?.userId) {
        const found = (u || []).find((x) => x.id === session.userId);
        if (found) setUser(found);
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (printAudit) {
      const t = setTimeout(() => { window.print(); }, 250);
      return () => clearTimeout(t);
    }
  }, [printAudit]);

  useEffect(() => {
    if (user?.role === "Responsable") setView("acciones");
  }, [user]);

  const login = async (u) => {
    setUser(u);
    await sSet("session", { userId: u.id }, false);
  };
  const logout = async () => {
    setUser(null);
    await sSet("session", {}, false);
    setView("dashboard");
  };

  /* ---------- Auditorías ---------- */
  const persistIndexEntry = async (audit, calc, tipo) => {
    setIndex((prev) => {
      const entry = { id: audit.id, folio: audit.folio, tipoAuditoriaId: audit.tipoAuditoriaId, tipoNombre: tipo?.nombre || "", fecha: audit.fecha, sucursal: audit.sucursal, responsable: audit.responsable, auditor: audit.auditor, estatus: audit.estatus, finalScore: calc.finalScore, percent: calc.percent, balance: calc.balance, updatedAt: audit.updatedAt };
      const next = [...prev.filter((a) => a.id !== audit.id), entry];
      sSet("audit-index", next);
      return next;
    });
  };

  const saveDraft = async (audit) => {
    const tipo = tiposAuditoria.find((t) => t.id === audit.tipoAuditoriaId);
    const calc = calcAudit(audit, tipo?.secciones);
    await sSet(`audit:${audit.id}`, audit);
    await persistIndexEntry(audit, calc, tipo);
  };
  const finalizeAudit = async (audit) => {
    const tipo = tiposAuditoria.find((t) => t.id === audit.tipoAuditoriaId);
    const calc = calcAudit(audit, tipo?.secciones);
    await sSet(`audit:${audit.id}`, audit);
    await persistIndexEntry(audit, calc, tipo);
  };
  const deleteAudit = async (id) => {
    if (!confirm("¿Eliminar esta auditoría de forma permanente?")) return;
    await window.storage.delete(`audit:${id}`, true).catch(() => {});
    setIndex((prev) => {
      const next = prev.filter((a) => a.id !== id);
      sSet("audit-index", next);
      return next;
    });
  };

  const startNueva = () => {
    const seq = index.length + 1;
    const folio = `AUD-${new Date().getFullYear()}-${String(seq).padStart(4, "0")}`;
    setWizardState({ audit: emptyAudit(folio, user, ""), mode: "new" });
    setView("wizard");
  };
  const openAudit = async (id) => {
    const a = await sGet(`audit:${id}`);
    if (!a) return;
    setWizardState({ audit: a, mode: "view" });
    setView("wizard");
  };
  const editAudit = async (id) => {
    const a = await sGet(`audit:${id}`);
    if (!a) return;
    setWizardState({ audit: a, mode: "edit" });
    setView("wizard");
  };
  const printAuditById = async (id) => {
    const a = await sGet(`audit:${id}`);
    if (a) setPrintAudit(a);
  };

  /* ---------- Usuarios / Sucursales / Config ---------- */
  const saveUsers = async (form, mode) => {
    let next;
    if (mode === "new") next = [...users, { ...form, id: uid(), estatus: form.estatus || "Activo" }];
    else next = users.map((u) => (u.id === form.id ? form : u));
    setUsers(next);
    await sSet("users", next);
  };
  const deleteUser = async (id) => {
    if (!confirm("¿Eliminar este usuario?")) return;
    const next = users.filter((u) => u.id !== id);
    setUsers(next);
    await sSet("users", next);
  };
  const saveSucursal = async (form, mode) => {
    let next;
    if (mode === "new") next = [...sucursales, { ...form, id: uid(), estatus: form.estatus || "Activa" }];
    else next = sucursales.map((s) => (s.id === form.id ? form : s));
    setSucursales(next);
    await sSet("sucursales", next);
  };
  const deleteSucursal = async (id) => {
    if (!confirm("¿Eliminar esta sucursal?")) return;
    const next = sucursales.filter((s) => s.id !== id);
    setSucursales(next);
    await sSet("sucursales", next);
  };
  const saveConfig = async (patch) => {
    const next = { ...config, ...patch };
    setConfig(next);
    await sSet("config", next);
  };

  /* ---------- Tipos de auditoría ---------- */
  const saveTipo = async (form, mode) => {
    let next;
    if (mode === "new") next = [...tiposAuditoria, form];
    else next = tiposAuditoria.map((t) => (t.id === form.id ? form : t));
    setTiposAuditoria(next);
    await sSet("tipos-auditoria", next);
  };
  const deleteTipo = async (id) => {
    const t = tiposAuditoria.find((x) => x.id === id);
    if (t?.sistema) return;
    if (!confirm("¿Eliminar este tipo de auditoría?")) return;
    const next = tiposAuditoria.filter((x) => x.id !== id);
    setTiposAuditoria(next);
    await sSet("tipos-auditoria", next);
  };

  /* ---------- Activos ---------- */
  const saveActivo = async (form, mode) => {
    let next;
    if (mode === "new") next = [...activos, form];
    else next = activos.map((a) => (a.id === form.id ? form : a));
    setActivos(next);
    await sSet("activos", next);
  };
  const deleteActivo = async (id) => {
    if (!confirm("¿Eliminar este activo?")) return;
    const next = activos.filter((a) => a.id !== id);
    setActivos(next);
    await sSet("activos", next);
  };

  /* ---------- Acciones ---------- */
  const createAccion = async (partial) => {
    const nueva = {
      id: uid(),
      estado: "Abierta",
      comentarios: [],
      historial: [{ fecha: new Date().toISOString(), usuario: user.name, evento: "Acción creada" }],
      creadoPor: user.name,
      fechaCreacion: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...partial,
    };
    const next = [...acciones, nueva];
    setAcciones(next);
    await sSet("acciones", next);
  };
  const saveAccion = async (accion) => {
    const next = acciones.map((a) => (a.id === accion.id ? { ...accion, updatedAt: new Date().toISOString() } : a));
    setAcciones(next);
    await sSet("acciones", next);
  };
  const deleteAccion = async (id) => {
    if (!confirm("¿Eliminar esta acción?")) return;
    const next = acciones.filter((a) => a.id !== id);
    setAcciones(next);
    await sSet("acciones", next);
  };

  if (loading) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: C.royal, fontFamily: "sans-serif" }}>Cargando…</div>;
  }

  if (!user) return <Login onLogin={login} users={users} />;

  const wizardTipo = wizardState ? tiposAuditoria.find((t) => t.id === wizardState.audit.tipoAuditoriaId) : null;
  const isResp = user.role === "Responsable";

  return (
    <div style={{ display: "flex", fontFamily: "'Segoe UI', system-ui, sans-serif", background: "#F7F8FC", minHeight: "100vh" }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #pdf-root, #pdf-root * { visibility: visible; }
          #pdf-root { position: absolute; left: 0; top: 0; width: 100%; }
        }
        * { box-sizing: border-box; }
        table { font-family: inherit; }
      `}</style>

      <div className="no-print" style={{ display: printAudit ? "none" : "flex" }}>
        <Sidebar view={view} setView={(v) => { setView(v); setWizardState(null); }} user={user} onLogout={logout} config={config} />
      </div>

      <div style={{ flex: 1, padding: "26px 30px", display: printAudit ? "none" : "block", minWidth: 0 }}>
        {view === "dashboard" && !isResp && <Dashboard index={index} acciones={acciones} activos={activos} tiposAuditoria={tiposAuditoria} setView={setView} startNueva={startNueva} user={user} />}
        {view === "historial" && !isResp && <Historial index={index} sucursales={sucursales} tiposAuditoria={tiposAuditoria} openAudit={openAudit} editAudit={editAudit} printAudit={printAuditById} deleteAudit={deleteAudit} user={user} />}
        {view === "guia" && !isResp && <GuiaScreen tiposAuditoria={tiposAuditoria} />}
        {view === "nueva" && !isResp && (() => { startNueva(); return null; })()}
        {view === "activos" && (
          <ActivosScreen activos={activos} sucursales={sucursales} acciones={acciones} user={user} onSave={saveActivo} onDelete={deleteActivo} />
        )}
        {view === "acciones" && (
          <AccionesScreen acciones={acciones} sucursales={sucursales} users={users} activos={activos} tiposAuditoria={tiposAuditoria} user={user} onCreate={createAccion} onSave={saveAccion} onDelete={deleteAccion} />
        )}
        {view === "tipos" && user.role === "Administrador" && (
          <TiposAuditoriaScreen tipos={tiposAuditoria} onSave={saveTipo} onDelete={deleteTipo} />
        )}
        {view === "sucursales" && !isResp && (
          <CrudTable
            title="Sucursales" subtitle={`${sucursales.length} sucursales registradas`}
            items={sucursales}
            columns={[{ key: "nombre", label: "Nombre" }, { key: "ciudad", label: "Ciudad" }, { key: "responsable", label: "Responsable" }, { key: "estatus", label: "Estatus", render: (i) => <StatusPill status={i.estatus === "Activa" ? "Finalizada" : "Cancelada"} /> }]}
            onSave={saveSucursal} onDelete={deleteSucursal} emptyText="No hay sucursales registradas."
            formFields={[{ key: "nombre", label: "Nombre de sucursal", required: true }, { key: "ciudad", label: "Ciudad" }, { key: "responsable", label: "Responsable" }, { key: "estatus", label: "Estatus", type: "select", options: ["Activa", "Inactiva"] }]}
            initialForm={{ nombre: "", ciudad: "", responsable: "", estatus: "Activa" }}
            canDelete={user.role === "Administrador"} canEdit={user.role === "Administrador"}
          />
        )}
        {view === "usuarios" && user.role === "Administrador" && (
          <CrudTable
            title="Usuarios" subtitle={`${users.length} usuarios registrados`}
            items={users}
            columns={[{ key: "name", label: "Nombre" }, { key: "email", label: "Correo" }, { key: "role", label: "Rol" }, { key: "estatus", label: "Estatus", render: (i) => <StatusPill status={i.estatus === "Activo" ? "Finalizada" : "Cancelada"} /> }]}
            onSave={saveUsers} onDelete={deleteUser} emptyText="No hay usuarios registrados."
            formFields={[{ key: "name", label: "Nombre completo", required: true }, { key: "email", label: "Correo", type: "email", required: true }, { key: "password", label: "Contraseña", type: "password", required: true }, { key: "role", label: "Rol", type: "select", options: ["Auditor", "Administrador", "Responsable"] }, { key: "estatus", label: "Estatus", type: "select", options: ["Activo", "Inactivo"] }]}
            initialForm={{ name: "", email: "", password: "", role: "Auditor", estatus: "Activo" }}
          />
        )}
        {view === "config" && user.role === "Administrador" && (
          <ConfigScreen config={config} onSave={saveConfig} />
        )}
        {view === "wizard" && wizardState && (
          <Wizard
            initialAudit={wizardState.audit}
            tipos={tiposAuditoria}
            sucursales={sucursales}
            users={users}
            activos={activos}
            user={user}
            readOnly={wizardState.mode === "view" || (wizardState.audit.estatus === "Finalizada" && user.role !== "Administrador")}
            onSaveDraft={saveDraft}
            onFinalize={finalizeAudit}
            onCancel={() => { setView("historial"); setWizardState(null); }}
            onPrint={(a) => setPrintAudit(a)}
            onCreateAccion={createAccion}
          />
        )}
      </div>

      {printAudit && (
        <div>
          <div className="no-print" style={{ position: "fixed", top: 12, right: 12, zIndex: 300, display: "flex", gap: 8 }}>
            <Btn onClick={() => window.print()}><Icon name="download" size={15} /> Imprimir / Guardar PDF</Btn>
            <Btn variant="ghost" onClick={() => setPrintAudit(null)}><Icon name="x" size={15} /> Cerrar</Btn>
          </div>
          <PrintView audit={printAudit} tipo={tiposAuditoria.find((t) => t.id === printAudit.tipoAuditoriaId)} config={config} />
        </div>
      )}
    </div>
  );
}
