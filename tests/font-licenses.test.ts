import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { FONT_LICENSES } from "../mobile/lib/font-licenses";

it("preserves the complete installed font copyright notices and licenses", () => {
  for (const font of ["fraunces", "karla"]) {
    const license = readFileSync(`mobile/node_modules/@expo-google-fonts/${font}/LICENSE_FONT`, "utf8");
    expect(FONT_LICENSES).toContain(license);
  }
});
