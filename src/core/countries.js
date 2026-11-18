/**
 * Países para el campo "nacionalidad" (ISO 3166-1 alfa-2). Los nombres en español los da
 * Intl.DisplayNames (ICU incluido en Node), así no hay que mantener una lista de traducciones.
 */
const CODES =
  'AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS ' +
  'BT BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE ' +
  'EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN ' +
  'HR HT HU ID IE IL IM IN IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI ' +
  'LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA ' +
  'NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU ' +
  'RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN ' +
  'TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW';

export const COUNTRY_CODES = Object.freeze(CODES.split(' '));

const displayNames = new Intl.DisplayNames('es', { type: 'region', fallback: 'code' });

/** Nombre del país en español ("EC" → "Ecuador"). */
export const countryName = (code) => (code ? displayNames.of(code) : '');

/** Opciones para un <select>, ordenadas alfabéticamente en español. */
export const COUNTRY_OPTIONS = Object.freeze(
  COUNTRY_CODES.map((code) => ({ value: code, label: countryName(code) })).sort((a, b) =>
    a.label.localeCompare(b.label, 'es'),
  ),
);
