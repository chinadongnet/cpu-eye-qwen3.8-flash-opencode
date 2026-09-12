// CPU Eye - ARM32 (Aarch32 / AAPCS simplified) backend + interpreter
(function (g) {
  "use strict";
  const CE = g.CE; CE.ISA = CE.ISA || {};
  const CC = { eq: "eq", ne: "ne", lt: "lt", le: "le", gt: "gt", ge: "ge" };
  const ARGN = ["r0", "r1", "r2", "r3"];
  const REGS = ["r0", "r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9", "r10", "r11", "r13", "r14"];
  const fmt = (o) => `[r11,#${(o >= 0 ? "" : "-") + Math.abs(o)}]`;
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

      emit({ op: "push", list: ["r11", "r14"], text: `push {r11, lr}`, line: 0 });
      emit({ op: "mov", rd: "r11", rs: "r13", text: `mov r11, sp`, line: 0 });
      emit({ op: "subi", r: "r13", v: fn.frameSize, text: `sub sp, sp, #${fn.frameSize}`, line: 0 });
      if (fn.params.length > 4) throw new CE.Err(`本模拟器的 AAPCS 简化约定最多支持 4 个参数`, 0);
      fn.params.forEach((p, i) => {
        const s = fn.slots[p];
        emit({ op: "st", rs: ARGN[i], base: "r11", off: s.off, text: `str ${ARGN[i]}, ${fmt(s.off)}`, line: 0 });
      });

      let epiLabel = null, epiIdx = 0;
      for (const m of fn.mir) {
        const line = m.line;
        const RA = (d) => d === "A" ? "r0" : "r3";
        switch (m.m) {
          case "ldi": case "movi": {
            const k = m.k !== undefined ? m.k : m.v;
            emit({ op: "mov", rd: RA(m.d), imm: k, text: `mov ${RA(m.d)}, #${k}`, line }); break;
          }
          case "ld": emit({ op: "ld", rd: RA(m.d), base: "r11", off: m.slot.off, text: `ldr ${RA(m.d)}, ${fmt(m.slot.off)}`, line }); break;
          case "st": emit({ op: "st", rs: "r0", base: "r11", off: m.slot.off, text: `str r0, ${fmt(m.slot.off)}`, line }); break;
          case "movAB": emit({ op: "mov", rd: "r3", rs: "r0", text: `mov r3, r0`, line }); break;
          case "movBA": emit({ op: "mov", rd: "r0", rs: "r3", text: `mov r0, r3`, line }); break;
          case "addi": emit({ op: "addi", rd: "r0", v: Math.abs(m.v), neg: m.v < 0, text: `${m.v >= 0 ? "add" : "sub"} r0, r0, #${Math.abs(m.v)}`, line }); break;
          case "neg": emit({ op: "rsb", rd: "r0", rs: "r0", text: `rsb r0, r0, #0`, line }); break;
          case "cmp": emit({ op: "cmp", ra: "r3", rb: "r0", text: `cmp r3, r0`, line }); break;
          case "cmp0": emit({ op: "cmp0", ra: "r0", text: `cmp r0, #0`, line }); break;
          case "bop":
            if (m.op === "add") emit({ op: "add", rd: "r0", ra: "r0", rb: "r3", text: `add r0, r0, r3`, line });
            else if (m.op === "sub") emit({ op: "sub", rd: "r0", ra: "r3", rb: "r0", text: `rsb r0, r0, r3`, line });
            else if (m.op === "mul") emit({ op: "mul", rd: "r0", ra: "r0", rb: "r3", text: `mul r0, r0, r3`, line });
            else if (m.op === "div") emit({ op: "sdiv", rd: "r0", ra: "r3", rb: "r0", text: `sdiv r0, r3, r0`, line });
            else {
              emit({ op: "mov", rd: "r1", rs: "r0", text: `mov r1, r0`, line });
              emit({ op: "mov", rd: "r2", rs: "r3", text: `mov r2, r3`, line });
              emit({ op: "sdiv", rd: "r0", ra: "r2", rb: "r1", text: `sdiv r0, r2, r1`, line });
              emit({ op: "mul", rd: "r1", ra: "r0", rb: "r1", text: `mul r1, r0, r1`, line });
              emit({ op: "sub", rd: "r0", ra: "r2", rb: "r1", text: `sub r0, r2, r1`, line });
            }
            break;
          case "jcc": BR(CC[m.cond], m.label, line); break;
          case "jmp": BR(null, m.label, line); break;
          case "label": labels[m.name] = instrs.length; break;
          case "call":
            if (m.args.length > 4) throw new CE.Err(`本模拟器的 AAPCS 简化约定最多支持 4 个参数`, 0);
            for (let i = 0; i < m.args.length; i++) {
              const a = m.args[i];
              emit({ op: "ld", rd: ARGN[i], base: "r11", off: a.off, text: `ldr ${ARGN[i]}, ${fmt(a.off)}`, line });
            }
            emit({ op: "bl", fnref: m.fn, text: `bl ${m.fn}`, line });
            break;
          case "ret":
            if (!epiLabel) { epiLabel = "$epi"; labels["$epi"] = -1; }
            BR(null, "$epi", line); break;
          case "out": emit({ op: "out", text: `out r0`, line }); break;
          case "outs": emit({ op: "outs", str: m.str, text: `outstr "${m.str}"`, line }); break;
        }
      }
      const epi = instrs.length;
      if (epiLabel !== null) labels["$epi"] = epi;
      emit({ op: "mov", rd: "r13", rs: "r11", text: `mov sp, r11`, line: 0 });
      emit({ op: "pop", list: ["r11", "pc"], text: `pop {r11, pc}`, line: 0 });
      for (const r of labelRefs) instrs[r.i].tgt = labels[r.label];
      fnRanges.push({ name: fn.name, start, end: instrs.length }); fnSlots[fn.name] = fn.slots;
      if (fn.name === prog.entry) { mainEpi = epi; mainSlots = fn.slots; }
    }
    for (const ins of instrs) if (ins.fnref != null) ins.tgt = fnRanges.find(f => f.name === ins.fnref).start;
    return { isa: "arm32", instrs, mainEpi, mainSlots, fnRanges, fnSlots };
  }

  const s32v = (v) => (v | 0);
  function create(program) {
    const buf = new ArrayBuffer(MEM), dv = new DataView(buf), u8 = new Uint8Array(buf);
    const R = new Map(); REGS.forEach(r => R.set(r, 0)); R.set("r13", TOP);
    const M = { isa: "arm32", pc: 0, flags: { z: false, n: false }, out: [], status: "running", exitCode: 0, error: null, vars: null, mem: u8, regs: R, steps: 0, step, snapshot, restore };
    const rd = (a) => dv.getUint32(a >>> 0, true);
    const wr = (a, v) => dv.setUint32(a >>> 0, v >>> 0, true);
    const COND = { eq: () => M.flags.z, ne: () => !M.flags.z, lt: () => M.flags.n, ge: () => !M.flags.n, le: () => M.flags.z || M.flags.n, gt: () => !(M.flags.z || M.flags.n) };

    function capture() {
      if (M.vars) return;
      const base = R.get("r11") | 0, v = {}, ms = program.mainSlots;
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
        case "mov": R.set(ins.rd, ins.imm != null ? ins.imm >>> 0 : R.get(ins.rs)); M.pc++; return;
        case "ld": R.set(ins.rd, rd((R.get(ins.base) + ins.off) >>> 0)); M.pc++; return;
        case "st": wr((R.get(ins.base) + ins.off) >>> 0, R.get(ins.rs)); M.pc++; return;
        case "push": { const n = ins.list.length; R.set("r13", (R.get("r13") - 4 * n) >>> 0); ins.list.forEach((r, i) => wr((R.get("r13") + 4 * i) >>> 0, R.get(r))); M.pc++; return; }
        case "pop": { for (let i = 0; i < ins.list.length; i++) { const v = rd(R.get("r13") >>> 0); R.set("r13", (R.get("r13") + 4) >>> 0); if (ins.list[i] === "pc") { M.pc = v; return; } R.set(ins.list[i], v); } M.pc++; return; }
        case "addi": R.set("r0", (s32v(R.get("r0")) + (ins.neg ? -ins.v : ins.v)) >>> 0); M.pc++; return;
        case "subi": R.set(ins.r, (R.get(ins.r) - ins.v) >>> 0); M.pc++; return;
        case "add": R.set(ins.rd, (s32v(R.get(ins.ra)) + s32v(R.get(ins.rb))) >>> 0); M.pc++; return;
        case "sub": R.set(ins.rd, (s32v(R.get(ins.ra)) - s32v(R.get(ins.rb))) >>> 0); M.pc++; return;
        case "mul": R.set(ins.rd, Math.imul(s32v(R.get(ins.ra)), s32v(R.get(ins.rb))) >>> 0); M.pc++; return;
        case "sdiv": {
          const b = s32v(R.get(ins.rb));
          if (b === 0) { M.status = "error"; M.error = "整数除零"; return; }
          R.set(ins.rd, Math.trunc(s32v(R.get(ins.ra)) / b) >>> 0); M.pc++; return;
        }
        case "rsb": R.set(ins.rd, (-s32v(R.get(ins.rs))) >>> 0); M.pc++; return;
        case "cmp": { const d = (s32v(R.get(ins.ra)) - s32v(R.get(ins.rb))) | 0; M.flags.z = d === 0; M.flags.n = d < 0; M.pc++; return; }
        case "cmp0": { const d = s32v(R.get(ins.ra)); M.flags.z = d === 0; M.flags.n = d < 0; M.pc++; return; }
        case "b": M.pc = ins.tgt; return;
        case "bcc": M.pc = COND[ins.cc]() ? ins.tgt : M.pc + 1; return;
        case "bl": R.set("r14", M.pc + 1); M.pc = ins.tgt; return;
        case "out": M.out.push(String(s32v(R.get("r0")))); M.pc++; return;
        case "outs": M.out.push(ins.str); M.pc++; return;
        case "halt": M.status = "done"; M.exitCode = s32v(R.get("r0")); return;
      }
    }
    function snapshot() { return { pc: M.pc, flags: { ...M.flags }, regs: [...R.entries()], mem: u8.slice(), steps: M.steps, status: M.status, exitCode: M.exitCode, outLen: M.out.length, vars: M.vars }; }
    function restore(s) { M.pc = s.pc; M.flags = { ...s.flags }; M.steps = s.steps; u8.set(s.mem); for (const [k, v] of s.regs) R.set(k, v); M.status = s.status; M.exitCode = s.exitCode; M.vars = s.vars; M.out.length = s.outLen; }
    return M;
  }

  CE.ISA.arm32 = { title: "ARM32 (Aarch32)", bits: 32, base: "r11", stack: "r13", retReg: "r0", aliases: { r13: "sp", r14: "lr", r11: "fp", r15: "pc" }, groups: [["r0", "r1", "r2", "r3"], ["r4", "r5", "r6", "r7"], ["r8", "r9", "r10", "r11"], ["r13", "r14"]], lower, create };
})(typeof globalThis !== "undefined" ? globalThis : window);
