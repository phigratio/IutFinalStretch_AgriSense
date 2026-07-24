import { describe, it, expect } from "vitest";
import { addChunk, searchKB, type Mem0Like, type KbChunkMeta } from "./vectorKb.js";
import { InMemoryKbDocumentStore } from "./documentStore.js";

const chunk = (m: Partial<KbChunkMeta>, text: string, score: number) => ({
  memory: text,
  score,
  metadata: {
    scope: "hub",
    docKey: "frg:urea:boro",
    docType: "fertilizer",
    source: "FRG-2018",
    page: "42",
    dataOrigin: "manual",
    verificationStatus: "verified",
    ...m,
  } as KbChunkMeta,
});

describe("addChunk registry", () => {
  it("registers returned mem0 ids for audit", async () => {
    const documents = new InMemoryKbDocumentStore();
    const client: Mem0Like = { add: async () => ({ results: [{ id: "mem-1" }] }), search: async () => [] };
    await addChunk("advice", {
      scope: "tenant", tenantId: "t1", docKey: "local:advice", docType: "advisory",
      source: "District office", dataOrigin: "manual", verificationStatus: "verified",
    }, client, documents);
    expect(await documents.list("t1")).toMatchObject([{ docKey: "local:advice", mem0Ids: ["mem-1"] }]);
  });
});

/** Fake mem0 that returns hub vs tenant results based on the scope filter. */
function fakeMem0(hub: unknown[], tenant: unknown[]): Mem0Like {
  return {
    add: async () => ({ ok: true }),
    search: async ({ filters }) =>
      (filters as { scope?: string })?.scope === "tenant" ? { results: tenant } : { results: hub },
  };
}

describe("searchKB two-search merge (§5.2)", () => {
  it("merges hub + tenant and cites source + page", async () => {
    const client = fakeMem0(
      [chunk({ scope: "hub", docKey: "brri:blast", source: "BRRI RKB", page: "7" }, "Manage rice blast with...", 0.8)],
      [],
    );
    const hits = await searchKB("rice blast", { tenantId: "dist-kushtia" }, client);
    expect(hits).toHaveLength(1);
    expect(hits[0].citation).toBe("[KB:BRRI RKB p.7]");
    expect(hits[0].scope).toBe("hub");
  });

  it("a tenant chunk overrides the hub chunk with the same docKey", async () => {
    const client = fakeMem0(
      [chunk({ scope: "hub", docKey: "frg:urea:boro" }, "hub urea 260", 0.9)],
      [chunk({ scope: "tenant", tenantId: "dist-kushtia", docKey: "frg:urea:boro", source: "Kushtia advisory" }, "local urea 280", 0.7)],
    );
    const hits = await searchKB("urea dose", { tenantId: "dist-kushtia" }, client);
    expect(hits).toHaveLength(1); // hub one dropped by docKey override
    expect(hits[0].text).toBe("local urea 280");
    expect(hits[0].scope).toBe("tenant");
    expect(hits[0].citation).toMatch(/\(local: dist-kushtia\)/);
  });

  it("tenant boost breaks ties toward local for distinct docKeys", async () => {
    const client = fakeMem0(
      [chunk({ scope: "hub", docKey: "hub-a" }, "hub advice", 0.75)],
      [chunk({ scope: "tenant", tenantId: "t1", docKey: "tenant-a" }, "local advice", 0.7)],
    );
    const hits = await searchKB("q", { tenantId: "t1" }, client);
    // 0.7 + 0.1 boost = 0.8 > 0.75 -> local first
    expect(hits[0].text).toBe("local advice");
  });

  it("excludes mock chunks", async () => {
    const client = fakeMem0(
      [
        chunk({ scope: "hub", docKey: "real", dataOrigin: "manual" }, "real", 0.9),
        chunk({ scope: "hub", docKey: "fake", dataOrigin: "mock" }, "mock", 0.95),
      ],
      [],
    );
    const hits = await searchKB("q", {}, client);
    expect(hits.map((h) => h.text)).toEqual(["real"]);
  });

  it("excludes source-linked but unverified chunks unless admin search asks for them", async () => {
    const client = fakeMem0([
      chunk({ docKey: "verified", verificationStatus: "verified" }, "verified", 0.8),
      chunk({ docKey: "unverified", verificationStatus: "unverified" }, "unverified", 0.99),
    ], []);
    expect((await searchKB("q", {}, client)).map((hit) => hit.text)).toEqual(["verified"]);
    expect((await searchKB("q", { includeUnverified: true }, client)).map((hit) => hit.text)).toEqual(["unverified", "verified"]);
  });

  it("degrades to hub when the tenant search throws", async () => {
    const client: Mem0Like = {
      add: async () => ({}),
      search: async ({ filters }) => {
        if ((filters as { scope?: string }).scope === "tenant") throw new Error("mem0 down");
        return { results: [chunk({ scope: "hub" }, "hub only", 0.8)] };
      },
    };
    const hits = await searchKB("q", { tenantId: "t1" }, client);
    expect(hits).toHaveLength(1);
    expect(hits[0].text).toBe("hub only");
  });
});
