/// <reference types="jest" />
import { setTokenColorScheme, Tokens } from "../tokens/theme";

function linearize(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const channels = hex.match(/[a-f\d]{2}/gi)?.map((channel) =>
      linearize(Number.parseInt(channel, 16)),
    );
    if (!channels || channels.length !== 3) {
      throw new Error(`Invalid hex color: ${hex}`);
    }
    const [red, green, blue] = channels as [number, number, number];
    return red * 0.2126 + green * 0.7152 + blue * 0.0722;
  };

  const first = luminance(foreground);
  const second = luminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("light-blue design tokens", () => {
  afterEach(() => setTokenColorScheme("light"));

  it("uses light blue-tinted surfaces and a shared brand focus color", () => {
    expect(Tokens.colors.background).toBe("#F3F8FD");
    expect(Tokens.colors.surface).toBe("#FFFFFF");
    expect(Tokens.colors.surfaceSubtle).toBe("#EAF3FB");
    expect(Tokens.colors.ring).toBe(Tokens.colors.brand);
  });

  it("keeps primary and semantic text combinations accessible", () => {
    expect(contrastRatio(Tokens.colors.textPrimary, Tokens.colors.surface)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(Tokens.colors.textSecondary, Tokens.colors.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(Tokens.colors.textMuted, Tokens.colors.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(Tokens.colors.textInverse, Tokens.colors.brand)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(Tokens.colors.dangerText, Tokens.colors.dangerBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(Tokens.colors.successText, Tokens.colors.successBg)).toBeGreaterThanOrEqual(4.5);
  });

  it("switches the app-wide semantic palette while preserving the blue identity", () => {
    const lightBackground = Tokens.colors.background;
    setTokenColorScheme("dark");

    expect(Tokens.colors.background).not.toBe(lightBackground);
    expect(Tokens.colors.background).toBe("#0C1724");
    expect(Tokens.colors.surface).toBe("#142437");
    expect(Tokens.colors.textPrimary).toBe("#F0F6FC");
    expect(Tokens.colors.brand).toBe("#55B4F2");
    expect(contrastRatio(Tokens.colors.textPrimary, Tokens.colors.surface)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(Tokens.colors.textSecondary, Tokens.colors.surface)).toBeGreaterThanOrEqual(4.5);
  });
});
