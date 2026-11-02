import { expect, test } from "bun:test";
import { interval, localToUtc, pick, utcToLocal } from "./clockify.ts";

test("localToUtc handles DST", () => {
  expect(localToUtc("2026-08-18T09:00", "Europe/Rome").toISOString()).toBe(
    "2026-08-18T07:00:00.000Z",
  );
  expect(localToUtc("2026-01-18T09:00", "Europe/Rome").toISOString()).toBe(
    "2026-01-18T08:00:00.000Z",
  );
  expect(utcToLocal("2026-08-18T07:00:00Z", "Europe/Rome")).toMatchObject({
    date: "2026-08-18",
    time: "09:00",
  });
});

test.each([
  ["before Rome springs forward", "2026-03-29T01:30", "Europe/Rome", "2026-03-29T00:30:00.000Z"],
  ["after Rome springs forward", "2026-03-29T04:00", "Europe/Rome", "2026-03-29T02:00:00.000Z"],
  ["after Rome falls back", "2026-10-25T04:00", "Europe/Rome", "2026-10-25T03:00:00.000Z"],
  [
    "local midnight on Auckland's spring-forward day",
    "2026-09-27T00:00",
    "Pacific/Auckland",
    "2026-09-26T12:00:00.000Z",
  ],
  [
    "local midnight on Auckland's fall-back day",
    "2026-04-05T00:00",
    "Pacific/Auckland",
    "2026-04-04T11:00:00.000Z",
  ],
])("localToUtc is right %s", (_, local, tz, utc) => {
  expect(localToUtc(local, tz).toISOString()).toBe(utc);
});

test("interval loses an hour across spring-forward", () => {
  expect(interval("2026-03-29", "01:00", "05:00", "Europe/Rome").hours).toBe(3);
});

test("interval gains an hour across fall-back", () => {
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
});

test("interval rolls an end before the start to the next local day", () => {
  expect(interval("2026-08-18", "22:00", "02:00", "Europe/Rome").end).toBe("2026-08-19T00:00:00Z");
});

test("interval refuses a zero-length entry instead of logging 24 hours", () => {
  expect(() => interval("2026-08-18", "09:00", "09:00", "Europe/Rome")).toThrow(/zero-length/);
});

test("interval rounds hours to 2 decimals", () => {
  expect(interval("2026-08-18", "09:00", "10:50", "Europe/Rome").hours).toBe(1.83);
});
