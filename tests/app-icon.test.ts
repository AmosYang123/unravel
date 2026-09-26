import { beforeEach, expect, it, vi } from "vitest";

const icons = vi.hoisted(() => ({ current: null as string | null, set: vi.fn() }));
vi.mock("../mobile/node_modules/react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("../mobile/node_modules/expo-alternate-app-icons", () => ({
  supportsAlternateIcons: true,
  getAppIconName: () => icons.current,
  setAlternateAppIcon: icons.set,
}));
import { matchIconToTheme } from "../mobile/lib/appIcon";

beforeEach(() => {
  icons.current = null;
  icons.set.mockReset().mockResolvedValue(null);
});

it("switches to the theme's icon and back to the default for Linen and System", async () => {
  await matchIconToTheme("dusk");
  expect(icons.set).toHaveBeenLastCalledWith("Dusk");
  icons.current = "Dusk";
  await matchIconToTheme("linen");
  expect(icons.set).toHaveBeenLastCalledWith(null);
});

it("does nothing when the icon already matches, so iOS shows no notice", async () => {
  await matchIconToTheme("system");
  icons.current = "Sage";
  await matchIconToTheme("sage");
  expect(icons.set).not.toHaveBeenCalled();
});
