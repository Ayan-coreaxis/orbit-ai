import { describe, expect, it } from "vitest";
import { localPhone, missingFields, normaliseStatus, parseCreds, providerFromName } from "@/lib/courier";

describe("courier helpers", () => {
  it("maps courier words to one status", () => {
    expect(normaliseStatus("Delivered")).toBe("delivered");
    expect(normaliseStatus("Returned to shipper")).toBe("returned");
    expect(normaliseStatus("Being Return")).toBe("returning");
    expect(normaliseStatus("Out for Delivery")).toBe("out_for_delivery");
    expect(normaliseStatus("Delivery Attempted - consignee not available")).toBe("attempted");
    expect(normaliseStatus("Undelivered")).toBe("attempted");
    expect(normaliseStatus("En-Route to Lahore warehouse")).toBe("in_transit");
    expect(normaliseStatus("Unbooked")).toBe("booked");
    expect(normaliseStatus("Cancelled")).toBe("cancelled");
    expect(normaliseStatus("???")).toBe("unknown");
  });

  it("formats Pakistani mobiles the way couriers want", () => {
    expect(localPhone("+92 300 1234567")).toBe("03001234567");
    expect(localPhone("0092-300-1234567")).toBe("03001234567");
    expect(localPhone("3001234567")).toBe("03001234567");
    expect(localPhone("03001234567")).toBe("03001234567");
  });

  it("reads old and new saved credentials", () => {
    expect(parseCreds("key:pass", "leopards")).toEqual({ leopards: { apiKey: "key", apiPassword: "pass" } });
    expect(parseCreds("tok", "postex")).toEqual({ postex: { token: "tok" } });
    const j = parseCreds(JSON.stringify({ tcs: { clientId: "c", userName: "u", password: "", costCenterCode: "1", originCity: "Lahore" } }), "tcs");
    expect(missingFields("tcs", j)).toEqual(["COD portal password"]);
    expect(missingFields("postex", { postex: { token: "t" } })).toEqual([]);
    expect(providerFromName("Leopards")).toBe("leopards");
    expect(providerFromName("M&P")).toBeNull();
  });
});
