/**
 * Equipment profile for CC-AQI. Used by the compliance auditor to decide whether
 * a newly published Airworthiness Directive is applicable to THIS aircraft down
 * to the serial-number level (the same reasoning a mechanic does by hand).
 *
 * Source: the DGAC maintenance records and the aircraft's own data plates.
 */
export interface EquipmentItem {
  dominio: "AIRFRAME" | "ENGINE" | "PROPELLER";
  categoria: string; // human label, e.g. "Fuselaje", "Magneto izquierdo"
  fabricante: string;
  modelo: string;
  serial?: string | string[];
}

export const AIRCRAFT_PROFILE = {
  matricula: "CC-AQI",
  categoria: "Normal", // airworthiness category (matters for many ADs)
  equipos: [
    { dominio: "AIRFRAME", categoria: "Aeronave (célula)", fabricante: "Cessna", modelo: "172N", serial: "17273461" },
    { dominio: "ENGINE", categoria: "Motor", fabricante: "Lycoming", modelo: "O-320-D2J", serial: "RL-7662-39E" },
    { dominio: "PROPELLER", categoria: "Hélice", fabricante: "McCauley", modelo: "1C160/DTM7557", serial: "81737" },
    { dominio: "ENGINE", categoria: "Magnetos", fabricante: "Slick", modelo: "4371", serial: ["22020846", "22030883"] },
    { dominio: "ENGINE", categoria: "Carburador", fabricante: "AVSTAR", modelo: "AV10-5217", serial: "AV53977461" },
  ] as EquipmentItem[],
} as const;

/** Compact one-line description of the fleet used inside the GPT applicability prompt. */
export function profileForPrompt(): string {
  return AIRCRAFT_PROFILE.equipos
    .map((e) => {
      const sn = Array.isArray(e.serial) ? e.serial.join(" / ") : e.serial;
      return `- ${e.categoria}: ${e.fabricante} ${e.modelo}${sn ? ` (S/N ${sn})` : ""} [${e.dominio}]`;
    })
    .join("\n");
}

/**
 * Verified, document-backed facts about THIS airframe/engine that let the
 * applicability assessor resolve serial-number / ship-date / configuration
 * conditions instead of flagging everything "verificar". Each fact cites its
 * evidence so the GPT reasoning stays auditable.
 */
export const KNOWN_FACTS: string[] = [
  "Motor: REBUILT de fábrica Lycoming, SHIP DATE 14-jul-2022 (registro oficial lycoming.com/rl-7662-39e; factura Eagle Copters N°6941 del 28-sep-2022). Todo SB/AD cuyo rango de despacho de motor termine antes del 14-jul-2022 NO aplica por grupo de motor; los que empiecen en/antes de jul-2022 y terminen después SÍ pueden aplicar.",
  "Sistema de combustible: Cessna 172N de ala alta ALIMENTADO POR GRAVEDAD — NO tiene bomba de combustible mecánica accionada por el motor ni bomba eléctrica auxiliar de inyección. SBs de fuel pumps/diaphragms NO aplican.",
  "Inducción: carburador AVSTAR AV10-5217 (flotador). NO tiene inyección de combustible (sin fuel servo), NO tiene turbo, NO tiene E-MAG ni encendido electrónico.",
  "Magnetos: Slick 4371 (con acople de impulso), S/N 22020846 y 22030883 — fabricados ~2022 (prefijo de serial 2202/2203 = año-mes). Para SBs de magnetos Slick con rango de seriales/fechas, usar esa fecha de fabricación.",
  "Desde la instalación del motor (2022) NO se han reemplazado bielas, bujes de biela ni pasadores de pistón; no se han instalado repuestos internos del motor fuera de los originales del rebuilt.",
  "Hélice: McCauley 1C160/DTM7557 de paso fijo, sin governor.",
];

export function factsForPrompt(): string {
  return KNOWN_FACTS.map((f) => `- ${f}`).join("\n");
}

/** Search terms fed to the FAA Federal Register API to find candidate ADs. */
export const FAA_SEARCH_TERMS = [
  "Cessna 172",
  "Lycoming O-320",
  "McCauley propeller",
  "Slick magneto",
];

/**
 * Keywords used to pre-filter the full 14 CFR Part 39 sweep (the Federal
 * Register equivalent of the FAA AD Biweekly). An AD whose title/abstract
 * mentions none of these cannot apply to the fleet, so it is skipped without
 * spending a GPT assessment. Case-insensitive substring match.
 */
export const FLEET_KEYWORDS = [
  "cessna",
  "textron aviation", // Cessna's type-certificate holder ("Bell Textron" = helicopters, excluded)
  "lycoming",
  "mccauley",
  "slick",
  "champion aerospace", // current manufacturer of Slick magnetos
  "avstar",
  "carburetor",
];
