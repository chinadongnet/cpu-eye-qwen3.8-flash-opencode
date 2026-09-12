// CPU Eye - ARM64 (AArch64 / AAPCS64 simplified) backend + interpreter
(function (g) {
  "use strict";
  const CE = g.CE; CE.ISA = CE.ISA || {};
  const CC = { eq: "eq", ne: "ne", lt: "lt", le: "le", gt: "gt", ge: "ge" };
  const ARGN = ["x0", "x1", "x2", "x3", "x4", "x5", "x6", "x7"];
  const ARGW = ["w0", "w1", "w2", "w3", "w4", "w5", "w6", "w7"];
  const REGS = []; for (let i = 0; i <= 30; i++) REGS.push("x" + i); REGS.push("sp");
  const fmt = (o) => `[x29,#${(o >= 0 ? "" : "-") + Math.abs(o)}]`;
  const MEM = 65536, TOP = 0xFFF0;

  function lower(prog) {
    const instrs = [], fnRanges = [], fnSlots = {};
    let mainEpi = -1, mainSlots = null;
    const emit = (ins) => { ins.addr = instrs.length; instrs.push(ins); return ins; };

    emit({ op: "bl", fnref: prog.entry, text: `bl ${prog.entry}`, line: 0 });
    emit({ op: "halt", text: `halt`, line: 0 });
    for (const fn of prog.fns) {
      const start = instrs.length, labels = {}, labelRefs = [];
      const BR = (cond, label, line) => { const i = instrs.length; emit({ op: cond ? "bcc" : "b", cc: cond, tgt: 0, text: cond ? `b.${cond} ${label}` : `b ${label}`, line: line || 0 }); labelRefs.push({ i, label }); };

      emit({ op: "stp", ra: "x29", rb: "x30", base: "sp", off: -16, wb: "pre", text: `stp x29, x30, [sp,#-16]!`, line: 0 });
      emit({ op: "mov64", rd: "x29", rs: "sp", text: `mov x29, sp`, line: 0 });
      emit({ op: "subi", r: "sp", v: fn.frameSize, text: `sub sp, sp, #${fn.frameSize}`, line: 0 });
      if (fn.params.length > 8) throw new CE.Err(`本模拟器的 AAPCS64 简化约定最多支持 8 个参数`, 0);
      fn.params.forEach((p, i) => {
        const s = fn.slots[p];
        emit({ op: "st", rs: ARGN[i], base: "x29", off: s.off, text: `str ${ARGW[i]}, ${fmt(s.off)}`, line: 0 });
      });

      let epiLabel = null;
      for (const m of fn.mir) {
        const line = m.line;
        const RA = (d) => d === "A" ? "x0" : "x9", WA = (d) => d === "A" ? "w0" : "w9";
        switch (m.m) {
          case "ldi": case "movi": {
            const k = m.k !== undefined ? m.k : m.v;
            emit({ op: "movimm", rd: RA(m.d), imm: k, text: `mov ${WA(m.d)}, #${k}`, line }); break;
          }
          case "ld": emit({ op: "ld", rd: RA(m.d), base: "x29", off: m.slot.off, text: `ld${m.slot.off < 0 ? "ur" : "r"} ${WA(m.d)}, ${fmt(m.slot.off)}`, line }); break;
          case "st": emit({ op: "st", rs: "x0", base: "x29", off: m.slot.off, text: `st${m.slot.off < 0 ? "ur" : "r"} w0, ${fmt(m.slot.off)}`, line }); break;
          case "movAB": emit({ op: "mov32", rd: "x9", rs: "x0", text: `mov w9, w0`, line }); break;
          case "movBA": emit({ op: "mov32", rd: "x0", rs: "x9", text: `mov w0, w9`, line }); break;
          case "addi": emit({ op: "addi", rd: "x0", v: Math.abs(m.v), neg: m.v < 0, text: `${m.v >= 0 ? "add" : "sub"} w0, w0, #${Math.abs(m.v)}`, line }); break;
          case "neg": emit({ op: "neg32", rd: "x0", text: `sub w0, wzr, w0`, line }); break;
          case "cmp": emit({ op: "cmp", ra: "x9", rb: "x0", text: `cmp w9, w0`, line }); break;
          case "cmp0": emit({ op: "cmp0", ra: "x0", text: `cmp w0, #0`, line }); break;
          case "bop":
            if (m.op === "add") emit({ op: "add", rd: "x0", ra: "x0", rb: "x9", text: `add w0, w0, w9`, line });
            else if (m.op === "sub") emit({ op: "sub", rd: "x0", ra: "x9", rb: "x0", text: `sub w0, w9, w0`, line });
            else if (m.op === "mul") emit({ op: "mul", rd: "x0", ra: "x0", rb: "x9", text: `mul w0, w0, w9`, line });
            else if (m.op === "div") emit({ op: "sdiv", rd: "x0", ra: "x9", rb: "x0", text: `sdiv w0, w9, w0`, line });
            else {
              emit({ op: "mov32", rd: "x10", rs: "x9", text: `mov w10, w9`, line });
              emit({ op: "mov32", rd: "x11", rs: "x0", text: `mov w11, w0`, line });
              emit({ op: "sdiv", rd: "x0", ra: "x10", rb: "x11", text: `sdiv w0, w10, w11`, line });
              emit({ op: "msub", rd: "x0", rm: "x0", rs: "x11", ra: "x10", text: `msub w0, w0, w11, w10`, line });
            }
            break;
          case "jcc": BR(CC[m.cond], m.label, line); break;
          case "jmp": BR(null, m.label, line); break;
          case "label": labels[m.name] = instrs.length; break;
          case "call":
            if (m.args.length > 8) throw new CE.Err(`本模拟器的 AAPCS64 简化约定最多支持 8 个参数`, 0);
            for (let i = 0; i < m.args.length; i++) {
              const a = m.args[i];
              emit({ op: "ld", rd: ARGN[i], base: "x29", off: a.off, text: `ld${a.off < 0 ? "ur" : "r"} ${ARGW[i]}, ${fmt(a.off)}`, line });
            }
            emit({ op: "bl", fnref: m.fn, text: `bl ${m.fn}`, line });
            break;
          case "ret":
            if (!epiLabel) { epiLabel = "$epi"; labels["$epi"] = -1; }
            BR(null, "$epi", line); break;
          case "out": emit({ op: "out", text: `out w0`, line }); break;
          case "outs": emit({ op: "outs", str: m.str, text: `outstr "${m.str}"`, line }); break;
        }
      }
      const epi = instrs.length;
      if (epiLabel !== null) labels["$epi"] = epi;
      emit({ op: "mov64", rd: "sp", rs: "x29", text: `mov sp, x29`, line: 0 });
      emit({ op: "ldp", ra: "x29", rb: "x30", base: "sp", off: 16, wb: "post", text: `ldp x29, x30, [sp],#16`, line: 0 });
      emit({ op: "ret", text: `ret`, line: 0 });
      for (const r of labelRefs) instrs[r.i].tgt = labels[r.label];
      fnRanges.push({ name: fn.name, start, end: instrs.length }); fnSlots[fn.name] = fn.slots;
      if (fn.name === prog.entry) { mainEpi = epi; mainSlots = fn.slots; }
    }
    for (const ins of instrs) if (ins.fnref != null) ins.tgt = fnRanges.find(f => f.name === ins.fnref).start;
    return { isa: "arm64", instrs, mainEpi, mainSlots, fnRanges, fnSlots };
  }

  const s32 = (b) => Number(BigInt.asIntN(32, b));
  const w32v = (b) => Number(BigInt.asUintN(32, b));
  function u64(v) { let b = BigInt(v); return ((b % (1n << 64n)) + (1n << 64n)) % (1n << 64n); }

  function create(program) {
    const buf = new ArrayBuffer(MEM), dv = new DataView(buf), u8 = new Uint8Array(buf);
    const R = new Map(); REGS.forEach(r => R.set(r, 0n)); R.set("sp", BigInt(TOP));
    const M = { isa: "arm64", pc: 0, flags: { z: false, n: false }, out: [], status: "running", exitCode: 0, error: null, vars: null, mem: u8, regs: R, steps: 0, step, snapshot, restore };
    const rd32 = (a) => BigInt(dv.getUint32(a, true) >>> 0);
    const wr32 = (a, v) => dv.setUint32(a, w32v(v), true);
    const rd64 = (a) => dv.getBigUint64(a, true);
    const wr64 = (a, v) => dv.setBigUint64(a, v, true);
    const COND = { eq: () => M.flags.z, ne: () => !M.flags.z, lt: () => M.flags.n, ge: () => !M.flags.n, le: () => M.flags.z || M.flags.n, gt: () => !(M.flags.z || M.flags.n) };

    function capture() {
      if (M.vars) return;
      const base = Number(R.get("x29")), v = {}, ms = program.mainSlots;
      for (const name in ms) {
        const s = ms[name];
        if (s.kind === "cls") for (const f in s.members) v[`${name}.${f}`] = s32(rd32(base + s.off + s.members[f]));
        else v[name] = s32(rd32(base + s.off));
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
        case "mov64": R.set(ins.rd, R.get(ins.rs)); M.pc++; return;
        case "mov32": R.set(ins.rd, BigInt(w32v(R.get(ins.rs)))); M.pc++; return;
        case "movimm": R.set(ins.rd, u64(ins.imm)); M.pc++; return;
        case "ld": R.set(ins.rd, rd32(Number(R.get(ins.base)) + ins.off)); M.pc++; return;
        case "st": wr32(Number(R.get(ins.base)) + ins.off, R.get(ins.rs)); M.pc++; return;
        case "stp": case "ldp": {
          const isSt = ins.op === "stp", base = R.get(ins.base === "sp" ? "sp" : ins.base);
          let addr = base;
          if (ins.wb === "pre") { addr = u64(base + BigInt(ins.off)); R.set(ins.base, addr); }
          const va = isSt ? R.get(ins.ra) : rd64(Number(addr)), vb = isSt ? R.get(ins.rb) : rd64(Number(addr) + 8);
          if (isSt) { wr64(Number(addr), va); wr64(Number(addr) + 8, vb); }
          else { R.set(ins.ra, va); R.set(ins.rb, vb); }
          if (ins.wb === "post") R.set(ins.base, u64(base + BigInt(ins.off)));
          M.pc++; return;
        }
        case "addi": R.set(ins.rd, u64(s32(R.get(ins.rd)) + (ins.neg ? -ins.v : ins.v))); M.pc++; return;
        case "subi": R.set(ins.r, u64(R.get(ins.r) - BigInt(ins.v))); M.pc++; return;
        case "add": R.set(ins.rd, u64(s32(R.get(ins.ra)) + s32(R.get(ins.rb)))); M.pc++; return;
        case "sub": R.set(ins.rd, u64(s32(R.get(ins.ra)) - s32(R.get(ins.rb)))); M.pc++; return;
        case "mul": R.set(ins.rd, u64(s32(R.get(ins.ra)) * s32(R.get(ins.rb)))); M.pc++; return;
        case "sdiv": {
          const b = s32(R.get(ins.rb));
          if (b === 0) { M.status = "error"; M.error = "整数除零"; return; }
          R.set(ins.rd, u64(Math.trunc(s32(R.get(ins.ra)) / b))); M.pc++; return;
        }
        case "msub": R.set(ins.rd, u64(s32(R.get(ins.ra)) - s32(R.get(ins.rm)) * s32(R.get(ins.rs)))); M.pc++; return;
        case "neg32": R.set(ins.rd, u64(-s32(R.get(ins.rd)))); M.pc++; return;
        case "cmp": { const d = s32(R.get(ins.ra)) - s32(R.get(ins.rb)); M.flags.z = d === 0; M.flags.n = d < 0; M.pc++; return; }
        case "cmp0": { const d = s32(R.get(ins.ra)); M.flags.z = d === 0; M.flags.n = d < 0; M.pc++; return; }
        case "b": M.pc = ins.tgt; return;
        case "bcc": M.pc = COND[ins.cc]() ? ins.tgt : M.pc + 1; return;
        case "bl": R.set("x30", BigInt(M.pc + 1)); M.pc = ins.tgt; return;
        case "ret": M.pc = Number(R.get("x30")); return;
        case "out": M.out.push(String(s32(R.get("x0")))); M.pc++; return;
        case "outs": M.out.push(ins.str); M.pc++; return;
        case "halt": M.status = "done"; M.exitCode = s32(R.get("x0")); return;
      }
    }
    function snapshot() { return { pc: M.pc, flags: { ...M.flags }, regs: [...R.entries()], mem: u8.slice(), steps: M.steps, status: M.status, exitCode: M.exitCode, outLen: M.out.length, vars: M.vars }; }
    function restore(s) { M.pc = s.pc; M.flags = { ...s.flags }; M.steps = s.steps; u8.set(s.mem); for (const [k, v] of s.regs) R.set(k, v); M.status = s.status; M.exitCode = s.exitCode; M.vars = s.vars; M.out.length = s.outLen; }
    return M;
  }

  CE.ISA.arm64 = { title: "ARM64 (AArch64)", bits: 64, base: "x29", stack: "sp", retReg: "x0", aliases: { x29: "fp", x30: "lr", sp: "sp" }, groups: [["x0", "x1", "x2", "x3"], ["x4", "x5", "x6", "x7"], ["x29", "x30", "sp", ""].filter(Boolean)], lower, create };
})(typeof globalThis !== "undefined" ? globalThis : window);
