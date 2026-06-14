const fs = require("fs");
const path = require("path");
const { PDFParse } = require("pdf-parse");

async function main() {
  const file = path.join(
    __dirname,
    "..",
    "..",
    "statements",
    "2026-03",
    "Account Statement - Abraham Udom - March 2026 with Distribution.pdf"
  );
  const buffer = fs.readFileSync(file);
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy();
  console.log(result.text);
}

main();
