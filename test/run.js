// CPU Eye - node test: all samples x all ISAs
const fs = require("fs"), path = require("path"), vm = require("vm");
const root = path.join(__dirname, "..");
const ctx = vm.createContext({ console, Math, BigInt, DataView, ArrayBuffer, Uint8Array, parseInt, parseInt: global.parseInt });
for (const f of ["js/compiler.js", "js/x86.js", "js/x64.js", "js/arm32.js", "js/arm64.js", "js/samples.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
}
const { CE } = ctx;
const ISAS = ["x86", "x64", "arm32", "arm64"];
let fails = 0, maxSteps = 0;
for (const s of CE.SAMPLES) {
  const mir = CE.compile(s.src);
  for (const isa of ISAS) {
    const program = CE.ISA[isa].lower(mir);
    const M = CE.ISA[isa].create(program);
    let guard = 200000;
    while (M.status === "running" && guard--) M.step();
    maxSteps = Math.max(maxSteps, M.steps);
    const out = M.out.join("");
    const problems = [];
    if (M.status !== "done") problems.push(`status=${M.status} ${M.error || ""}`);
    if (out !== s.expect.output) problems.push(`output='${out}' 期望 '${s.expect.output}'`);
    if (M.exitCode !== s.expect.exit) problems.push(`exit=${M.exitCode} 期望 ${s.expect.exit}`);
    if (s.expect.vars) {
      if (!M.vars) problems.push("未捕获 main 变量");
      else for (const k in s.expect.vars) if (M.vars[k] !== s.expect.vars[k]) problems.push(`${k}=${M.vars[k]} 期望 ${s.expect.vars[k]}`);
    }
    if (problems.length) { fails++; console.log(`FAIL [${isa}] ${s.id}: ${problems.join("; ")}`); }
    else console.log(`PASS [${isa}] ${s.id} (${M.steps} steps)`);
  }
}
console.log(fails ? `\n${fails} 个用例失败` : `\n全部 ${CE.SAMPLES.length * ISAS.length} 个用例通过 (最大步数 ${maxSteps})`);
process.exit(fails ? 1 : 0);
