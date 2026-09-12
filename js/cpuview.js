// CPU Eye - CPU 结构示意图 (SVG, 随执行逐步更新)
(function (g) {
  "use strict";
  const CE = g.CE;

  const SVG = `
<svg viewBox="0 0 560 336" xmlns="http://www.w3.org/2000/svg">
<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" class="arrhead"/></marker></defs>
<g class="mod" id="gCU"><rect x="232" y="8" width="116" height="46" rx="6"/><text x="240" y="24" class="cap">CU 控制单元</text><text x="240" y="46" class="val big" id="tOp">—</text></g>
<g class="mod" id="gBR"><rect x="356" y="8" width="116" height="46" rx="6"/><text x="364" y="24" class="cap">分支/目标</text><text x="364" y="46" class="val" id="tBr">—</text></g>
<g class="mod" id="gFL"><rect x="480" y="8" width="70" height="46" rx="6"/><text x="488" y="24" class="cap">标志</text><text x="490" y="46" class="val" id="fZ">Z0</text><text x="520" y="46" class="val" id="fN">N0</text></g>
<g class="mod" id="gPC"><rect x="10" y="8" width="100" height="46" rx="6"/><text x="18" y="24" class="cap">PC 程序计数器</text><text x="18" y="46" class="val big" id="tPC">—</text></g>
<g class="mod" id="gIR"><rect x="130" y="64" width="300" height="42" rx="6"/><text x="138" y="78" class="cap">IR 指令寄存器 (译码)</text><text x="138" y="98" class="val" id="tIR">—</text></g>
<g class="mod" id="gFetch"><rect x="10" y="64" width="112" height="264" rx="6"/><text x="16" y="78" class="cap">指令存储器</text>
<rect id="pcrow0" x="14" y="86" width="104" height="24" class="row"/><text id="fA0" x="18" y="102" class="val sm"></text><text id="fX0" x="62" y="102" class="val sm"></text>
<rect id="pcrow1" x="14" y="114" width="104" height="24" class="row"/><text id="fA1" x="18" y="130" class="val sm"></text><text id="fX1" x="62" y="130" class="val sm"></text>
<rect id="pcrow2" x="14" y="142" width="104" height="24" class="row"/><text id="fA2" x="18" y="158" class="val sm"></text><text id="fX2" x="62" y="158" class="val sm"></text>
<rect id="pcrow3" x="14" y="170" width="104" height="24" class="row"/><text id="fA3" x="18" y="186" class="val sm"></text><text id="fX3" x="62" y="186" class="val sm"></text>
<rect id="pcrow4" x="14" y="198" width="104" height="24" class="row"/><text id="fA4" x="18" y="214" class="val sm"></text><text id="fX4" x="62" y="214" class="val sm"></text>
<rect id="pcrow5" x="14" y="226" width="104" height="24" class="row"/><text id="fA5" x="18" y="242" class="val sm"></text><text id="fX5" x="62" y="242" class="val sm"></text>
</g>
<g class="mod" id="gRegs"><rect x="445" y="64" width="105" height="176" rx="6"/><text x="452" y="78" class="cap">寄存器组</text>
<text id="rL0" x="452" y="98" class="lbl"></text><text id="rV0" x="486" y="98" class="val sm"></text>
<text id="rL1" x="452" y="126" class="lbl"></text><text id="rV1" x="486" y="126" class="val sm"></text>
<text id="rL2" x="452" y="154" class="lbl"></text><text id="rV2" x="486" y="154" class="val sm"></text>
<text id="rL3" x="452" y="182" class="lbl"></text><text id="rV3" x="486" y="182" class="val sm"></text>
<text id="rL4" x="452" y="210" class="lbl"></text><text id="rV4" x="486" y="210" class="val sm"></text>
<text id="rL5" x="452" y="238" class="lbl"></text><text id="rV5" x="486" y="238" class="val sm"></text>
</g>
<polygon points="240,150 340,150 360,215 220,215" class="mod-shape" id="shALU"/>
<text x="290" y="188" class="val big alu-op" id="tAluOp" text-anchor="middle">—</text>
<text x="232" y="172" class="val sm" id="tAluA" text-anchor="end">—</text>
<text x="348" y="172" class="val sm" id="tAluB">—</text>
<text x="290" y="232" class="val sm" id="tAluRes" text-anchor="middle">—</text>
<text x="290" y="142" class="cap" text-anchor="middle">ALU</text>
<g class="mod" id="gMem"><rect x="140" y="252" width="290" height="76" rx="6"/><text x="150" y="268" class="cap">MEM 数据存储器 (栈)</text>
<rect x="150" y="278" width="120" height="40" rx="4" class="sub"/><text x="156" y="292" class="cap">MAR 地址</text><text x="156" y="312" class="val" id="tMAR">—</text>
<rect x="280" y="278" width="120" height="40" rx="4" class="sub"/><text x="286" y="292" class="cap">MDR 数据</text><text x="286" y="312" class="val" id="tMDR">—</text>
<text x="408" y="302" class="val" id="tDir"></text>
</g>
<line id="flPC" x1="60" y1="54" x2="64" y2="64" class="flow"/>
<path id="flFetch" d="M122,96 L130,88" class="flow"/>
<path id="flDec" d="M288,106 L288,150" class="flow"/>
<path id="flOpA" d="M200,124 L252,162" class="flow"/>
<path id="flOpB" d="M452,140 L338,164" class="flow"/>
<path id="flWbMem" d="M290,215 L290,252" class="flow"/>
<path id="flWbReg" d="M440,292 L497,240" class="flow"/>
</svg>`;

  const HEX = (v, bits) => {
    if (v === undefined || v === null) return "—";
    if (typeof v === "bigint") return "0x" + v.toString(16).padStart(16, "0");
    return "0x" + (v >>> 0).toString(16).padStart(bits === 64 ? 16 : 8, "0");
  };

  const HA = (v) => v == null ? "—" : "0x" + Number(typeof v === "bigint" ? v & 0xffffffffn : v).toString(16).padStart(4, "0");
  const AA = (b, off) => b == null ? undefined : (typeof b === "bigint" ? b + BigInt(off | 0) : b + (off | 0));

  function compute(isa, ins, prev, cur, machine, prevPc) {
    const pv = (n) => (prev && n != null ? prev.get(n) : undefined);
    const cv = (n) => (n != null ? cur.get(n) : undefined);
    const ST = { x86: "esp", x64: "rsp", arm32: "r13", arm64: "sp" }[isa];
    const v = { alu: null, mem: null, br: null };
    if (!ins) return v;
    const op = ins.op;
    const A = (o, a, b, r) => (v.alu = { op: o, a, b, r });
    const M = (addr, data, dir) => (v.mem = { addr, data, dir });
    const B = (tgt, taken) => (v.br = { tgt, taken });

    switch (op) {
      case "mov": // x86/x64: 三种形态
        if (ins.imm != null) break;
        if (ins.rdst && ins.base) M(AA(pv(ins.base), ins.off), cv(ins.rdst), "R");
        else if (ins.rsrc && ins.base) M(AA(pv(ins.base), ins.off), pv(ins.rsrc), "W");
        break;
      case "ld": case "ldr": M(AA(pv(ins.base), ins.off), cv(ins.rd), "R"); break;
      case "st": case "str": M(AA(pv(ins.base), ins.off), pv(ins.rs), "W"); break;
      case "push": {
        const r0 = ins.r || ins.list[0];
        M(cv(ST), pv(r0), "W"); break;
      }
      case "pop": {
        const r0 = ins.r || ins.list.find((r) => r !== "pc");
        M(pv(ST), cv(r0), "R"); break;
      }
      case "stp": M(AA(pv(ins.base), ins.off), pv(ins.ra), "W"); break;
      case "ldp": M(ins.wb === "pre" ? AA(pv(ins.base), ins.off) : pv(ins.base), cv(ins.ra), "R"); break;
      case "addi": A(ins.neg ? "-" : "+", pv(ins.r), ins.v, cv(ins.r)); break;
      case "subi": A("-", pv(ins.r), ins.v, cv(ins.r)); break;
      case "add": { const a = ins.ra != null ? ins.ra : ins.rdst, b = ins.rb != null ? ins.rb : ins.rsrc, d = ins.rd != null ? ins.rd : ins.rdst; A("+", pv(a), pv(b), cv(d)); break; }
      case "sub": { const a = ins.ra != null ? ins.ra : ins.rdst, b = ins.rb != null ? ins.rb : ins.rsrc, d = ins.rd != null ? ins.rd : ins.rdst; A("-", pv(a), pv(b), cv(d)); break; }
      case "mul": case "imul1": {
        const a = ins.ra || "eax", b = ins.rb || "ecx", d = ins.rd || "eax";
        A("×", pv(a), pv(b), cv(d)); break;
      }
      case "sdiv": case "idiv": {
        const a = ins.ra || "eax", b = ins.rb || "ecx", d = ins.rd || "eax";
        const r = isa === "x86" || isa === "x64" ? " (余 " + HEX(pv("edx")) + ")" : "";
        A("÷", pv(a), pv(b), cv(d) === undefined ? undefined : HEX(cv(d)) + r); break;
      }
      case "msub": A("×→−", pv(ins.rm), pv(ins.rs), HEX(pv(ins.ra)) + " − …"); break;
      case "neg": case "neg32": A("−", "0", pv(ins.rd || "eax"), cv(ins.rd || "eax")); break;
      case "rsb": A("−", pv(ins.rb || "r0"), pv(ins.rs || "r0"), cv(ins.rd)); break;
      case "xchg": A("⇄", pv("eax"), pv("ecx"), pv("ecx") + " / " + HEX(pv("eax"))); break;
      case "cmp": A("− (置标志)", pv(ins.ra), pv(ins.rb), null); break;
      case "cmp0": A("− (置标志)", pv(ins.ra), 0, null); break;
      case "jcc": case "bcc": case "jmp": B(ins.tgt, machine.pc === ins.tgt); break;
      case "call": M(cv(ST), prevPc + 1, "W"); B(ins.tgt, true); break;
      case "bl": B(ins.tgt, true); break;
      case "ret": if (isa === "x86" || isa === "x64") M(pv(ST), undefined, "R"); break;
      case "leave": M(pv("ebp") !== undefined ? pv("ebp") : pv("rbp"), undefined, "R"); break;
    }
    return v;
  }

  function update(root, program, machine, prevSnap) {
    if (!root.__built) { root.innerHTML = SVG; root.__built = true; }
    const el = (id) => root.querySelector("#" + id);
    const set = (id, t) => { const e = el(id); if (e) e.textContent = t; };
    const cls = (id, on, c) => { const e = el(id); if (e) e.classList.toggle(c || "act", !!on); };
    const bits = machine ? (CE.ISA[machine.isa].bits) : 32;
    const cur = machine ? machine.regs : new Map();
    const prev = prevSnap ? new Map(prevSnap.regs) : null;
    const prevPc = prevSnap ? prevSnap.pc : 0;
    const ins = machine ? program.instrs[prevPc] : null;

    // PC + 取指窗口
    set("tPC", machine ? HA(machine.pc) : "—");
    const pc = machine ? machine.pc : 0;
    for (let i = 0; i < 6; i++) {
      const ai = pc - 3 + i, row = ai === pc;
      const inx = ai >= 0 && ai < program.instrs.length;
      set("fA" + i, inx ? HA(ai).slice(2) : "");
      set("fX" + i, inx && ai !== pc ? program.instrs[ai].text.slice(0, 12) : row ? program.instrs[ai].text.slice(0, 12) : "");
      const rr = el("pcrow" + i); if (rr) rr.setAttribute("class", "row" + (row ? " cur" : ""));
    }
    cls("gFetch", !!machine);
    cls("gPC", !!machine);
    cls("flPC", !!machine);
    cls("flFetch", !!machine);

    // IR / CU
    set("tIR", ins ? ins.text : machine && machine.status !== "running" ? "(已停止)" : "—");
    set("tOp", ins ? ins.text.split(/\s/)[0] : "—");
    cls("gIR", !!ins); cls("gCU", !!ins); cls("flDec", !!ins);

    // ALU
    const vv = machine ? compute(machine.isa, ins, prev, cur, machine, prevPc) : { alu: null, mem: null, br: null };
    set("tAluOp", vv.alu ? vv.alu.op : "—");
    set("tAluA", vv.alu ? HEX(vv.alu.a, bits) : "—");
    set("tAluB", vv.alu ? (typeof vv.alu.b === "number" ? HEX(vv.alu.b, bits) : vv.alu.b) : "—");
    set("tAluRes", vv.alu ? (vv.alu.r === null ? "→ 仅标志位" : typeof vv.alu.r === "string" && vv.alu.r.startsWith("0x") ? vv.alu.r : HEX(vv.alu.r, bits)) : "—");
    const sh = el("shALU"); if (sh) sh.classList.toggle("act", !!vv.alu);
    cls("flOpA", !!vv.alu || !!vv.mem); cls("flOpB", !!vv.alu);

    // MEM
    set("tMAR", vv.mem ? HA(vv.mem.addr) : "—");
    set("tMDR", vv.mem && vv.mem.data !== undefined ? HEX(vv.mem.data, bits) : vv.mem ? "…" : "—");
    set("tDir", vv.mem ? (vv.mem.dir === "R" ? "← 读" : "写 →") : "");
    cls("gMem", !!vv.mem);
    cls("flWbMem", !!vv.mem);
    cls("flWbReg", !!vv.alu || !!(vv.mem && vv.mem.dir === "R"));

    // 分支
    set("tBr", vv.br ? HA(vv.br.tgt) + (vv.br.taken ? " ✓执行" : " ·未跳") : "—");
    cls("gBR", !!vv.br);

    // 标志
    const fZ = machine && machine.flags.z, fN = machine && machine.flags.n;
    set("fZ", "Z" + (machine ? (fZ ? 1 : 0) : "?")); set("fN", "N" + (machine ? (fN ? 1 : 0) : "?"));
    cls("fZ", fZ, "set"); cls("fN", fN, "set");

    // 寄存器组 (变化优先)
    const meta = CE.ISA[machine.isa];
    const changed = [];
    if (prev) for (const [k, v2] of cur) if (prev.get(k) !== v2) changed.push(k);
    const show = [...changed];
    [meta.retReg, meta.base, meta.stack].forEach((r) => { if (!show.includes(r)) show.push(r); });
    for (let i = 0; i < 6; i++) {
      set("rL" + i, show[i] ? show[i] : "");
      set("rV" + i, show[i] ? HEX(cur.get(show[i]), bits) : "");
      const t = el("rV" + i);
      if (t) t.classList.toggle("chg", !!show[i] && changed.includes(show[i]));
    }
    cls("gRegs", changed.length > 0);
  }

  CE.CPUView = { update, svg: SVG };
})(typeof globalThis !== "undefined" ? globalThis : window);
