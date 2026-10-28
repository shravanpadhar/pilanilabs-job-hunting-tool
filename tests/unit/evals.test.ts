import { describe, expect, it } from "vitest";
import { checkVerifier, loadGolden } from "../../evals/run-fabrication";

// The regression suite: the verifier must agree with every human label in the golden set, on every prompt or model change.
describe("fabrication golden set", () => {
  const golden = loadGolden();
  const results = checkVerifier(golden);

  it("has both clean and fabricated examples, and covers every violation kind", () => {
    expect(golden.cases.some((c) => c.expect === "clean")).toBe(true);
    const kinds = new Set(golden.cases.flatMap((c) => c.kinds ?? []));
    for (const k of ["name", "number", "link", "mutual_connection", "flattery", "pressure"]) expect(kinds.has(k), k).toBe(true);
  });

  for (const r of results) {
    it(`${r.id}`, () => expect(r.ok, `${r.expected}; found ${JSON.stringify(r.found)} ${r.note ?? ""}`).toBe(true));
  }
});
