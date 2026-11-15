import { describe, expect, it } from "vitest";
import {
  formatFileSize,
  compressImageToWebP,
  isWebPExportSupported,
} from "@/lib/image-compress";

describe("Image Compression & WebP Optimization", () => {
  it("formats file sizes correctly for display", () => {
    expect(formatFileSize(500)).toBe("500 B");
    expect(formatFileSize(1024 * 150)).toBe("150.0 KB");
    expect(formatFileSize(1024 * 1024 * 4.5)).toBe("4.5 MB");
  });

  it("throws descriptive error if input file is not an image", async () => {
    const textFile = new File(["hello world"], "test.txt", { type: "text/plain" });
    await expect(compressImageToWebP(textFile)).rejects.toThrow("الملف المحدد ليس صورة صالحة");
  });

  it("skips compressing vector SVG files to keep sharp scalability", async () => {
    const svgContent = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>';
    const svgFile = new File([svgContent], "logo.svg", { type: "image/svg+xml" });
    const result = await compressImageToWebP(svgFile);
    expect(result.type).toBe("image/svg+xml");
    expect(result.name).toBe("logo.svg");
  });

  it("skips compressing animated GIF files to preserve frames", async () => {
    const gifFile = new File(["fake-gif-bytes"], "animation.gif", { type: "image/gif" });
    const result = await compressImageToWebP(gifFile);
    expect(result.type).toBe("image/gif");
    expect(result.name).toBe("animation.gif");
  });

  it("checks webp export support safely without throwing", () => {
    expect(typeof isWebPExportSupported()).toBe("boolean");
  });
});
