import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { scanPptxTranslationIntelligence } from "../services/translation/pptx-smart-audit.ts";

test("PPTX Spatial Mapping - Extracts Visual Layouts with 1:1 Percentage Coordinates", async () => {
  const pptxFile = fs.readdirSync("Database").find((f) => f.endsWith(".pptx"));
  assert.ok(pptxFile, "Sample PPTX file should exist in Database directory");

  const buffer = fs.readFileSync(path.join("Database", pptxFile));
  const report = await scanPptxTranslationIntelligence(buffer, pptxFile);

  assert.ok(report.visualLayouts, "Report should include visualLayouts array");
  assert.ok(report.visualLayouts.length > 0, "visualLayouts should contain slide layouts");

  // Check Slide 2
  const slide2 = report.visualLayouts.find((l) => l.slideIndex === 2);
  assert.ok(slide2, "Slide 2 visual layout must be present");
  assert.ok(slide2.elements.length > 0, "Slide 2 should have visual elements");
  assert.ok(slide2.aspectRatio > 1, "Slide should have valid aspect ratio > 1");

  // Check element coordinate bounds
  for (const el of slide2.elements) {
    assert.ok(el.box.left >= 0 && el.box.left <= 100, `Element left ${el.box.left}% should be within 0-100%`);
    assert.ok(el.box.top >= 0 && el.box.top <= 100, `Element top ${el.box.top}% should be within 0-100%`);
    assert.ok(el.box.width > 0 && el.box.width <= 100, `Element width ${el.box.width}% should be within 0-100%`);
    assert.ok(el.box.height > 0 && el.box.height <= 100, `Element height ${el.box.height}% should be within 0-100%`);
  }

  // Zero-Image Policy verification
  const imageElements = slide2.elements.filter((el) => el.type === "image");
  assert.ok(imageElements.length > 0, "Slide 2 contains image elements");
  for (const img of imageElements) {
    // Images must only have bounding box and metadata, never binary data
    assert.equal(img.type, "image");
    assert.ok(img.box.width > 0, "Image wireframe box has width");
    assert.ok(img.box.height > 0, "Image wireframe box has height");
    assert.equal(img.data, undefined, "Strict Zero-Image: image data must NEVER be present");
    assert.equal(img.buffer, undefined, "Strict Zero-Image: image buffer must NEVER be present");
  }

  // Verify text units on slide 2 have location.box populated
  const slide2Units = report.units.filter((u) => u.location.slideIndex === 2);
  assert.ok(slide2Units.length > 0, "Slide 2 has text units");
  const unitsWithBox = slide2Units.filter((u) => u.location.box);
  assert.ok(unitsWithBox.length > 0, "Text units on Slide 2 have spatial bounding box attached");
});

test("PPTX Presentation Review - Decomposes Tables into Styled Cells with Zero-Image Safety", async () => {
  const pptxFile = fs.readdirSync("Database").find((f) => f.endsWith(".pptx"));
  const buffer = fs.readFileSync(path.join("Database", pptxFile));
  const report = await scanPptxTranslationIntelligence(buffer, pptxFile);

  assert.ok(report.visualLayouts, "Layouts must exist");

  // Verify across all layouts that any table cells have coordinates, bounds and formatting
  let cellCount = 0;
  for (const layout of report.visualLayouts) {
    assert.ok(layout.backgroundColor, "Slide must have a backgroundColor");
    for (const el of layout.elements) {
      if (el.type === "cell") {
        cellCount++;
        assert.ok(el.box.width > 0, "Cell must have width");
        assert.ok(el.box.height > 0, "Cell must have height");
        assert.ok(el.border, "Cell should have border defined");
      }
    }
  }

  // All image elements across all slides must adhere to strict Zero-Image policy
  for (const layout of report.visualLayouts) {
    const images = layout.elements.filter((el) => el.type === "image");
    for (const img of images) {
      assert.equal(img.type, "image");
      assert.equal(img.data, undefined, "Strict Zero-Image rule: never embed image bytes");
    }
  }
});

