import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acceptsPhotos,
  base64Bytes,
  checkPhoto,
  fitWithin,
  isLocalOnly,
  isPrivateIPv4,
  isTokenShape,
  linkState,
  LINK_TTL_MS,
  MAX_PHOTOS,
  minutesLeft,
  phoneOrigin,
  phonePhotoName,
  PHOTO_MAX_BYTES,
  pickLanAddress,
} from "./phone-link";

const now = 1_000_000;
const fresh = { expiresAt: now + LINK_TTL_MS, openedAt: null, closedAt: null, uploads: 0 };

test("a link waits, connects when the phone opens it, fills up, and ends", () => {
  assert.equal(linkState(fresh, now), "waiting");
  assert.equal(linkState({ ...fresh, openedAt: now }, now), "connected");
  assert.equal(linkState({ ...fresh, openedAt: now, uploads: MAX_PHOTOS }, now), "full");
  assert.equal(linkState(fresh, fresh.expiresAt), "expired", "expiry is inclusive");
  // Closing wins over everything, expiry over being full.
  assert.equal(linkState({ ...fresh, closedAt: now, uploads: MAX_PHOTOS }, now), "closed");
  assert.equal(linkState({ ...fresh, uploads: MAX_PHOTOS }, fresh.expiresAt + 1), "expired");
});

test("only a live, unfilled link takes photos", () => {
  assert.equal(acceptsPhotos("waiting"), true);
  assert.equal(acceptsPhotos("connected"), true);
  for (const s of ["full", "expired", "closed"] as const) assert.equal(acceptsPhotos(s), false, s);
});

test("tokens have one exact shape", () => {
  assert.equal(isTokenShape("A".repeat(32)), true);
  assert.equal(isTokenShape("abcDEF012_-".padEnd(32, "x")), true);
  assert.equal(isTokenShape("A".repeat(31)), false);
  assert.equal(isTokenShape("A".repeat(33)), false);
  assert.equal(isTokenShape("A".repeat(31) + "/"), false, "base64url only");
  assert.equal(isTokenShape(undefined), false);
});

test("minutes left round up and stop at zero", () => {
  assert.equal(minutesLeft(now + LINK_TTL_MS, now), 20);
  assert.equal(minutesLeft(now + 61_000, now), 2);
  assert.equal(minutesLeft(now + 1, now), 1);
  assert.equal(minutesLeft(now - 5_000, now), 0);
});

test("a photo shrinks to a 1600px long edge, keeps its shape, and is never enlarged", () => {
  assert.deepEqual(fitWithin(4032, 3024), { width: 1600, height: 1200 });
  assert.deepEqual(fitWithin(3024, 4032), { width: 1200, height: 1600 });
  assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 });
  assert.deepEqual(fitWithin(0, 600), { width: 0, height: 0 });
});

test("base64 size is counted without decoding", () => {
  assert.equal(base64Bytes(Buffer.from("hello").toString("base64")), 5);
  assert.equal(base64Bytes(Buffer.from("hell").toString("base64")), 4);
  assert.equal(base64Bytes(Buffer.from("hel").toString("base64")), 3);
});

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]).toString("base64");

test("only a real JPEG of a sane size gets through", () => {
  const ok = checkPhoto({ data: jpeg, width: 1200, height: 1600 });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.photo.bytes, 204);

  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(40)]).toString("base64");
  assert.equal(checkPhoto({ data: png, width: 100, height: 100 }).ok, false, "a PNG is not what the phone sends");
  assert.equal(checkPhoto({ data: "/9j/<script>", width: 100, height: 100 }).ok, false, "not base64");
  assert.equal(checkPhoto({ data: jpeg, width: 1601, height: 100 }).ok, false, "bigger than the phone draws");
  assert.equal(checkPhoto({ data: jpeg, width: 12.5, height: 100 }).ok, false);
  assert.equal(checkPhoto({ data: jpeg }).ok, false);
  assert.equal(checkPhoto(null).ok, false);

  const huge = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(PHOTO_MAX_BYTES)]).toString("base64");
  assert.equal(checkPhoto({ data: huge, width: 1600, height: 1200 }).ok, false);
});

test("phone photos are numbered after the ones already there", () => {
  assert.equal(phonePhotoName([], 0), "Phone photo 1.jpg");
  assert.equal(phonePhotoName(["sheet.pdf", "Phone photo 1.jpg", "Phone photo 2.jpg"], 0), "Phone photo 3.jpg");
  assert.equal(phonePhotoName(["Phone photo 1.jpg"], 1), "Phone photo 3.jpg");
  assert.equal(phonePhotoName(["Phone photo 1.jpg copy.jpg"], 0), "Phone photo 1.jpg", "only exact names count");
});

test("private addresses are recognised and public ones are not", () => {
  for (const a of ["192.168.1.23", "10.0.0.5", "172.16.4.1", "172.31.255.255"]) assert.equal(isPrivateIPv4(a), true, a);
  for (const a of ["172.32.0.1", "8.8.8.8", "127.0.0.1", "fe80::1", "192.169.0.1"]) assert.equal(isPrivateIPv4(a), false, a);
});

test("the laptop's LAN address is found, home networks first", () => {
  const interfaces = {
    lo0: [{ family: "IPv4", address: "127.0.0.1", internal: true }],
    utun3: [{ family: "IPv4", address: "10.8.0.2", internal: false }],
    en0: [
      { family: "IPv6", address: "fe80::1c", internal: false },
      { family: "IPv4", address: "192.168.1.23", internal: false },
    ],
  };
  assert.equal(pickLanAddress(interfaces), "192.168.1.23");
  assert.equal(pickLanAddress({ en0: [{ family: 4, address: "10.1.2.3", internal: false }] }), "10.1.2.3", "Node 18 reports family as a number");
  assert.equal(pickLanAddress({ lo0: [{ family: "IPv4", address: "127.0.0.1", internal: true }] }), null);
});

test("the QR origin swaps localhost for the LAN address and leaves real hosts alone", () => {
  assert.equal(phoneOrigin("http://localhost:3000", "192.168.1.23"), "http://192.168.1.23:3000");
  assert.equal(phoneOrigin("http://127.0.0.1:3000", "10.0.0.5"), "http://10.0.0.5:3000");
  assert.equal(phoneOrigin("http://localhost:3000", null), "http://localhost:3000");
  assert.equal(phoneOrigin("https://chalk.example.com", "192.168.1.23"), "https://chalk.example.com");
  assert.equal(isLocalOnly("http://localhost:3000/snap/x"), true);
  assert.equal(isLocalOnly("http://192.168.1.23:3000/snap/x"), false);
});
