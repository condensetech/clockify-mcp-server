import { expect, test } from "bun:test";
import { interval, localToUtc, pick, utcToLocal } from "./clockify.ts";

test("localToUtc handles DST", () => {
  expect(localToUtc("2026-08-18T09:00", "Europe/Rome").toISOString()).toBe("2026-08-18T07:00:00.000Z");
  expect(localToUtc("2026-01-18T09:00", "Europe/Rome").toISOString()).toBe("2026-01-18T08:00:00.000Z");
  // round-trip back into the same zone
  expect(utcToLocal("2026-08-18T07:00:00Z", "Europe/Rome")).toMatchObject({ date: "2026-08-18", time: "09:00" });
});

test("pick: exact beats substring, ambiguous throws with candidates", () => {
  const items = [{ name: "Sinelec" }, { name: "Sinelec Maintenance" }, { name: "Other" }];
  expect(pick("project", "sinelec", items).name).toBe("Sinelec");
  expect(pick("project", "maint", items).name).toBe("Sinelec Maintenance");
  expect(() => pick("project", "sine", items)).toThrow(/Ambiguous.*Sinelec, Sinelec Maintenance/);
  expect(() => pick("project", "nope", items)).toThrow(/Unknown/);
});

test("interval builds second-precision ISO-Z and hours", () => {
  expect(interval("2026-08-18", "09:00", "13:00", "Europe/Rome")).toEqual({
    start: "2026-08-18T07:00:00Z",
    end: "2026-08-18T11:00:00Z",
    hours: 4,
  });
  // overnight rolls to the next local day
  expect(interval("2026-08-18", "22:00", "02:00", "Europe/Rome").end).toBe("2026-08-19T00:00:00Z");
});
