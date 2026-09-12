// CPU Eye - DOM 冒烟测试: 用最小 DOM 桩在 node 里跑 app.js
const fs = require("fs"), path = require("path"), vm = require("vm");
const root = path.join(__dirname, "..");

function el(tag) {
  const e = {
    tag, children: [], _q: {}, style: {}, dataset: {}, value: "", textContent: "", title: "",
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle(c, f) { if (f === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else { f ? this._s.add(c) : this._s.delete(c); } } },
    appendChild(c) { this.children.push(c); return c; },
    replaceChildren(...cs) { this.children = cs; },
    querySelector(sel) { return this._q[sel] || (this._q[sel] = el(sel)); },
    setAttribute(k, v) { if (k === "class") this.className = v; this[k] = v; },
    getAttribute(k) { return this[k]; },
    scrollIntoView() {},
    focus() {}, click() { if (this.onclick) this.onclick(); },
    get className() { return [...this.classList._s].join(" "); },
    set className(v) { this.classList._s = new Set(v.split(/\s+/).filter(Boolean)); },
    set innerHTML(v) {
      this.children = []; this._q = {};
      const m = v.match(/<(span|td|th)\b/g);
      if (m) for (let i = 0; i < m.length; i++) this.appendChild(el("span"));
    },
  };
  return e;
}
const ids = ["tabs", "sampleSel", "sampleList", "editor", "sampleDesc", "compileErr", "isaHint",
  "cpu", "disasm", "console", "regs", "vars", "mem", "stPC", "stFn", "stSteps", "stFlags", "stState",
  "stVerify", "btnCompile", "btnStep", "btnBack", "btnReset", "btnRun", "speed", "spdVal"];
const store = {}; ids.forEach((i) => (store[i] = el("#" + i)));
store.speed.value = "30";

const document = {
  getElementById: (i) => store[i] || (store[i] = el("#" + i)),
  createElement: (t) => el(t),
  createDocumentFragment: () => el("frag"),
};
const ctx = vm.createContext({ console, Math, BigInt, DataView, ArrayBuffer, Uint8Array, parseInt, setInterval: global.setInterval, clearInterval: global.clearInterval, document, setTimeout: (f) => f() });
for (const f of ["js/compiler.js", "js/x86.js", "js/x64.js", "js/arm32.js", "js/arm64.js", "js/samples.js", "js/cpuview.js", "js/app.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
}

// app 初始化后应已加载示例1并编译
const btnStep = store.btnStep, btnCompile = store.btnCompile, tabs = store.tabs;
console.log("tabs:", tabs.children.length, "样本选项:", store.sampleSel.children.length, "样例列表:", store.sampleList.children.length);
console.log("编译错误框隐藏:", store.compileErr.classList._s.has("hidden"));

function running() {
  const s = store.stState.textContent;
  return s === "运行中";
}
function runAll() {
  let n = 0;
  while (running()) { btnStep.click(); if (++n > 5000) break; }
  return n;
}
console.log("x86 class_a 步数:", runAll(), "验证:", store.stVerify.className.includes("ok") ? "PASS" : "FAIL", store.stVerify.textContent);

// CPU 示意图: 运行中 PC/IR/MAR 应随步更新
store.btnReset.click();
for (let i = 0; i < 3; i++) btnStep.click();
const tpc = parseInt(store.cpu.querySelector("#tPC").textContent, 16);
const stp = +store.stPC.textContent;
console.log("CPU图 tPC:", store.cpu.querySelector("#tPC").textContent, "stPC:", stp, tpc === stp ? "PASS" : "FAIL");
console.log("CPU图 tIR:", JSON.stringify(store.cpu.querySelector("#tIR").textContent), "tOp:", store.cpu.querySelector("#tOp").textContent);
if (tpc !== stp) process.exitCode = 1;
runAll();

// 回退 5 步: 应回到程序中段并恢复为可运行状态
for (let i = 0; i < 5; i++) store.btnBack.click();
const pcNow = +store.stPC.textContent;
console.log("回退后 PC:", pcNow, pcNow >= 2 && running() ? "PASS" : "FAIL");
if (!(pcNow >= 2 && running())) process.exitCode = 1;
runAll();

// 切 ISA: tabs.children: x86,x64,arm32,arm64
for (let i = 1; i < 4; i++) {
  tabs.children[i].onclick();
  const n = runAll();
  const ok = store.stVerify.className.includes("ok");
  console.log("ISA tab", i, "步数:", n, ok ? "PASS" : "FAIL: " + store.stVerify.textContent);
  if (!ok) process.exitCode = 1;
}
console.log("反汇编行数:", store.disasm.children.length, "输出:", JSON.stringify(store.console.textContent));
if (!process.exitCode) console.log("DOM 冒烟测试通过");
