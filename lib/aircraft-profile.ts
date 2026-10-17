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
