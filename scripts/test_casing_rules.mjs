import { formatUppercaseStructure, adaptTermCasing } from "../services/translation/casing.ts";

const testCases = [
  {
    input: "Quarter.edge follows nail holes",
    expected: "Quarter. Edge follows nail holes"
  },
  {
    input: "zigzag line.stitching follows",
    expected: "Zigzag line. Stitching follows"
  },
  {
    input: "1.check place material",
    expected: "1. Check place material"
  },
  {
    input: "1.check",
    expected: "1. Check"
  },
  {
    input: "2.check after heel stitching",
    expected: "2. Check after heel stitching"
  },
  {
    input: "Use pin 1.8mm without deformed.test holes.",
    expected: "Use pin 1.8mm without deformed. Test holes."
  },
  {
    input: "PFC standard 99.9% uptime.always verified.",
    expected: "PFC standard 99.9% uptime. Always verified."
  },
  {
    input: "*may gót:\n1.kiểm tra đặt liệu.\n2.kiểm tra sau khi may.",
    expected: "*May gót:\n1. Kiểm tra đặt liệu.\n2. Kiểm tra sau khi may."
  }
];

let failed = 0;
for (const tc of testCases) {
  const actual = formatUppercaseStructure(tc.input);
  if (actual === tc.expected) {
    console.log("PASS:", JSON.stringify(tc.input), "->", JSON.stringify(actual));
  } else {
    failed++;
    console.error("FAIL:");
    console.error("  Input:   ", JSON.stringify(tc.input));
    console.error("  Expected:", JSON.stringify(tc.expected));
    console.error("  Actual:  ", JSON.stringify(actual));
  }
}

if (failed === 0) {
  console.log("\nALL CASING TESTS PASSED!");
} else {
  process.exit(1);
}
