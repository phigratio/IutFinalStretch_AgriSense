import { describe, it, expect, vi, afterEach } from "vitest";
import { BdappsClient, BdappsError, isSuccess } from "./client.js";
import { toTelAddress } from "./phone.js";
import { handleUssdMenu } from "./ussdMenu.js";
import { InMemoryChannelStore } from "./channel.js";
import type { BdappsConfig } from "./config.js";

const cfg: BdappsConfig = {
  baseUrl: "https://api.test",
  applicationId: "APP_TEST",
  password: "secret",
  appName: "Demo",
};

/** Stub global fetch to return the given JSON, and capture the request. */
function stubFetch(responseBody: object, status = 200) {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify(responseBody), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Read the URL + parsed JSON body from the first fetch call. */
function firstCall(fetchMock: ReturnType<typeof stubFetch>) {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return { url, body: JSON.parse(init.body as string) };
}

afterEach(() => vi.unstubAllGlobals());

describe("toTelAddress", () => {
  it("normalizes local, 88, and 880 formats", () => {
    expect(toTelAddress("01812345678")).toBe("tel:8801812345678");
    expect(toTelAddress("+8801812345678")).toBe("tel:8801812345678");
    expect(toTelAddress("018-1234 5678")).toBe("tel:8801812345678");
  });

  it("passes through an existing tel: (masked) address unchanged", () => {
    expect(toTelAddress("tel:MASKED_abc123")).toBe("tel:MASKED_abc123");
  });

  it("rejects invalid numbers", () => {
    expect(() => toTelAddress("12345")).toThrow(/Invalid/);
  });
});

describe("BdappsClient request building", () => {
  it("sendSms posts credentials + normalized address", async () => {
    const fetchMock = stubFetch({ statusCode: "S1000", requestId: "1" });
    const res = await new BdappsClient(cfg).sendSms("01812345678", "hi");

    expect(isSuccess(res)).toBe(true);
    const { url, body } = firstCall(fetchMock);
    expect(url).toBe("https://api.test/sms/send");
    expect(body).toMatchObject({
      applicationId: "APP_TEST",
      password: "secret",
      message: "hi",
      destinationAddresses: ["tel:8801812345678"],
    });
  });

  it("broadcastSms sends to tel:all (not normalized)", async () => {
    const fetchMock = stubFetch({ statusCode: "S1000" });
    await new BdappsClient(cfg).broadcastSms("hello everyone");
    expect(firstCall(fetchMock).body.destinationAddresses).toEqual(["tel:all"]);
  });

  it("sendUssd posts session + operation", async () => {
    const fetchMock = stubFetch({ statusCode: "S1000" });
    await new BdappsClient(cfg).sendUssd({
      sessionId: "S1",
      destinationAddress: "tel:MASKED_x",
      message: "menu",
      operation: "mt-fin",
    });
    const { url, body } = firstCall(fetchMock);
    expect(url).toBe("https://api.test/ussd/send");
    expect(body).toMatchObject({
      sessionId: "S1",
      destinationAddress: "tel:MASKED_x",
      ussdOperation: "mt-fin",
      message: "menu",
    });
  });

  it("queryBalance hits the balance endpoint", async () => {
    const fetchMock = stubFetch({ statusCode: "S1000", chargeableBalance: "100" });
    const res = await new BdappsClient(cfg).queryBalance("01812345678");
    expect(res.chargeableBalance).toBe("100");
    expect(firstCall(fetchMock).url).toBe("https://api.test/caas/balance/query");
  });

  it("directDebit sends amount as string + auto externalTrxId", async () => {
    const fetchMock = stubFetch({ statusCode: "S1000", internalTrxId: "abc" });
    await new BdappsClient(cfg).directDebit({ mobile: "01812345678", amount: 2 });
    const { url, body } = firstCall(fetchMock);
    expect(url).toBe("https://api.test/caas/direct/debit");
    expect(body.amount).toBe("2");
    expect(typeof body.externalTrxId).toBe("string");
  });

  it("requestOtp includes applicationHash + metadata", async () => {
    const fetchMock = stubFetch({ statusCode: "S1000", referenceNo: "ref123" });
    const res = await new BdappsClient(cfg).requestOtp("01812345678");
    expect(res.referenceNo).toBe("ref123");
    const { url, body } = firstCall(fetchMock);
    expect(url).toBe("https://api.test/subscription/otp/request");
    expect(body.applicationHash).toBe("Demo");
    expect(body.applicationMetaData).toMatchObject({ client: "WEBAPP" });
  });

  it("verifyOtp posts referenceNo + otp", async () => {
    const fetchMock = stubFetch({ statusCode: "S1000", subscriptionStatus: "REGISTERED" });
    await new BdappsClient(cfg).verifyOtp("ref123", "123456");
    expect(firstCall(fetchMock).body).toMatchObject({ referenceNo: "ref123", otp: "123456" });
  });

  it("subscribe/unsubscribe use action 1 / 0", async () => {
    const subMock = stubFetch({ statusCode: "S1000" });
    await new BdappsClient(cfg).subscribe("01812345678");
    expect(firstCall(subMock).body.action).toBe("1");
    vi.unstubAllGlobals();

    const unsubMock = stubFetch({ statusCode: "S1000" });
    await new BdappsClient(cfg).unsubscribe("01812345678");
    expect(firstCall(unsubMock).body.action).toBe("0");
  });
});

describe("error handling", () => {
  it("throws E_CONFIG when credentials are missing", async () => {
    stubFetch({ statusCode: "S1000" });
    const noCreds = new BdappsClient({ ...cfg, applicationId: "", password: "" });
    await expect(noCreds.sendSms("01812345678", "hi")).rejects.toBeInstanceOf(BdappsError);
  });

  it("throws E_PARSE on non-JSON responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>error</html>", { status: 500 })));
    await expect(new BdappsClient(cfg).queryBalance("01812345678")).rejects.toMatchObject({
      statusCode: "E_PARSE",
    });
  });

  it("surfaces a failed statusCode without throwing", async () => {
    stubFetch({ statusCode: "E1326", statusDetail: "Insufficient balance" });
    const res = await new BdappsClient(cfg).directDebit({ mobile: "01812345678", amount: 999 });
    expect(isSuccess(res)).toBe(false);
    expect(res.statusCode).toBe("E1326");
  });
});

describe("handleUssdMenu", () => {
  const channel = new InMemoryChannelStore();

  it("shows the AgriSense menu on mo-init and keeps the session open", async () => {
    const reply = await handleUssdMenu(
      { message: "", sessionId: "S1", sourceAddress: "tel:x", ussdOperation: "mo-init" },
      { channel },
    );
    expect(reply.operation).toBe("mt-cont");
    expect(reply.message).toMatch(/AgriSense/);
    expect(reply.message).toMatch(/My season plan/);
  });

  it("option 3 opts into SMS alerts and ends the session", async () => {
    const reply = await handleUssdMenu(
      { message: "3", sessionId: "S1", sourceAddress: "tel:ussdMASK", ussdOperation: "mo-cont" },
      { channel },
    );
    expect(reply.operation).toBe("mt-fin");
    expect(reply.message).toMatch(/alerts by SMS/i);
    expect((await channel.getBySubscriberId("tel:ussdMASK"))?.active).toBe(true);
  });

  it("invalid option ends with a retry hint", async () => {
    const reply = await handleUssdMenu(
      { message: "9", sessionId: "S1", sourceAddress: "tel:x", ussdOperation: "mo-cont" },
      { channel },
    );
    expect(reply.operation).toBe("mt-fin");
    expect(reply.message).toMatch(/Invalid/i);
  });
});
