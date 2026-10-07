import { expect, it } from "vitest";
import { preferences } from "./preferences";

it("shows the Cache prefix unless the user hides it", () => {
  expect(preferences.schema.parse({})).toEqual({ showCachePrefix: true });
  expect(preferences.schema.parse({ showCachePrefix: false })).toEqual({ showCachePrefix: false });
});
