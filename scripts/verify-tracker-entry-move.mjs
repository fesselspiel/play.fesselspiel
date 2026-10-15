import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const core = readFileSync("src/lib/tracker-core.ts", "utf8");
const api = readFileSync("src/app/api/external/trackers/history/[id]/move/route.ts", "utf8");
const web = readFileSync("src/app/trackers/[trackerKey]/[slug]/page.tsx", "utf8");

const moveFunction = core.slice(core.indexOf("export async function moveTrackerEntryToType"), core.indexOf("export async function findTrackerTypeForUser"));
assert.match(moveFunction, /if \(!input\.entry\.allDay && !input\.entry\.endTime\)/, "running entries must be rejected");
assert.match(moveFunction, /legacyType:[\s\S]*legacyId:/, "legacy collisions must be checked");
assert.match(moveFunction, /data:\s*\{\s*trackerTypeId: input\.target\.id,\s*slug\s*\}/, "move update may only change trackerTypeId and slug");
const updateData = moveFunction.match(/data:\s*(\{\s*trackerTypeId: input\.target\.id,\s*slug\s*\})/)?.[1] || "";
for (const protectedField of ["startTime:", "endTime:", "durationMinutes:", "notes:", "fieldValues:", "images:", "toys:", "positions:"]) {
  assert.equal(updateData.includes(protectedField), false, `move function must not write ${protectedField}`);
}

assert.match(api, /requireApiUser\(request\)/, "move API must require authentication");
assert.match(api, /existing\.ownerId !== auth\.user\.id/, "move API must check edit permission");
assert.match(api, /findTrackerTypeForUser\(trackerKey, auth\.user\)/, "move API must resolve the target in the active tenant");
assert.match(api, /tracker_entry_moved_api/, "move API must write a minimal audit event");
assert.match(web, /action=\{moveEntry\}/, "web detail must expose the move action");
assert.match(web, /trackerTypesForUser\(user\)/, "web target picker must respect per-user tracker visibility");
assert.match(web, /Zeit, Dauer, Notiz, Bilder und Verknüpfungen bleiben unverändert/, "web UI must explain preservation");

console.log("tracker entry move verification passed");
