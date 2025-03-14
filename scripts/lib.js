import fs from "node:fs";
import { exec } from "child_process";
import * as esbuild from "esbuild";

async function esbuildBundleAnod() {
  await esbuild.build({
    entryPoints: ["./bench/haile/anod/index.js"],
    bundle: true,
    minify: true,
    target: "ES5",
    outfile: "./bench/haile/anod/index.min.js"
  });
}

async function esbuildBundlePreact() {
  await esbuild.build({
    entryPoints: ["./bench/haile/preact/index.js"],
    bundle: true,
    minify: true,
    outfile: "./bench/haile/preact/index.min.js"
  });
}

async function esbuildBundleReactively() {
  await esbuild.build({
    entryPoints: ["./bench/haile/reactively/index.js"],
    bundle: true,
    minify: true,
    outfile: "./bench/haile/reactively/index.min.js"
  });
}

async function esbuildBundleSjs() {
  await esbuild.build({
    entryPoints: ["./bench/haile/S/index.js"],
    bundle: true,
    minify: true,
    outfile: "./bench/haile/S/index.min.js"
  });
}

async function esbuildBundleSolid() {
  await esbuild.build({
    entryPoints: ["./bench/haile/solid/index.js"],
    bundle: true,
    minify: true,
    outfile: "./bench/haile/solid/index.min.js"
  });
}

async function esbuildBundleMaverick() {
  await esbuild.build({
    entryPoints: ["./bench/haile/maverick/index.js"],
    bundle: true,
    minify: true,
    outfile: "./bench/haile/maverick/index.min.js"
  });
}

async function esbuildBundleuSignal() {
  await esbuild.build({
    entryPoints: ["./bench/haile/usignal/index.js"],
    bundle: true,
    minify: true,
    outfile: "./bench/haile/usignal/index.min.js"
  });
}

async function esbuildBundleTC39Proposal() {
  await esbuild.build({
    entryPoints: ["./bench/haile/tc39/index.js"],
    bundle: true,
    minify: true,
    outfile: "./bench/haile/tc39/index.min.js"
  });
}

async function bundleBench() {
  await Promise.all([
    esbuildBundleAnod(),
    esbuildBundlePreact(),
    esbuildBundleReactively(),
    esbuildBundleSjs(),
    esbuildBundleSolid(),
    esbuildBundleMaverick(),
    esbuildBundleuSignal(),
    esbuildBundleTC39Proposal()
  ]);
}

async function bundleCore() {
  const core = (await fs.promises.readFile("./temp/core.js", "utf-8"))
    .replace(/\n/g, " ")
    .split("export");
  const parts = core[0].split(/(window\.anod\.[\$\w]*)/g);
  let esm = parts[0];
  let iife = "var anod=(function(){" + parts[0] + "return{";
  for (let i = 1; i < parts.length - 1; i += 2) {
    let name = parts[i].slice(12);
    let content = parts[i + 1].trim();
    if (i > 1) {
      iife += ",";
    }
    if (content.match(/\=\s*function/)) {
      esm += "export function " + name + content.slice(content.indexOf("function") + "function".length);
      iife += name + ":" + content.slice(1, content.lastIndexOf(";"));
    } else {
      let min = content.slice(1, content.indexOf(";"));
      esm += "export { " + min + " as " + name + " };";
      iife += name + ":" + content.slice(1, content.indexOf(";"));
    }
  }
  const internals = core[1];
  esm += "export " + internals;
  const symbols = internals
    .slice(internals.indexOf("{") + 1, internals.indexOf("}"))
    .split(",")
    .filter(s => s.trim() !== "");
  for (const symbol of symbols) {
    iife += "," + symbol + ":" + symbol;
  }
  iife += "}})();";
  await Promise.all([
    fs.promises.copyFile("./index.d.ts", "./dist/index.d.ts"),
    fs.promises.writeFile("./build/core.min.js", iife),
    fs.promises.writeFile("./dist/index.js", esm)
  ]);
}

async function bundleArray() {
  const code = (await fs.promises.readFile("./temp/array.js", "utf-8"))
    .replace(/\n/g, " ");
  let param = "$";
  const array = code.split('"./core.js";');
  const parts = array[1].split(/(window\.anod\.[\$\w]*)/g);
  let esm = array[0] + '"./index.js";' + parts[0];
  let iife = "(function(" + param + "){";
  const internals = array[0];
  const symbols = internals
    .slice(internals.indexOf("{") + 1, internals.indexOf("}"))
    .split(",");
  for (let i = 0; i < symbols.length; i++) {
    if (i === 0) {
      iife += "var ";
    } else {
      iife += ",";
    }
    var sym = symbols[i];
    iife += sym + "=" + param + "." + sym;
  }
  iife += ";";
  iife += parts[0];
  for (let i = 1; i < parts.length - 1; i += 2) {
    let name = parts[i].slice(12);
    let content = parts[i + 1].trim();
    if (i > 1) {
      iife += ";";
    }
    if (content.startsWith("=function")) {
      esm += "export function " + name + content.slice(9);
      iife +=
        param + "." + name + "=" + content.slice(1, content.lastIndexOf(";"));
    } else {
      let min = content.slice(1, content.indexOf(";"));
      esm += "export { " + min + " as " + name + " };";
      iife += param + "." + name + "=" + content.slice(1, content.lastIndexOf(";"));
    }
  }
  iife += "})(anod);";
  await Promise.all([
    fs.promises.copyFile("./array.d.ts", "./dist/array.d.ts"),
    fs.promises.writeFile("./dist/array.js", esm),
    fs.promises.writeFile("./build/array.min.js", iife)
  ]);
}

async function closureBundleLibrary() {
  return new Promise(async (resolve, reject) => {
    const cmd = [
      "google-closure-compiler",
      "--compilation_level ADVANCED",
      "--externs src/api.js",
      "--assume_function_wrapper true",
      "--language_out ES5",
      "--rewrite_polyfills false",
      "--chunk_output_type ES_MODULES",
      "--chunk_output_path_prefix ./temp/",
      "--js src/core.js",
      "--chunk core:1",
      "--js src/array.js",
      "--chunk array:1:core"
    ];
    exec(cmd.join(" "), async (err, stdout, stderr) => {
      if (err) {
        return reject(err);
      }
      if (stderr) {
        console.warn(stderr);
      }
      await Promise.all[(bundleCore(), bundleArray())];
      resolve({ stdout, stderr });
    });
  });
}

async function concatBundleLibrary() {
  let [api, core, array] = await Promise.all([
    fs.promises.readFile("./src/api.js", "utf-8"),
    fs.promises.readFile("./src/core.js", "utf-8"),
    fs.promises.readFile("./src/array.js", "utf-8")
  ]);
  api =
    api + "\n" +
    "export {" + "\n"
    + "  DisposableSignal,\n"
    + "  ReadonlySignal,\n"
    + "  Signal,\n"
    + "  SignalIterator,\n"
    + "  SignalArray,\n"
    + "  SignalObject,\n"
    + "  SignalValue,\n"
    + "  SignalOptions\n"
    + "};";
  let windowRegex = /window\["anod"\]\["[\$\w]+"\]\s+=\s+[\$\w]+;\s*/g;
  let importsRegex = /import\s*\{[^\}]*\}\s*from\s*['"]\.\/core\.js['"]\;\s*/g;
  core = core.replace(windowRegex, "");
  array = array.replace(windowRegex, "").replace(importsRegex, "");
  const code = [api, core, array].join("\n");
  await fs.promises.writeFile("./build/index.js", code);
  let [coreDef, arrayDef] = await Promise.all([
    fs.promises.readFile("./index.d.ts", "utf-8"),
    fs.promises.readFile("./array.d.ts", "utf-8")
  ]);
  const def = [coreDef, arrayDef].join("\n");
  await fs.promises.writeFile("./build/index.d.ts", def);
}

async function bundleLibrary() {
  await Promise.all([concatBundleLibrary(), closureBundleLibrary()]);
}

async function cleanup() {
  await fs.promises.rm("./temp", { recursive: true });
}

async function main() {
  try {
    await fs.promises.mkdir("./dist", { recursive: true });
    await fs.promises.mkdir("./build", { recursive: true });
    await bundleLibrary();
    await bundleBench();
    await cleanup();
  } catch (err) {
    console.error(err);
  }
}

main();
