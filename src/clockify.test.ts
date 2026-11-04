import { expect, test } from "bun:test";
import { interval, pick, profileTimeToUtc, utcToProfileTime } from "./clockify.ts";

test("profileTimeToUtc handles DST", () => {
  expect(profileTimeToUtc("2026-08-18T09:00", "Europe/Rome").toString()).toBe(
    "2026-08-18T07:00:00Z",
  );
  expect(profileTimeToUtc("2026-01-18T09:00", "Europe/Rome").toString()).toBe(
    "2026-01-18T08:00:00Z",
  );
  expect(utcToProfileTime("2026-08-18T07:00:00Z", "Europe/Rome")).toMatchObject({
    date: "2026-08-18",
    time: "09:00",
  });
});

test.each([
  ["before Rome springs forward", "2026-03-29T01:30", "Europe/Rome", "2026-03-29T00:30:00Z"],
  ["after Rome springs forward", "2026-03-29T04:00", "Europe/Rome", "2026-03-29T02:00:00Z"],
  ["after Rome falls back", "2026-10-25T04:00", "Europe/Rome", "2026-10-25T03:00:00Z"],
  [
    "midnight on Auckland's spring-forward day",
    "2026-09-27T00:00",
    "Pacific/Auckland",
    "2026-09-26T12:00:00Z",
  ],
  [
    "midnight on Auckland's fall-back day",
    "2026-04-05T00:00",
    "Pacific/Auckland",
    "2026-04-04T11:00:00Z",
  ],
])("profileTimeToUtc is right %s", (_, dateTime, tz, utc) => {
  expect(profileTimeToUtc(dateTime, tz).toString()).toBe(utc);
});

test("a wall time inside the spring-forward gap moves forward by the gap", () => {
  expect(profileTimeToUtc("2026-03-29T02:30", "Europe/Rome").toString()).toBe(
    "2026-03-29T01:30:00Z",
  );
});

test("a repeated wall time at fall-back resolves to its first occurrence", () => {
  expect(profileTimeToUtc("2026-10-25T02:30", "Europe/Rome").toString()).toBe(
    "2026-10-25T00:30:00Z",
  );
});

test("profileTimeToUtc rejects a date that does not exist", () => {
  expect(() => profileTimeToUtc("2026-02-30T09:00", "Europe/Rome")).toThrow(
    /Invalid date and time/,
  );
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

test("pick: lists at most 10 candidates, closest names first, and says what to do next", () => {
  const items = [
    ...Array.from({ length: 20 }, (_, i) => ({ name: `Filler ${i}` })),
    { name: "Website" },
  ];
  const next = { ambiguous: "pass client", unknown: "call list_projects" };
  expect(() => pick("project", "websit", [...items, { name: "Websites" }], { next })).toThrow(
    'Ambiguous project "websit". Candidates: Website, Websites — pass client',
  );
  expect(() => pick("project", "webiste", items, { next })).toThrow(
    /^Unknown project "webiste"\. Candidates: Website, (Filler \d+, ){8}Filler \d+ …and 11 more — call list_projects$/,
  );
  expect(() => pick("task", "nope", [{ name: "Design" }])).toThrow(
    'Unknown task "nope". Candidates: Design',
  );
});

test("interval builds second-precision ISO-Z and hours", () => {
  expect(interval("2026-08-18", "09:00", "13:00", "Europe/Rome")).toEqual({
    start: "2026-08-18T07:00:00Z",
    end: "2026-08-18T11:00:00Z",
    hours: 4,
  });
});

test("interval rolls an end before the start to the next day", () => {
  expect(interval("2026-08-18", "22:00", "02:00", "Europe/Rome").end).toBe("2026-08-19T00:00:00Z");
});

test("interval refuses a zero-length entry instead of logging 24 hours", () => {
  expect(() => interval("2026-08-18", "09:00", "09:00", "Europe/Rome")).toThrow(/zero-length/);
});

test("interval rounds hours to 2 decimals", () => {
  expect(interval("2026-08-18", "09:00", "10:50", "Europe/Rome").hours).toBe(1.83);
});
