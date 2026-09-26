/**
 * City names people type at checkout vary ("Lahore City", "lhr", "Isb", "Pindi"). Shipping zones
 * compare the canonical form, so a zone for "Lahore" catches all of them. Also the suggestion list
 * for the checkout city field on Pakistani stores.
 */

export const PK_CITIES = [
  "Karachi", "Lahore", "Islamabad", "Rawalpindi", "Faisalabad", "Multan", "Peshawar", "Quetta", "Hyderabad", "Gujranwala",
  "Sialkot", "Sargodha", "Bahawalpur", "Sukkur", "Larkana", "Sheikhupura", "Rahim Yar Khan", "Jhang", "Dera Ghazi Khan", "Gujrat",
  "Sahiwal", "Wah Cantt", "Mardan", "Kasur", "Okara", "Mingora", "Nawabshah", "Chiniot", "Kotri", "Kamoke",
  "Hafizabad", "Sadiqabad", "Mirpur Khas", "Burewala", "Kohat", "Khanewal", "Dera Ismail Khan", "Turbat", "Muzaffargarh", "Abbottabad",
  "Mandi Bahauddin", "Jacobabad", "Jhelum", "Khanpur", "Khuzdar", "Pakpattan", "Daska", "Gojra", "Muridke", "Bahawalnagar",
  "Chakwal", "Attock", "Vehari", "Mianwali", "Taxila", "Mansehra", "Nowshera", "Swabi", "Charsadda", "Muzaffarabad", "Mirpur", "Gilgit", "Skardu",
];

const ALIASES: Record<string, string> = {
  lhr: "lahore",
  khi: "karachi",
  isb: "islamabad",
  isl: "islamabad",
  rwp: "rawalpindi",
  pindi: "rawalpindi",
  fsd: "faisalabad",
  lyallpur: "faisalabad",
  mtn: "multan",
  mux: "multan",
  pew: "peshawar",
  psh: "peshawar",
  hyd: "hyderabad",
  grw: "gujranwala",
  skt: "sialkot",
  bwp: "bahawalpur",
  "d g khan": "dera ghazi khan",
  dgk: "dera ghazi khan",
  "d i khan": "dera ismail khan",
  dik: "dera ismail khan",
  ryk: "rahim yar khan",
  wah: "wah cantt",
  "wah cantonment": "wah cantt",
  swat: "mingora",
  ajk: "muzaffarabad",
};

/** "  Lahore City " → "lahore", "LHR" → "lahore", "D.G. Khan" → "dera ghazi khan". */
export function canonicalCity(input: string | null | undefined): string {
  let c = (input ?? "").toLowerCase().replace(/[.,/#()'-]/g, " ").replace(/\s+/g, " ").trim();
  c = c.replace(/\b(city|district|cantt?onment|cant)\b$/, (m) => (/cant/.test(m) && c.startsWith("wah") ? m : "")).trim();
  c = c.replace(/\b(pakistan|pk)\b/g, "").replace(/\s+/g, " ").trim();
  return ALIASES[c] ?? c;
}
