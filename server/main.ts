// Точка входу сервісу: node rooms.mjs --channel=main|experimental  (порт 8090 або 8091, лише 127.0.0.1).
// Коли активний реліз змінився (нова збірка), сервіс сам виходить, а systemd піднімає його з новим кодом.
// Кімнати живуть у пам'яті, тому вихід відкладається, поки хтось тримає опитування.

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import agenciesData from "../src/data/agencies.json";
import marketData from "../src/data/market.json";
import { SAMPLE_CATALOG, SAMPLE_MISSION } from "../src/core/stubs";
import type { AgencyProfile } from "../src/core/design/agency";
import type { Market } from "../src/core/consortium";
import { Rooms, createRoomsServer } from "./rooms";

const channel = process.argv.find((a) => a.startsWith("--channel="))?.slice(10) ?? "main";
const port = Number(process.env.PORT ?? (channel === "experimental" ? 8091 : 8090));
const rooms = new Rooms({
  setup: {
    base: { mission: SAMPLE_MISSION, catalog: SAMPLE_CATALOG },
    market: marketData as unknown as Market,
    agencies: Object.values(agenciesData) as AgencyProfile[],
  },
});
const server = createRoomsServer(rooms);
server.listen(port, "127.0.0.1", () => console.log(`rooms[${channel}] listening on 127.0.0.1:${port}`));

const self = process.argv[1] ?? fileURLToPath(import.meta.url);
const started = realpathSync(self);
const timer = setInterval(() => {
  rooms.sweep();
  let now = started;
  try { now = realpathSync(self); } catch { return; }
  if (now !== started && !rooms.hasWaiters()) {
    console.log("new release detected, exiting for restart");
    process.exit(0);
  }
}, 30_000) as unknown as { unref(): void };
timer.unref();
