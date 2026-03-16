import test from "node:test";
import assert from "node:assert/strict";
import { normalizeScene, pickTargetLights, validateScenes } from "../src/scene-utils.js";

test("normalizeScene clamps values into valid ranges", () => {
  const scene = normalizeScene({
    power: "on",
    hue: 999,
    saturation: 9,
    brightness: -1,
    kelvin: 20000,
    durationMs: -10
  });

  assert.equal(scene.hue, 360);
  assert.equal(scene.saturation, 1);
  assert.equal(scene.brightness, 0);
  assert.equal(scene.kelvin, 9000);
});

test("validateScenes rejects duplicate ids", () => {
  assert.throws(
    () =>
      validateScenes([
        { id: "a", name: "One" },
        { id: "a", name: "Two" }
      ]),
    /Duplicate scene id/
  );
});

test("pickTargetLights returns all lights when no labels are specified", () => {
  const lights = [{ label: "A" }, { label: "B" }];
  assert.deepEqual(pickTargetLights(lights, {}), lights);
});

test("pickTargetLights filters labels case-insensitively", () => {
  const lights = [{ label: "Kitchen 1" }, { label: "Kitchen 2" }, { label: "Desk" }];
  assert.deepEqual(pickTargetLights(lights, { targetLabels: ["kitchen 2"] }), [{ label: "Kitchen 2" }]);
});

test("pickTargetLights supports id selection", () => {
  const lights = [{ id: "a1", label: "Kitchen 1" }, { id: "b2", label: "Kitchen 2" }];
  assert.deepEqual(pickTargetLights(lights, { targetIds: ["b2"] }), [{ id: "b2", label: "Kitchen 2" }]);
});
