import { expect, test } from "bun:test";
import { interval, localToUtc, pick, utcToLocal } from "./clockify.ts";

test("localToUtc handles DST", () => {
  expect(localToUtc("2026-08-18T09:00", "Europe/Rome").toISOString()).toBe(
    "2026-08-18T07:00:00.000Z",
  );
  expect(localToUtc("2026-01-18T09:00", "Europe/Rome").toISOString()).toBe(
    "2026-01-18T08:00:00.000Z",
  );
  // round-trip back into the same zone
  expect(utcToLocal("2026-08-18T07:00:00Z", "Europe/Rome")).toMatchObject({
    date: "2026-08-18",
    time: "09:00",
  });
});

test("localToUtc is right on the transition days themselves", () => {
  // Rome springs forward 2026-03-29 02:00 CET → 03:00 CEST
  expect(localToUtc("2026-03-29T01:30", "Europe/Rome").toISOString()).toBe(
    "2026-03-29T00:30:00.000Z",
  );
  expect(localToUtc("2026-03-29T04:00", "Europe/Rome").toISOString()).toBe(
    "2026-03-29T02:00:00.000Z",
  );
  // and falls back 2026-10-25 03:00 CEST → 02:00 CET
  expect(localToUtc("2026-10-25T04:00", "Europe/Rome").toISOString()).toBe(
    "2026-10-25T03:00:00.000Z",
  );
  // a +13 zone: local midnight on a transition day is the case a single-pass offset gets wrong
  expect(localToUtc("2026-09-27T00:00", "Pacific/Auckland").toISOString()).toBe(
    "2026-09-26T12:00:00.000Z",
  );
  expect(localToUtc("2026-04-05T00:00", "Pacific/Auckland").toISOString()).toBe(
    "2026-04-04T11:00:00.000Z",
  );
  // an hour is lost on the way out and gained on the way back
  expect(interval("2026-03-29", "01:00", "05:00", "Europe/Rome").hours).toBe(3);
  expect(interval("2026-10-25", "01:00", "05:00", "Europe/Rome").hours).toBe(5);
});

test("pick: exact beats substring, ambiguous throws with candidates", () => {
  const items = [{ name: "Acme" }, { name: "Acme Maintenance" }, { name: "Other" }];
  expect(pick("project", "acme", items).name).toBe("Acme");
  expect(pick("project", "maint", items).name).toBe("Acme Maintenance");
  expect(() => pick("project", "acm", items)).toThrow(/Ambiguous.*Acme, Acme Maintenance/);
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
  // but a zero-length entry is a typo, not a 24-hour shift
  expect(() => interval("2026-08-18", "09:00", "09:00", "Europe/Rome")).toThrow(/zero-length/);
  // hours are reported to 2dp, not as 1.8333333333333333
  expect(interval("2026-08-18", "09:00", "10:50", "Europe/Rome").hours).toBe(1.83);
});
