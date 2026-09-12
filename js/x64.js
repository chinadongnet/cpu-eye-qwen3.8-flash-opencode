// CPU Eye - x86-64 (System V AMD64 simplified) backend + interpreter
(function (g) {
  "use strict";
  const CE = g.CE; CE.ISA = CE.ISA || {};
  const CC = { eq: "je", ne: "jne", lt: "jl", le: "jle", gt: "jg", ge: "jge" };
  const ARGN = ["rdi", "rsi", "rdx", "rcx", "r8", "r9"], ARGW = ["edi", "esi", "edx", "ecx", "r8d", "r9d"];
  const REGS = ["rax", "rbx", "rcx", "rdx", "rsi", "rdi", "rbp", "rsp", "r8", "r9", "r10", "r11"];
  const M32 = { rax: "eax", rcx: "ecx", rdx: "edx", rbx: "ebx", rsi: "esi", rdi: "edi", r8: "r8d", r9: "r9d" };
  const fmt = (o) => `[rbp${(o >= 0 ? "+" : "") + o}]`;
  const BIG = 65536, TOP = 0xFFF0;

  function lower(prog) {
    const instrs = [], fnRanges = [], fnSlots = {};
    let mainEpi = -1, mainSlots = null;
    const emit = (ins) => { ins.addr = instrs.length; instrs.push(ins); return ins; };

    emit({ op: "call", fnref: prog.entry, text: `call ${prog.entry}`, line: 0 });
    emit({ op: "halt", text: `halt`, line: 0 });
    for (const fn of prog.fns) {
      const start = instrs.length, labels = {}, labelRefs = [];
      const BR = (mn, label, line, op) => { const i = instrs.length; emit({ op: op || "jcc", cc: mn, tgt: 0, text: `${mn} ${label}`, line: line || 0 }); labelRefs.push({ i, label }); };
      const T = (s, line) => emit({ op: "n", text: s, line: line || 0 });

      emit({ op: "push", r: "rbp", text: `push rbp`, line: 0 });
      emit({ op: "mov64", rd: "rbp", rs: "rsp", text: `mov rbp, rsp`, line: 0 });
      emit({ op: "subi", r: "rsp", v: fn.frameSize, text: `sub rsp, ${fn.frameSize}`, line: 0 });
      fn.params.forEach((p, i) => {
        const s = fn.slots[p];
        emit({ op: "ld32", rd: "rax", base: "rbp", off: 16 + 8 * i, text: `mov eax, ${fmt(16 + 8 * i)}`, line: 0 });
        emit({ op: "st32", rs: ARGN[i], base: "rbp", off: s.off, text: `mov ${fmt(s.off)}, ${ARGW[i]}`, line: 0 });
      });

      let epiLabel = null;
      for (const m of fn.mir) {
        const line = m.line;
        switch (m.m) {
          case "ldi": case "movi": {
            const k = m.k !== undefined ? m.k : m.v, r = m.d === "A" ? "rax" : "rcx";
            emit({ op: "movimm", rd: r, imm: k, text: `mov ${M32[r]}, ${k}`, line }); break;
          }
          case "ld": { const r = m.d === "A" ? "rax" : "rcx"; emit({ op: "ld32", rd: r, base: "rbp", off: m.slot.off, text: `mov ${M32[r]}, ${fmt(m.slot.off)}`, line }); break; }
          case "st": emit({ op: "st32", rs: "rax", base: "rbp", off: m.slot.off, text: `mov ${fmt(m.slot.off)}, eax`, line }); break;
          case "movAB": emit({ op: "mov32", rd: "rcx", rs: "rax", text: `mov ecx, eax`, line }); break;
          case "movBA": emit({ op: "mov32", rd: "rax", rs: "rcx", text: `mov eax, ecx`, line }); break;
          case "addi": emit({ op: m.v >= 0 ? "addi" : "subi", r: "rax", v: Math.abs(m.v), text: `${m.v >= 0 ? "add" : "sub"} eax, ${Math.abs(m.v)}`, line }); break;
          case "neg": emit({ op: "neg", text: `neg eax`, line }); break;
          case "cmp": emit({ op: "cmp", ra: "rcx", rb: "rax", text: `cmp ecx, eax`, line }); break;
          case "cmp0": emit({ op: "cmp0", ra: "rax", text: `cmp eax, 0`, line }); break;
          case "bop":
            if (m.op === "add") emit({ op: "add", rd: "rax", ra: "rax", rb: "rcx", text: `add eax, ecx`, line });
            else if (m.op === "sub") { emit({ op: "sub", rd: "rcx", ra: "rcx", rb: "rax", text: `sub ecx, eax`, line }); emit({ op: "mov32", rd: "rax", rs: "rcx", text: `mov eax, ecx`, line }); }
            else if (m.op === "mul") emit({ op: "imul1", text: `imul ecx`, line });
            else if (m.op === "div") { emit({ op: "xchg", text: `xchg eax, ecx`, line }); emit({ op: "cqo", text: `cqo`, line }); emit({ op: "idiv", text: `idiv rcx`, line }); }
            else { emit({ op: "xchg", text: `xchg eax, ecx`, line }); emit({ op: "cqo", text: `cqo`, line }); emit({ op: "idiv", text: `idiv rcx`, line }); emit({ op: "mov64", rd: "rax", rs: "rdx", text: `mov rax, rdx`, line }); }
            break;
          case "jcc": BR(CC[m.cond], m.label, line); break;
          case "jmp": BR("jmp", m.label, line, "jmp"); break;
          case "label": labels[m.name] = instrs.length; break;
          case "call":
            for (let i = 0; i < m.args.length; i++) {
              const a = m.args[i];
              emit({ op: "ld32", rd: "rax", base: "rbp", off: a.off, text: `mov eax, ${fmt(a.off)}`, line });
              emit({ op: "mov32", rd: ARGN[i], rs: "rax", text: `mov ${ARGW[i]}, eax`, line });
            }
            emit({ op: "call", fnref: m.fn, text: `call ${m.fn}`, line });
            break;
          case "ret":
            if (!epiLabel) { epiLabel = "$epi"; labels["$epi"] = -1; }
            BR("jmp", "$epi", line, "jmp"); break;
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
    return { isa: "x64", instrs, mainEpi, mainSlots, fnRanges, fnSlots };
  }

  function u64(v) { let b = BigInt(v); return ((b % (1n << 64n)) + (1n << 64n)) % (1n << 64n); }
  const s32 = (b) => Number(BigInt.asIntN(32, b));
  const s64 = (b) => Number(BigInt.asIntN(64, b));
  const w32v = (b) => Number(BigInt.asUintN(32, b));

  function create(program) {
    const buf = new ArrayBuffer(BIG), dv = new DataView(buf), u8 = new Uint8Array(buf);
    const R = new Map(); REGS.forEach(r => R.set(r, 0n)); R.set("rsp", BigInt(TOP));
    const M = { isa: "x64", pc: 0, flags: { z: false, n: false }, out: [], status: "running", exitCode: 0, error: null, vars: null, mem: u8, regs: R, steps: 0, step, snapshot, restore };
    const rd32 = (a) => BigInt(dv.getUint32(a, true) >>> 0);
    const wr32 = (a, v) => dv.setUint32(a, w32v(v), true);
    const rd64 = (a) => dv.getBigUint64(a, true);
    const wr64 = (a, v) => dv.setBigUint64(a, v, true);
    const SP = () => Number(R.get("rsp"));
    const push = (v) => { R.set("rsp", u64(R.get("rsp") - 8n)); wr64(SP(), v); };
    const pop = () => { const v = rd64(SP()); R.set("rsp", u64(R.get("rsp") + 8n)); return v; };
    const COND = { je: () => M.flags.z, jne: () => !M.flags.z, jl: () => M.flags.n, jge: () => !M.flags.n, jle: () => M.flags.z || M.flags.n, jg: () => !(M.flags.z || M.flags.n) };

    function capture() {
      if (M.vars) return;
      const base = Number(R.get("rbp")), v = {}, ms = program.mainSlots;
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
        case "n": M.pc++; return;
        case "push": push(R.get(ins.r)); M.pc++; return;
        case "mov64": R.set(ins.rd, R.get(ins.rs)); M.pc++; return;
        case "mov32": R.set(ins.rd, BigInt(w32v(R.get(ins.rs)))); M.pc++; return;
        case "movimm": R.set(ins.rd, u64(ins.imm)); M.pc++; return;
        case "ld32": R.set(ins.rd, rd32(Number(R.get(ins.base)) + ins.off)); M.pc++; return;
        case "st32": wr32(Number(R.get(ins.base)) + ins.off, R.get(ins.rs)); M.pc++; return;
        case "addi": R.set(ins.r, u64(s32(R.get(ins.r)) + ins.v)); M.pc++; return;
        case "subi": R.set(ins.r, u64(s32(R.get(ins.r)) - ins.v)); M.pc++; return;
        case "add": R.set(ins.rd, u64(s32(R.get(ins.ra)) + s32(R.get(ins.rb)))); M.pc++; return;
        case "sub": R.set(ins.rd, u64(s32(R.get(ins.ra)) - s32(R.get(ins.rb)))); M.pc++; return;
        case "imul1": R.set("rax", u64(s32(R.get("rax")) * s32(R.get("rcx")))); M.pc++; return;
        case "xchg": { const t = R.get("rax"); R.set("rax", R.get("rcx")); R.set("rcx", t); M.pc++; return; }
        case "cqo": R.set("rdx", s32(R.get("rax")) < 0 ? 0xffffffffffffffffn : 0n); M.pc++; return;
        case "idiv": {
          const b = s32(R.get("rcx"));
          if (b === 0) { M.status = "error"; M.error = "整数除零"; return; }
          const a = s64(R.get("rax"));
          R.set("rax", u64(Math.trunc(a / b))); R.set("rdx", u64(a % b)); M.pc++; return;
        }
        case "neg": R.set("rax", u64(-s32(R.get("rax")))); M.pc++; return;
        case "cmp": { const d = s32(R.get(ins.ra)) - s32(R.get(ins.rb)); M.flags.z = d === 0; M.flags.n = d < 0; M.pc++; return; }
        case "cmp0": { const d = s32(R.get(ins.ra)); M.flags.z = d === 0; M.flags.n = d < 0; M.pc++; return; }
        case "jcc": M.pc = COND[ins.cc]() ? ins.tgt : M.pc + 1; return;
        case "jmp": M.pc = ins.tgt; return;
        case "call": push(BigInt(M.pc + 1)); M.pc = ins.tgt; return;
        case "ret": M.pc = Number(pop()); return;
        case "leave": R.set("rsp", R.get("rbp")); R.set("rbp", pop()); M.pc++; return;
        case "out": M.out.push(String(s32(R.get("rax")))); M.pc++; return;
        case "outs": M.out.push(ins.str); M.pc++; return;
        case "halt": M.status = "done"; M.exitCode = s32(R.get("rax")); return;
      }
    }
    function snapshot() { return { pc: M.pc, flags: { ...M.flags }, regs: [...R.entries()], mem: u8.slice(), steps: M.steps, status: M.status, exitCode: M.exitCode, outLen: M.out.length, vars: M.vars }; }
    function restore(s) { M.pc = s.pc; M.flags = { ...s.flags }; M.steps = s.steps; u8.set(s.mem); for (const [k, v] of s.regs) R.set(k, v); M.status = s.status; M.exitCode = s.exitCode; M.vars = s.vars; M.out.length = s.outLen; }
    return M;
  }

  CE.ISA.x64 = { title: "x86-64 (System V)", bits: 64, base: "rbp", stack: "rsp", retReg: "rax", groups: [["rax", "rbx", "rcx", "rdx"], ["rsi", "rdi", "rbp", "rsp"], ["r8", "r9", "r10", "r11"]], lower, create };
})(typeof globalThis !== "undefined" ? globalThis : window);
