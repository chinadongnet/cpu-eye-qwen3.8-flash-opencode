// CPU Eye - x86 (IA-32) backend + interpreter
(function (g) {
  "use strict";
  const CE = g.CE; CE.ISA = CE.ISA || {};
  const CC = { eq: "je", ne: "jne", lt: "jl", le: "jle", gt: "jg", ge: "jge" };
  const fmt = (o) => `[ebp${(o >= 0 ? "+" : "") + o}]`;

  function lower(prog) {
    const instrs = [], fnRanges = [], fnSlots = {};
    let mainEpi = -1, mainSlots = null;

    function emit(ins) { ins.addr = instrs.length; instrs.push(ins); return ins; }
    const T = (s, line) => emit({ op: "n", text: s, line: line || 0 });
    const MV = (dst, src, line) => emit({ op: "mov", text: `mov ${dst}, ${src}`, line: line || 0, rdst: dst.match(/^\w+$/) ? dst : undefined, imm: typeof src === "string" && /^[+-]?\d+$/.test(src) ? parseInt(src) : undefined, base: undefined });

    emit({ op: "call", fnref: prog.entry, text: `call ${prog.entry}`, line: 0 });
    emit({ op: "halt", text: `halt`, line: 0 });
    for (const fn of prog.fns) {
      const start = instrs.length;
      const labels = {}, labelRefs = [];
      const BR = (mn, label, line) => { const i = instrs.length; emit({ op: mn.startsWith("j") && mn !== "jmp" ? "jcc" : "jmp", cc: mn, tgt: 0, label, text: `${mn} ${label}`, line: line || 0 }); labelRefs.push({ i, label }); };

      emit({ op: "push", r: "ebp", text: `push ebp`, line: 0 });
      emit({ op: "mov", rdst: "ebp", rsrc: "esp", text: `mov ebp, esp`, line: 0 });
      emit({ op: "subi", r: "esp", v: fn.frameSize, text: `sub esp, ${fn.frameSize}`, line: 0 });
      fn.params.forEach((p, i) => {
        const s = fn.slots[p];
        emit({ op: "mov", base: "ebp", off: 8 + 4 * i, rdst: "eax", text: `mov eax, ${fmt(8 + 4 * i)}`, line: 0 });
        emit({ op: "mov", base: "ebp", off: s.off, rsrc: "eax", text: `mov ${fmt(s.off)}, eax`, line: 0 });
      });

      let epiLabel = null;
      for (const m of fn.mir) {
        const line = m.line;
        switch (m.m) {
          case "ldi": case "movi": {
            const k = m.k !== undefined ? m.k : m.v, r = m.d === "A" ? "eax" : "ecx";
            emit({ op: "mov", rdst: r, imm: k, text: `mov ${r}, ${k}`, line }); break;
          }
          case "ld": emit({ op: "mov", base: "ebp", off: m.slot.off, rdst: m.d === "A" ? "eax" : "ecx", text: `mov ${m.d === "A" ? "eax" : "ecx"}, ${fmt(m.slot.off)}`, line }); break;
          case "st": emit({ op: "mov", base: "ebp", off: m.slot.off, rsrc: "eax", text: `mov ${fmt(m.slot.off)}, eax`, line }); break;
          case "movAB": emit({ op: "mov", rdst: "ecx", rsrc: "eax", text: `mov ecx, eax`, line }); break;
          case "movBA": emit({ op: "mov", rdst: "eax", rsrc: "ecx", text: `mov eax, ecx`, line }); break;
          case "addi": emit({ op: m.v >= 0 ? "addi" : "subi", r: "eax", v: Math.abs(m.v), text: `${m.v >= 0 ? "add" : "sub"} eax, ${Math.abs(m.v)}`, line }); break;
          case "neg": emit({ op: "neg", text: `neg eax`, line }); break;
          case "cmp": emit({ op: "cmp", ra: "ecx", rb: "eax", text: `cmp ecx, eax`, line }); break;
          case "cmp0": emit({ op: "cmp0", ra: "eax", text: `cmp eax, 0`, line }); break;
          case "bop":
            if (m.op === "add") emit({ op: "add", rdst: "eax", rsrc: "ecx", text: `add eax, ecx`, line });
            else if (m.op === "sub") { emit({ op: "sub", rdst: "ecx", rsrc: "eax", text: `sub ecx, eax`, line }); emit({ op: "mov", rdst: "eax", rsrc: "ecx", text: `mov eax, ecx`, line }); }
            else if (m.op === "mul") emit({ op: "imul1", text: `imul ecx`, line });
            else if (m.op === "div") { emit({ op: "xchg", text: `xchg eax, ecx`, line }); emit({ op: "cdq", text: `cdq`, line }); emit({ op: "idiv", text: `idiv ecx`, line }); }
            else { emit({ op: "xchg", text: `xchg eax, ecx`, line }); emit({ op: "cdq", text: `cdq`, line }); emit({ op: "idiv", text: `idiv ecx`, line }); emit({ op: "mov", rdst: "eax", rsrc: "edx", text: `mov eax, edx`, line }); }
            break;
          case "jcc": BR(CC[m.cond], m.label, line); break;
          case "jmp": BR("jmp", m.label, line); break;
          case "label": labels[m.name] = instrs.length; break;
          case "call":
            for (const a of m.args) {
              emit({ op: "mov", base: "ebp", off: a.off, rdst: "eax", text: `mov eax, ${fmt(a.off)}`, line });
              emit({ op: "push", r: "eax", text: `push eax`, line });
            }
            emit({ op: "call", fnref: m.fn, text: `call ${m.fn}`, line });
            if (m.args.length) emit({ op: "subi", r: "esp", v: 4 * m.args.length, text: `add esp, ${4 * m.args.length}`, line, addsp: true });
            break;
          case "ret":
            if (!epiLabel) { epiLabel = "$epi"; labels["$epi"] = -1; }
            BR("jmp", "$epi", line); break;
          case "out": emit({ op: "out", text: `out eax`, line }); break;
          case "outs": emit({ op: "outs", str: m.str, text: `outstr "${m.str}"`, line }); break;
        }
      }
      const epi = instrs.length;
      if (epiLabel !== null) labels["$epi"] = epi;
      emit({ op: "leave", text: `leave`, line: 0 }); emit({ op: "ret", text: `ret`, line: 0 });
      for (const r of labelRefs) instrs[r.i].tgt = labels[r.label];
      fnRanges.push({ name: fn.name, start, end: instrs.length }); fnSlots[fn.name] = fn.slots;
      if (fn.name === prog.entry) { mainEpi = epi; mainSlots = fn.slots; }
    }
    for (const ins of instrs) if (ins.fnref != null) ins.tgt = fnRanges.find(f => f.name === ins.fnref).start;
    return { isa: "x86", instrs, mainEpi, mainSlots, fnRanges, fnSlots };
  }

  // ---- interpreter ----
  const MEM = 65536, TOP = 0xFFF0;
  const REGS = ["eax", "ecx", "edx", "ebx", "esp", "ebp", "esi", "edi"];
  function create(program) {
    const buf = new ArrayBuffer(MEM), dv = new DataView(buf), u8 = new Uint8Array(buf);
    const R = new Map(); REGS.forEach(r => R.set(r, 0)); R.set("esp", TOP);
    const M = {
      isa: "x86", pc: 0, flags: { z: false, n: false }, out: [], status: "running", exitCode: 0, error: null,
      vars: null, mem: u8, regs: R, steps: 0, r32: (n) => (R.get(n) | 0), step, snapshot, restore,
    };
    const r32 = (n) => (R.get(n) | 0);
    const w32 = (n, v) => R.set(n, v >>> 0);
    const rd = (a) => dv.getUint32(a >>> 0, true);
    const wr = (a, v) => dv.setUint32(a >>> 0, v >>> 0, true);
    const push = (v) => { R.set("esp", (R.get("esp") - 4) >>> 0); wr(R.get("esp"), v); };
    const pop = () => { const v = rd(R.get("esp")); R.set("esp", (R.get("esp") + 4) >>> 0); return v; };
    const COND = { je: () => M.flags.z, jne: () => !M.flags.z, jl: () => M.flags.n, jge: () => !M.flags.n, jle: () => M.flags.z || M.flags.n, jg: () => !(M.flags.z || M.flags.n) };

    function capture() {
      if (M.vars) return;
      const base = R.get("ebp") | 0, v = {}, ms = program.mainSlots;
      for (const name in ms) {
        const s = ms[name];
        if (s.kind === "cls") for (const f in s.members) v[`${name}.${f}`] = rd(base + s.off + s.members[f]) | 0;
        else v[name] = rd(base + s.off) | 0;
      }
      M.vars = v;
    }

    function step() {
      if (M.status !== "running") return;
      const ins = program.instrs[M.pc];
      if (!ins) { M.status = "done"; return; }
      if (program.mainEpi === M.pc) capture();
      M.steps++;
      switch (ins.op) {
        case "n": M.pc++; return;
        case "push": push(R.get(ins.r)); M.pc++; return;
        case "pop": R.set(ins.r, pop()); M.pc++; return;
        case "mov":
          if (ins.imm != null) R.set(ins.rdst, ins.imm >>> 0);
          else if (ins.rdst && ins.rsrc) R.set(ins.rdst, R.get(ins.rsrc));
          else if (ins.rdst) R.set(ins.rdst, rd((R.get(ins.base) + ins.off) >>> 0));
          else wr((R.get(ins.base) + ins.off) >>> 0, R.get(ins.rsrc));
          M.pc++; return;
        case "addi": R.set(ins.r, (r32(ins.r) + ins.v) | 0); M.pc++; return;
        case "subi": R.set(ins.r, ins.addsp ? (R.get(ins.r) + ins.v) >>> 0 : (r32(ins.r) - ins.v) | 0); M.pc++; return;
        case "add": R.set(ins.rdst, (r32(ins.rdst) + r32(ins.rsrc)) | 0); M.pc++; return;
        case "sub": R.set(ins.rdst, (r32(ins.rdst) - r32(ins.rsrc)) | 0); M.pc++; return;
        case "imul1": w32("eax", r32("eax") * r32("ecx")); M.pc++; return;
        case "xchg": { const t = R.get("eax"); R.set("eax", R.get("ecx")); R.set("ecx", t); M.pc++; return; }
        case "cdq": R.set("edx", r32("eax") < 0 ? 0xffffffff : 0); M.pc++; return;
        case "idiv": {
          const d = r32("ecx");
          if (d === 0) { M.status = "error"; M.error = "整数除零"; return; }
          const a = r32("eax");
          w32("eax", Math.trunc(a / d)); w32("edx", a % d); M.pc++; return;
        }
        case "neg": w32("eax", -r32("eax")); M.pc++; return;
        case "cmp": { const d = (r32(ins.ra) - r32(ins.rb)) | 0; M.flags.z = d === 0; M.flags.n = d < 0; M.pc++; return; }
        case "cmp0": { const d = r32("eax"); M.flags.z = d === 0; M.flags.n = d < 0; M.pc++; return; }
        case "jcc": M.pc = COND[ins.cc]() ? ins.tgt : M.pc + 1; return;
        case "jmp": M.pc = ins.tgt; return;
        case "call": push(M.pc + 1); M.pc = ins.tgt; return;
        case "ret": M.pc = pop(); return;
        case "leave": R.set("esp", R.get("ebp")); R.set("ebp", pop()); M.pc++; return;
        case "out": M.out.push(String(r32("eax"))); M.pc++; return;
        case "outs": M.out.push(ins.str); M.pc++; return;
        case "halt": M.status = "done"; M.exitCode = r32("eax"); return;
      }
    }
    function snapshot() { return { pc: M.pc, flags: { ...M.flags }, regs: [...R.entries()], mem: u8.slice(), steps: M.steps, status: M.status, exitCode: M.exitCode, outLen: M.out.length, vars: M.vars }; }
    function restore(s) { M.pc = s.pc; M.flags = { ...s.flags }; M.steps = s.steps; u8.set(s.mem); for (const [k, v] of s.regs) R.set(k, v); M.status = s.status; M.exitCode = s.exitCode; M.vars = s.vars; M.out.length = s.outLen; }
    return M;
  }

  CE.ISA.x86 = { title: "x86 (IA-32)", bits: 32, base: "ebp", stack: "esp", retReg: "eax", groups: [["eax", "ecx", "edx", "ebx"], ["esp", "ebp", "esi", "edi"]], lower, create };
})(typeof globalThis !== "undefined" ? globalThis : window);
