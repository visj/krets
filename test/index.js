import path from "path";
import * as fs from "fs/promises";
import { report, Anod } from "./helper/index.js";
import * as anod from "../build/index.js";
import * as core from "../dist/index.js";
import * as array from "../dist/array.js";

const __dirname = import.meta.dirname;
const TEST_FOLDER = path.join(__dirname, "tests");

var anodmin = Object.assign({}, core, array);

async function countAsserts(test) {
  let index = 0;
  let count = 0;
  const file = (await fs.readFile(path.join(TEST_FOLDER, test))).toString();
  while ((index = file.indexOf("assert", index)) !== -1) {
    count++;
    index += "assert".length;
  }
  return count - 1;
}

/**
 *
 * @param {string} test
 * @returns {Promise<number>}
 */
async function assertCount(tests) {
  return (await Promise.all(tests.map(countAsserts))).reduce(
    (sum, val) => sum + val,
    0
  );
}

/**
 *
 * @param {Anod} anod
 */
function run(tests, anod) {
  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    test.run(anod);
  }
}

async function loadTests(folder) {
  const files = await fs.readdir(path.join(TEST_FOLDER, folder));
  return files.map((file) => path.join(folder, file));
}

(async function () {
  process.on("exit", report);
  const files = (
    await Promise.all([loadTests("core"), loadTests("array")])
  ).flat();
  const tests = await Promise.all(
    files.map((file) => import(path.join(TEST_FOLDER, file)))
  );
  console.log("Expect " + (2 * (await assertCount(files))) + " asserts.");
  run(tests, anod);
  run(tests, anodmin);
})();
