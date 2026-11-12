import { describe, expect, it } from "vitest";
import { createDecipheriv, createHmac } from "node:crypto";
import {
  autoSubmitPage,
  buildEasypaisaFields,
  buildJazzcashFields,
  easypaisaAmount,
  easypaisaExpiry,
  easypaisaHashedRequest,
  easypaisaHashKeyValid,
  easypaisaIpnUrlAllowed,
  easypaisaOrderRef,
  easypaisaRefTail,
  jazzcashSecureHash,
  jazzcashTxnRef,
  pkMobile,
  pktStamp,
  toPaisa,
  verifyEasypaisaIpn,
  verifyJazzcashReturn,
} from "./pk-wallets";
import { isOnlinePayment, isWalletProvider, last4, walletStatus } from "./payment-methods";

const ORDER = "cmh1a2b3c0001xyz9k8j7h6g5"; // a cuid-shaped order id (25 characters)
const SALT = "9208s6wx05";
const JC = { merchantId: "MC12345", password: "0123456789", integritySalt: SALT, sandbox: true };
const NOW = new Date("2026-11-12T20:30:45Z"); // 01:30:45 on the 13th in Pakistan

describe("Pakistan time + amounts", () => {
  it("formats yyyyMMddHHmmss in Asia/Karachi (UTC+5), rolling the date over", () => {
    expect(pktStamp(NOW)).toBe("20261113013045");
    expect(pktStamp(new Date("2026-12-31T19:00:00Z"))).toBe("20270101000000");
    expect(pktStamp(new Date("2026-03-01T04:05:06Z"))).toBe("20260301090506");
  });

  it("turns rupees into paisa without float drift", () => {
    expect(toPaisa(1499.5)).toBe(149950);
    expect(toPaisa(2500)).toBe(250000);
    expect(toPaisa(19.99)).toBe(1999);
    expect(toPaisa(1.005)).toBe(100); // a float just under 1.005 — rounds like the order total does
  });
});

describe("JazzCash secure hash", () => {
  it("is HMAC-SHA256 (uppercase hex) over salt & non-empty pp fields sorted by name", () => {
    const fields = {
      pp_Version: "1.1",
      pp_TxnType: "",
      pp_Amount: "150000",
      pp_MerchantID: "MC12345",
      pp_BillReference: "billRef",
      ppmpf_1: "extra",
      ppmpf_2: "",
      pp_SecureHash: "IGNORED",
      notAppField: "ignored too",
    };
    // assembled by hand, independently of the implementation: names sorted are
    // pp_Amount, pp_BillReference, pp_MerchantID, pp_Version, ppmpf_1 — empties and non-pp fields left out
    const message = `${SALT}&150000&billRef&MC12345&1.1&extra`;
    const expected = createHmac("sha256", SALT).update(message).digest("hex").toUpperCase();
    expect(jazzcashSecureHash(fields, SALT)).toBe(expected);
    expect(jazzcashSecureHash(fields, SALT)).toMatch(/^[0-9A-F]{64}$/);
  });

  it("changes when any signed value changes and refuses an empty salt", () => {
    const a = jazzcashSecureHash({ pp_Amount: "100", pp_TxnRefNo: "T1" }, SALT);
    expect(jazzcashSecureHash({ pp_Amount: "101", pp_TxnRefNo: "T1" }, SALT)).not.toBe(a);
    expect(jazzcashSecureHash({ pp_Amount: "100", pp_TxnRefNo: "T1" }, "othersalt")).not.toBe(a);
    expect(() => jazzcashSecureHash({ pp_Amount: "100" }, "")).toThrow();
  });
});

describe("JazzCash form fields", () => {
  const fields = buildJazzcashFields({ creds: JC, orderId: ORDER, amount: 1499.5, returnUrl: "https://shop.example/api/store/b1/pay/jazzcash/return", now: NOW });

  it("builds the v1.1 page-redirection fields", () => {
    expect(fields).toMatchObject({
      pp_Version: "1.1",
      pp_TxnType: "",
      pp_Language: "EN",
      pp_MerchantID: "MC12345",
      pp_Password: "0123456789",
      pp_Amount: "149950",
      pp_TxnCurrency: "PKR",
      pp_TxnDateTime: "20261113013045",
      pp_TxnExpiryDateTime: "20261113023045",
      pp_ReturnURL: "https://shop.example/api/store/b1/pay/jazzcash/return",
      ppmpf_1: ORDER,
    });
    for (const k of ["ppmpf_2", "ppmpf_3", "ppmpf_4", "ppmpf_5", "pp_BankID", "pp_ProductID", "pp_SubMerchantID"]) expect(fields[k]).toBe("");
    expect(fields.pp_BillReference).toMatch(/^[A-Za-z0-9]{1,20}$/);
    expect(fields.pp_Description).toBe(`Order ${ORDER.slice(-6).toUpperCase()}`);
  });

  it("signs them with a hash that verifies", () => {
    expect(fields.pp_SecureHash).toBe(jazzcashSecureHash(fields, SALT));
  });

  it("gives every attempt its own short alphanumeric reference tied to the order", () => {
    const a = jazzcashTxnRef(ORDER, NOW);
    const b = jazzcashTxnRef(ORDER, new Date(NOW.getTime() + 1000));
    expect(a).not.toBe(b);
    expect(a).toMatch(/^T[A-Z0-9]{11,19}$/);
    expect(a.startsWith(`T${ORDER.slice(-10).toUpperCase()}`)).toBe(true);
    expect(fields.pp_TxnRefNo).toBe(a);
  });
});

describe("JazzCash response verification", () => {
  const expect_ = { integritySalt: SALT, merchantId: "MC12345", orderId: ORDER, amount: 1499.5 };
  function response(over: Record<string, string> = {}, resign = true): Record<string, string> {
    const f: Record<string, string> = {
      pp_Amount: "149950",
      pp_AuthCode: "",
      pp_BillReference: `ord${ORDER.slice(-10)}`,
      pp_Language: "EN",
      pp_MerchantID: "MC12345",
      pp_ResponseCode: "000",
      pp_ResponseMessage: "Thank you for Using JazzCash, your transaction was successful.",
      pp_RetreivalReferenceNo: "261113012345",
      pp_TxnCurrency: "PKR",
      pp_TxnDateTime: "20261113013045",
      pp_TxnRefNo: jazzcashTxnRef(ORDER, NOW),
      pp_TxnType: "MWALLET",
      pp_Version: "1.1",
      ppmpf_1: ORDER,
      ...over,
    };
    if (resign) f.pp_SecureHash = jazzcashSecureHash(f, SALT);
    return f;
  }

  it("accepts a correctly signed success for this order and amount", () => {
    expect(verifyJazzcashReturn(response(), expect_)).toEqual({ ok: true, ref: jazzcashTxnRef(ORDER, NOW) });
  });

  it("accepts the hash in lowercase too", () => {
    const f = response();
    f.pp_SecureHash = f.pp_SecureHash.toLowerCase();
    expect(verifyJazzcashReturn(f, expect_).ok).toBe(true);
  });

  it("rejects a tampered field, a forged hash and a missing hash", () => {
    const tampered = response();
    tampered.pp_Amount = "100"; // changed after signing
    expect(verifyJazzcashReturn(tampered, expect_)).toMatchObject({ ok: false, reason: "unverified" });

    const failedMadeToLookPaid = response({ pp_ResponseCode: "199" });
    failedMadeToLookPaid.pp_ResponseCode = "000";
    expect(verifyJazzcashReturn(failedMadeToLookPaid, expect_)).toMatchObject({ ok: false, reason: "unverified" });

    const wrongSalt = response({}, false);
    wrongSalt.pp_SecureHash = jazzcashSecureHash(wrongSalt, "attacker-salt");
    expect(verifyJazzcashReturn(wrongSalt, expect_)).toMatchObject({ ok: false, reason: "unverified" });

    expect(verifyJazzcashReturn(response({}, false), expect_)).toMatchObject({ ok: false, reason: "unverified" });
    expect(verifyJazzcashReturn({}, expect_)).toMatchObject({ ok: false, reason: "unverified" });
  });

  it("rejects a properly signed non-success code", () => {
    for (const code of ["199", "124", "157", "", "0"]) {
      expect(verifyJazzcashReturn(response({ pp_ResponseCode: code }), expect_)).toMatchObject({ ok: false, reason: "declined" });
    }
  });

  it("rejects a properly signed success for the wrong amount, order, reference or merchant", () => {
    expect(verifyJazzcashReturn(response({ pp_Amount: "100" }), expect_)).toMatchObject({ ok: false, reason: "mismatch" });
    expect(verifyJazzcashReturn(response({ pp_Amount: "149950.0" }), expect_)).toMatchObject({ ok: false, reason: "mismatch" });
    expect(verifyJazzcashReturn(response({ ppmpf_1: "cmh1a2b3c0001someotherorder" }), expect_)).toMatchObject({ ok: false, reason: "mismatch" });
    expect(verifyJazzcashReturn(response({ pp_TxnRefNo: "TANOTHERORDER123" }), expect_)).toMatchObject({ ok: false, reason: "mismatch" });
    expect(verifyJazzcashReturn(response({ pp_MerchantID: "MC99999" }), expect_)).toMatchObject({ ok: false, reason: "mismatch" });
    // a real payment of a cheaper order can't pay for a dearer one
    expect(verifyJazzcashReturn(response(), { ...expect_, amount: 5000 })).toMatchObject({ ok: false, reason: "mismatch" });
  });
});

describe("Easypaisa hashed request", () => {
  const KEY = "ABCDEFGH12345678"; // 16 characters → AES-128

  function decrypt(b64: string, key: string): string {
    const k = Buffer.from(key, "utf8");
    const d = createDecipheriv(`aes-${k.length * 8}-ecb`, k, null);
    return Buffer.concat([d.update(Buffer.from(b64, "base64")), d.final()]).toString("utf8");
  }

  it("is AES-128-ECB (PKCS5) of key=value pairs sorted by name, base64", () => {
    const hashed = easypaisaHashedRequest({ storeId: "1234", amount: "100.0", postBackURL: "https://x.example/back", orderRefNum: "abc", autoRedirect: "1" }, KEY);
    expect(hashed).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(Buffer.from(hashed, "base64").length % 16).toBe(0);
    expect(decrypt(hashed, KEY)).toBe("amount=100.0&autoRedirect=1&orderRefNum=abc&postBackURL=https://x.example/back&storeId=1234");
  });

  it("is deterministic (ECB has no IV) and depends on both the text and the key", () => {
    const a = easypaisaHashedRequest({ a: "1" }, KEY);
    const b = easypaisaHashedRequest({ a: "1" }, KEY);
    expect(a).toBe(b);
    expect(easypaisaHashedRequest({ a: "2" }, KEY)).not.toBe(a);
    expect(easypaisaHashedRequest({ a: "1" }, "ABCDEFGH12345679")).not.toBe(a);
  });

  it("accepts 16 / 24 / 32 character keys and refuses anything else", () => {
    expect(easypaisaHashKeyValid(KEY)).toBe(true);
    expect(easypaisaHashKeyValid("x".repeat(24))).toBe(true);
    expect(easypaisaHashKeyValid("x".repeat(32))).toBe(true);
    expect(easypaisaHashKeyValid("short")).toBe(false);
    expect(() => easypaisaHashedRequest({ a: "1" }, "short")).toThrow();
    expect(decrypt(easypaisaHashedRequest({ a: "1" }, "y".repeat(32)), "y".repeat(32))).toBe("a=1");
  });

  it("builds the Index.jsf fields and hashes exactly what it posts", () => {
    const f = buildEasypaisaFields({
      creds: { storeId: "1234", hashKey: KEY, sandbox: true },
      orderId: ORDER,
      amount: 1499.5,
      postBackUrl: "https://shop.example/api/store/b1/pay/easypaisa/return",
      email: "buyer@example.com",
      phone: "+92 300 1234567",
      now: NOW,
    });
    expect(f).toMatchObject({
      storeId: "1234",
      amount: "1499.5",
      autoRedirect: "1",
      expiryDate: "20261114 013045",
      postBackURL: "https://shop.example/api/store/b1/pay/easypaisa/return",
      emailAddr: "buyer@example.com",
      mobileNum: "03001234567",
      orderRefNum: easypaisaOrderRef(ORDER, NOW),
    });
    const { merchantHashedReq, ...posted } = f;
    const expected = Object.keys(posted).sort().map((k) => `${k}=${posted[k]}`).join("&");
    expect(decrypt(merchantHashedReq, KEY)).toBe(expected);
  });

  it("leaves out an email or phone it doesn't have, from the form and the hash alike", () => {
    const f = buildEasypaisaFields({ creds: { storeId: "1234", hashKey: KEY, sandbox: true }, orderId: ORDER, amount: 500, postBackUrl: "https://s.example/r", phone: "12345", now: NOW });
    expect(f.emailAddr).toBeUndefined();
    expect(f.mobileNum).toBeUndefined();
    expect(decrypt(f.merchantHashedReq, KEY)).not.toContain("mobileNum");
    expect(f.amount).toBe("500.0");
  });

  it("formats amount, expiry, references and phone numbers", () => {
    expect(easypaisaAmount(100)).toBe("100.0");
    expect(easypaisaExpiry(new Date("2026-12-30T19:30:00Z"))).toBe("20270101 003000");
    const ref = easypaisaOrderRef(ORDER, NOW);
    expect(ref).toMatch(/^[a-z0-9]{15}$/);
    expect(easypaisaRefTail(ref)).toBe(ORDER.slice(-10));
    expect(easypaisaOrderRef(ORDER, new Date(NOW.getTime() + 1000))).not.toBe(ref);
    expect(easypaisaRefTail("short")).toBeNull();
    expect(easypaisaRefTail("has spaces in it!")).toBeNull();
    expect(pkMobile("03001234567")).toBe("03001234567");
    expect(pkMobile("923001234567")).toBe("03001234567");
    expect(pkMobile("0215551234")).toBeNull();
  });
});

describe("Easypaisa IPN", () => {
  const expect_ = { storeId: "1234", orderId: ORDER, amount: 1499.5 };
  const paid = {
    order_id: easypaisaOrderRef(ORDER, NOW),
    store_id: 1234,
    transaction_id: "8811223344",
    transaction_status: "PAID",
    transaction_amount: "1499.5",
    payment_method: "MA",
    response_code: "0000",
  };

  it("only fetches https addresses on Easypaisa's own host for the seller's mode", () => {
    expect(easypaisaIpnUrlAllowed("https://easypay.easypaisa.com.pk/easypay-service/rest/v1/order-status/1/2", false)).toBe(true);
    expect(easypaisaIpnUrlAllowed("https://easypaystg.easypaisa.com.pk/easypay-service/rest/v1/order-status/1/2", true)).toBe(true);
    expect(easypaisaIpnUrlAllowed("https://easypaystg.easypaisa.com.pk/x", false)).toBe(false); // staging can't pay a live store
    expect(easypaisaIpnUrlAllowed("http://easypay.easypaisa.com.pk/x", false)).toBe(false);
    expect(easypaisaIpnUrlAllowed("https://easypay.easypaisa.com.pk.evil.example/x", false)).toBe(false);
    expect(easypaisaIpnUrlAllowed("https://evil.example/?h=easypay.easypaisa.com.pk", false)).toBe(false);
    expect(easypaisaIpnUrlAllowed("https://user:pw@easypay.easypaisa.com.pk/x", false)).toBe(false);
    expect(easypaisaIpnUrlAllowed("https://easypay.easypaisa.com.pk:8443/x", false)).toBe(false);
    expect(easypaisaIpnUrlAllowed("https://169.254.169.254/latest", false)).toBe(false);
    expect(easypaisaIpnUrlAllowed("not a url", false)).toBe(false);
  });

  it("accepts a PAID record for this store, order and amount", () => {
    expect(verifyEasypaisaIpn(paid, expect_)).toEqual({ ok: true, ref: paid.order_id });
  });

  it("rejects anything that isn't PAID with code 0000", () => {
    for (const s of ["PENDING", "FAILED", "EXPIRED", "", undefined]) {
      expect(verifyEasypaisaIpn({ ...paid, transaction_status: s }, expect_)).toMatchObject({ ok: false, reason: "declined" });
    }
    expect(verifyEasypaisaIpn({ ...paid, response_code: "0001" }, expect_)).toMatchObject({ ok: false, reason: "declined" });
  });

  it("rejects the wrong amount, store or order, and junk", () => {
    expect(verifyEasypaisaIpn({ ...paid, transaction_amount: "10.0" }, expect_)).toMatchObject({ ok: false, reason: "mismatch" });
    expect(verifyEasypaisaIpn({ ...paid, transaction_amount: undefined }, expect_)).toMatchObject({ ok: false, reason: "mismatch" });
    expect(verifyEasypaisaIpn({ ...paid, transaction_amount: "abc" }, expect_)).toMatchObject({ ok: false, reason: "mismatch" });
    expect(verifyEasypaisaIpn({ ...paid, store_id: "9999" }, expect_)).toMatchObject({ ok: false, reason: "mismatch" });
    expect(verifyEasypaisaIpn({ ...paid, order_id: "zzzzzzzzzz12345" }, expect_)).toMatchObject({ ok: false, reason: "mismatch" });
    expect(verifyEasypaisaIpn(paid, { ...expect_, amount: 5000 })).toMatchObject({ ok: false, reason: "mismatch" });
    for (const junk of [null, "PAID", [], 42]) expect(verifyEasypaisaIpn(junk, expect_)).toMatchObject({ ok: false, reason: "unverified" });
  });
});

describe("hand-off page + helpers", () => {
  it("escapes field values and posts to the wallet", () => {
    const html = autoSubmitPage("https://sandbox.jazzcash.com.pk/x", { pp_Description: `a"><script>alert(1)</script>` }, "JazzCash");
    expect(html).toContain(`action="https://sandbox.jazzcash.com.pk/x"`);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&quot;&gt;&lt;script&gt;");
  });

  it("knows which methods are wallets / online, and never reveals more than 4 characters", () => {
    expect(isWalletProvider("jazzcash")).toBe(true);
    expect(isWalletProvider("stripe")).toBe(false);
    expect(isOnlinePayment("easypaisa")).toBe(true);
    expect(isOnlinePayment("cod")).toBe(false);
    expect(last4("0123456789")).toBe("6789");
    expect(last4("abc")).toBe("•••");
    expect(last4(null)).toBeNull();
    const status = walletStatus({
      jazzcashMerchantId: "MC12345",
      jazzcashPassword: "supersecretpw",
      jazzcashIntegritySalt: "saltsaltsalt1",
      jazzcashSandbox: false,
      easypaisaStoreId: "98765",
      easypaisaHashKey: "ABCDEFGH12345678",
      easypaisaSandbox: true,
    });
    expect(status.jazzcash).toEqual({ configured: true, sandbox: false, merchantIdLast4: "2345", passwordLast4: "etpw", integritySaltLast4: "alt1" });
    const json = JSON.stringify(status);
    for (const secret of ["supersecretpw", "saltsaltsalt1", "ABCDEFGH12345678"]) expect(json).not.toContain(secret);
  });
});
