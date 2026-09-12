// CPU Eye - UI
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const ISA_KEYS = ["x86", "x64", "arm32", "arm64"];
  let isa = "x86", program = null, machine = null, snaps = [], timer = null;
  let curSample = null, lastMem = null, lastRegs = null, stepLimit = false;

  const dv = { mem: null };
  function i32(addr) {
    if (!dv.mem || !machine) return null;
    const b = machine.mem;
    if (addr < 0 || addr + 4 > b.length) return null;
    return (b[addr] | (b[addr + 1] << 8) | (b[addr + 2] << 16) | (b[addr + 3] << 24));
  }

  // ---------- init ----------
  const tabsEl = $("tabs");
  ISA_KEYS.forEach((k) => {
    const b = document.createElement("button");
    b.textContent = CE.ISA[k].title;
    b.dataset.k = k;
    b.onclick = () => { isa = k; markTab(); compile(true); };
    tabsEl.appendChild(b);
  });
  function markTab() {
    [...tabsEl.children].forEach((b) => b.classList.toggle("on", b.dataset.k === isa));
    $("isaHint").textContent = CE.ISA[isa].title;
  }

  const selEl = $("sampleSel"), listEl = $("sampleList");
  CE.SAMPLES.forEach((s, idx) => {
    const o = document.createElement("option");
    o.value = s.id; o.textContent = `${idx + 1}. ${s.title}`;
    selEl.appendChild(o);
    const d = document.createElement("div");
    d.className = "item"; d.dataset.id = s.id;
    d.innerHTML = `<div class="t"></div><div class="d"></div>`;
    d.querySelector(".t").textContent = s.title;
    d.querySelector(".d").textContent = s.desc;
    d.onclick = () => { selEl.value = s.id; loadSample(s); };
    listEl.appendChild(d);
  });
  selEl.onchange = () => loadSample(CE.SAMPLES.find((s) => s.id === selEl.value));

  function loadSample(s) {
    curSample = s;
    $("editor").value = s.src;
    $("sampleDesc").textContent = "— " + s.desc;
    [...listEl.children].forEach((el) => el.classList.toggle("on", el.dataset.id === s.id));
    compile(true);
  }

  // ---------- control ----------
  $("btnCompile").onclick = () => compile(false);
  $("btnStep").onclick = () => { stop(); doStep(); };
  $("btnBack").onclick = back;
  $("btnReset").onclick = () => { stop(); reset(); };
  $("btnRun").onclick = () => (timer ? stop() : run());
  $("speed").oninput = () => { $("spdVal").textContent = $("speed").value; if (timer) { stop(); run(); } };

  function compile(resetSample) {
    stop();
    const err = $("compileErr");
    try {
      const mir = CE.compile($("editor").value);
      program = CE.ISA[isa].lower(mir);
      err.classList.add("hidden");
    } catch (e) {
      err.textContent = "编译错误" + (e.line ? ` (第 ${e.line} 行)` : "") + ": " + e.message;
      err.classList.remove("hidden");
      return;
    }
    reset();
  }

  function reset() {
    if (!program) return;
    machine = CE.ISA[isa].create(program);
    snaps = [machine.snapshot()];
    lastMem = null; lastRegs = null;
    $("stVerify").className = "chip verify";
    render();
  }

  function run() {
    if (!machine || machine.status !== "running") return;
    $("btnRun").textContent = "⏸ 暂停";
    const iv = Math.max(5, Math.round(1000 / +$("speed").value));
    timer = setInterval(() => { if (!doStep()) stop(); }, iv);
  }
  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    $("btnRun").textContent = "▶ 运行";
  }
  function doStep() {
    if (!machine || machine.status !== "running") { render(); verify(); return false; }
    machine.step();
    snaps.push(machine.snapshot());
    render();
    if (machine.status !== "running") { stop(); verify(); }
    return true;
  }
  function back() {
    stop();
    if (!machine || snaps.length < 2) return;
    snaps.pop();
    machine.restore(snaps[snaps.length - 1]);
    render();
    $("stVerify").className = "chip verify";
  }

  // ---------- render ----------
  function fnAt(pc) {
    if (!program) return null;
    return program.fnRanges.find((f) => pc >= f.start && pc < f.end);
  }
  function fmtVal(v) {
    if (typeof v === "bigint") {
      const dec = Number(BigInt.asIntN(64, v));
      return { hex: "0x" + v.toString(16).padStart(16, "0"), dec };
    }
    return { hex: "0x" + (v >>> 0).toString(16).padStart(8, "0"), dec: v | 0 };
  }

  function render() {
    renderDisasm();
    renderRegs();
    renderVars();
    renderMem();
    renderStatus();
    $("console").textContent = machine ? machine.out.join("") : "";
    try {
      if (program) CE.CPUView.update($("cpu"), program, machine, snaps.length > 1 ? snaps[snaps.length - 2] : null);
    } catch (e) { console.error(e); }
  }

  function renderDisasm() {
    const el = $("disasm");
    if (!program) { el.innerHTML = ""; return; }
    const frag = document.createDocumentFragment();
    let curRow = null;
    const starts = {};
    program.fnRanges.forEach((f) => (starts[f.start] = f));
    for (let i = 0; i < program.instrs.length; i++) {
      if (starts[i]) {
        const h = document.createElement("div");
        h.className = "fn";
        h.textContent = `${starts[i].name}:  (指令 ${starts[i].start}–${starts[i].end - 1})`;
        frag.appendChild(h);
      }
      const ins = program.instrs[i];
      const row = document.createElement("div");
      row.className = "row" + (machine && i === machine.pc ? " cur" : "") + (machine && i < machine.pc && i !== 0 ? " done" : "");
      if (machine && i === machine.pc) curRow = row;
      row.innerHTML = `<span class="a"></span><span class="x"></span><span class="l"></span>`;
      row.children[0].textContent = String(i).padStart(4, "0");
      row.children[1].textContent = ins.text + (i === 0 ? "   ; 程序入口" : "");
      row.children[2].textContent = ins.line ? "#L" + ins.line : "";
      frag.appendChild(row);
    }
    el.replaceChildren(frag);
    if (curRow) curRow.scrollIntoView({ block: "nearest" });
  }

  function renderRegs() {
    const el = $("regs");
    el.innerHTML = "";
    if (!machine) return;
    const meta = CE.ISA[isa];
    const alias = meta.aliases || {};
    meta.groups.forEach((grp) => {
      const g = document.createElement("div"); g.className = "grp";
      grp.forEach((name) => {
        if (!name) return;
        const v = machine.regs.get(name);
        const f = fmtVal(v);
        const d = document.createElement("div");
        const changed = lastRegs && lastRegs.get(name) !== v;
        d.className = "r" + (changed ? " chg" : "");
        d.innerHTML = `<span class="rn"></span> <span class="rv"></span> <span class="rd"></span>`;
        d.children[0].textContent = alias[name] ? `${name}(${alias[name]})` : name;
        d.children[1].textContent = f.hex;
        d.children[2].textContent = "(" + f.dec + ")";
        g.appendChild(d);
      });
      el.appendChild(g);
    });
    const fl = document.createElement("div"); fl.className = "flags grp";
    ["z", "n"].forEach((k) => {
      const d = document.createElement("div");
      d.className = "f" + (machine.flags[k] ? " set" : "");
      d.textContent = (k === "z" ? "ZF" : "NF") + "=" + (machine.flags[k] ? 1 : 0);
      fl.appendChild(d);
    });
    el.appendChild(fl);
    lastRegs = new Map(machine.regs);
  }

  function renderVars() {
    const el = $("vars");
    el.innerHTML = "";
    const th = document.createElement("tr");
    ["变量", "地址", "值", "十六进制"].forEach((t) => { const c = document.createElement("th"); c.textContent = t; th.appendChild(c); });
    el.appendChild(th);
    if (!machine) return;
    const add = (name, addrStr, val, ok) => {
      const tr = document.createElement("tr");
      const f = val === null ? { hex: "-" } : fmtVal(val);
      tr.innerHTML = `<td class="vn"></td><td class="vd"></td><td class="vm"></td><td class="vd"></td>`;
      tr.children[0].textContent = name;
      tr.children[1].textContent = addrStr;
      tr.children[2].textContent = val === null ? "-" : String(val | 0);
      tr.children[2].className = "vm" + (ok ? " vs" : "");
      tr.children[3].textContent = f.hex;
      el.appendChild(tr);
    };
    if (machine.status === "done" && machine.vars) {
      for (const k in machine.vars) add(k, "main 帧", machine.vars[k], false);
      return;
    }
    const fn = fnAt(machine.pc);
    if (!fn) return;
    const slots = program.fnSlots[fn.name];
    const baseR = machine.regs.get(CE.ISA[isa].base);
    const base = Number(baseR);
    if (!base) return;
    const addRow = (name, off) => {
      const v = i32(base + off);
      add(name, `[${CE.ISA[isa].base}${off < 0 ? "-" : "+"}${Math.abs(off)}]`, v, false);
    };
    for (const name in slots) {
      const s = slots[name];
      if (s.kind === "cls") for (const m in s.members) addRow(`${name}.${m}`, s.off + s.members[m]);
      else addRow(name, s.off);
    }
  }

  function renderMem() {
    const el = $("mem");
    el.innerHTML = "";
    if (!machine) return;
    const base = Number(machine.regs.get(CE.ISA[isa].base) || 0n) || Number(machine.regs.get(CE.ISA[isa].stack) || 0);
    let start = Math.max(0, (base & ~15) - 64);
    if (start + 256 > machine.mem.length) start = machine.mem.length - 256;
    const ann = {};
    const fn = fnAt(machine.pc);
    if (fn && base) {
      const slots = program.fnSlots[fn.name];
      for (const name in slots) {
        const s = slots[name];
        if (s.kind === "cls") for (const m in s.members) ann[base + s.off + s.members[m]] = `${name}.${m}`;
        else ann[base + s.off] = name;
      }
    }
    const tbl = document.createElement("table");
    const cur = machine.mem;
    for (let r = 0; r < 16; r++) {
      const tr = document.createElement("tr");
      const addr = start + r * 16;
      const tdA = document.createElement("td"); tdA.className = "addr";
      tdA.textContent = "0x" + addr.toString(16).padStart(4, "0");
      tr.appendChild(tdA);
      for (let c = 0; c < 16; c++) {
        const i = addr + c;
        const td = document.createElement("td");
        const changed = lastMem && lastMem[i] !== cur[i];
        td.className = "b" + (changed ? " chg" : "");
        td.textContent = cur[i].toString(16).padStart(2, "0");
        td.title = ann[i] ? `变量 ${ann[i]}` : "";
        tr.appendChild(td);
      }
      const tdN = document.createElement("td");
      tdN.className = "ann";
      if (ann[addr]) tdN.textContent = "← " + ann[addr];
      else {
        for (let c = 1; c < 16; c++) if (ann[addr + c]) { tdN.textContent = "← " + ann[addr + c]; break; }
      }
      tr.appendChild(tdN);
      tbl.appendChild(tr);
    }
    el.appendChild(tbl);
    lastMem = cur.slice();
  }

  function renderStatus() {
    if (!machine) return;
    $("stPC").textContent = machine.pc;
    const fn = fnAt(machine.pc);
    $("stFn").textContent = fn ? fn.name : "-";
    $("stSteps").textContent = machine.steps;
    $("stFlags").textContent = `Z=${machine.flags.z ? 1 : 0} N=${machine.flags.n ? 1 : 0}`;
    $("stState").textContent = machine.status === "running" ? "运行中" : machine.status === "done" ? `已退出 (返回值 ${machine.exitCode})` : "错误: " + machine.error;
  }

  function verify() {
    const v = $("stVerify");
    v.className = "chip verify";
    if (!machine || !curSample || machine.status !== "done") return;
    const exp = curSample.expect;
    const errs = [];
    if (machine.out.join("") !== exp.output) errs.push(`输出 '${machine.out.join("")}' ≠ '${exp.output}'`);
    if (machine.exitCode !== exp.exit) errs.push(`返回 ${machine.exitCode} ≠ ${exp.exit}`);
    if (exp.vars) for (const k in exp.vars) if (machine.vars && machine.vars[k] !== exp.vars[k]) errs.push(`${k}≠${exp.vars[k]}`);
    if (!exp.vars && !errs.length) { }
    if (errs.length) { v.textContent = "✗ 验证失败: " + errs.join("; "); v.classList.add("bad"); }
    else { v.textContent = "✓ 验证通过: 输出/返回值/对象内存 全部符合预期"; v.classList.add("ok"); }
  }

  markTab();
  selEl.value = CE.SAMPLES[0].id;
  loadSample(CE.SAMPLES[0]);
})();
