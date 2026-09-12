// CPU Eye - C++ subset frontend: lexer -> parser -> MIR (target independent)
(function (g) {
  "use strict";

  const PUNCT = ["<<", "++", "--", "+=", "-=", "*=", "/=", "==", "!=", "<=", ">=",
    "(", ")", "{", "}", "[", "]", ",", ";", ":", ".", "+", "-", "*", "/", "%", "=", "<", ">"];
  const KW = new Set(["class", "struct", "public", "private", "int", "void",
    "if", "else", "while", "for", "return", "break", "continue", "cout", "endl"]);

  function lex(src) {
    const toks = [];
    let i = 0, line = 1;
    while (i < src.length) {
      const c = src[i];
      if (c === "\n") { line++; i++; continue; }
      if (c === " " || c === "\t" || c === "\r") { i++; continue; }
      if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
      if (c === "/" && src[i + 1] === "*") {
        i += 2;
        while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] === "\n") line++; i++; }
        i += 2; continue;
      }
      if (c === "#") { while (i < src.length && src[i] !== "\n") i++; continue; }
      if (/[0-9]/.test(c)) {
        let j = i; while (j < src.length && /[0-9]/.test(src[j])) j++;
        toks.push({ t: "num", v: parseInt(src.slice(i, j), 10), line }); i = j; continue;
      }
      if (c === '"') {
        let j = i + 1, s = "";
        while (j < src.length && src[j] !== '"') {
          if (src[j] === "\\") { s += src[j + 1]; j += 2; } else s += src[j++];
        }
        toks.push({ t: "str", v: s, line }); i = j + 1; continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        let j = i; while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
        let id = src.slice(i, j); i = j;
        if (id === "std" && src[i] === ":" && src[i + 1] === ":") { i += 2; id = "cout"; }
        if (id === "using") { while (i < src.length && src[i] !== ";") i++; i++; continue; }
        if (id === "endl") { toks.push({ t: "str", v: "\n", line }); continue; }
        toks.push({ t: KW.has(id) ? id : "id", v: id, line }); continue;
      }
      const p = PUNCT.find(p => src.startsWith(p, i));
      if (!p) throw new Err(`意外的字符 '${c}'`, line);
      toks.push({ t: p, v: p, line }); i += p.length; continue;
    }
    toks.push({ t: "eof", v: null, line });
    return toks;
  }

  function Err(msg, line) { this.message = msg; this.line = line; }

  class Parser {
    constructor(src) {
      this.toks = lex(src); this.pos = 0;
      this.classNames = new Set();
    }
    peek(k = 1) { return this.toks[this.pos + k]; }
    next() { return this.toks[this.pos++]; }
    at(t) { return this.toks[this.pos].t === t; }
    eat(t) { if (this.at(t)) { return this.next(); } return null; }
    expect(t, what) {
      if (!this.at(t)) throw new Err(`期望 ${what || t}，实际是 '${this.toks[this.pos].t === "eof" ? "文件结束" : this.toks[this.pos].v}'`, this.toks[this.pos].line);
      return this.next();
    }

    parseProgram() {
      const classes = [], fns = [];
      while (!this.at("eof")) {
        if (this.at("class") || this.at("struct")) classes.push(this.parseClass());
        else fns.push(this.parseFn());
      }
      return { classes, fns };
    }
    parseClass() {
      this.next();
      const name = this.expect("id", "类名").v;
      this.classNames.add(name);
      this.expect("{");
      const fields = [];
      let pub = true;
      while (!this.at("}")) {
        if (this.at("public")) { this.next(); this.expect(":"); pub = true; continue; }
        if (this.at("private")) { this.next(); this.expect(":"); pub = false; continue; }
        this.expect("int", "int 成员");
        for (;;) {
          const id = this.expect("id", "成员名").v;
          this.eat("="); if (this.at("num")) this.next();
          fields.push({ name: id, pub });
          if (!this.eat(",")) break;
        }
        this.expect(";");
      }
      this.expect("}"); this.expect(";");
      return { name, fields };
    }
    parseFn() {
      const type = this.at("void") ? "void" : "int"; this.next();
      const name = this.expect("id", "函数名").v;
      this.expect("(");
      const params = [];
      if (!this.at(")")) for (;;) {
        this.expect("int", "int 参数");
        params.push(this.expect("id", "参数名").v);
        if (!this.eat(",")) break;
      }
      this.expect(")");
      const body = this.parseBlock();
      return { name, type, params, body };
    }
    parseBlock() {
      this.expect("{");
      const st = [];
      while (!this.at("}")) st.push(this.parseStmt());
      this.expect("}");
      return { t: "block", body: st };
    }
    parseStmt() {
      const line = this.toks[this.pos].line;
      const s = this.parseStmt0();
      if (s && !s.line) s.line = line;
      return s;
    }
    parseStmt0() {
      const tk = this.toks[this.pos];
      if (this.at("{")) return this.parseBlock();
      if (this.at("id") && this.peek().t === "id" && this.classNames.has(this.toks[this.pos].v)) {
        const cls = this.next().v;
        const list = [];
        for (;;) { list.push({ id: this.expect("id", "对象名").v, cls }); if (!this.eat(",")) break; }
        this.expect(";");
        return { t: "vardecl", list };
      }
      if (this.at("int")) return this.parseVarDecl();
      if (this.at("if")) return this.parseIf();
      if (this.at("while")) return this.parseWhile();
      if (this.at("for")) return this.parseFor();
      if (this.at("return")) { this.next(); const e = this.at(";") ? null : this.parseExpr(); this.expect(";"); return { t: "return", e, line: tk.line }; }
      if (this.at("break")) { this.next(); this.expect(";"); return { t: "break", line: tk.line }; }
      if (this.at("continue")) { this.next(); this.expect(";"); return { t: "continue", line: tk.line }; }
      if (this.at("cout")) return this.parseCout();
      if (this.at("id") && this.peek().t === "(") { const e = this.parseExpr(); this.expect(";"); return { t: "expr", e, line: tk.line }; }
      return this.parseAssignOrPostfix();
    }
    parseVarDecl() {
      this.expect("int");
      const list = [];
      for (;;) {
        const id = this.expect("id", "变量名").v;
        let init = null;
        if (this.eat("=")) init = this.parseExpr();
        list.push({ id, init });
        if (!this.eat(",")) break;
      }
      this.expect(";");
      return { t: "vardecl", list };
    }
    parseIf() {
      this.next(); this.expect("(");
      const cond = this.parseExpr(); this.expect(")");
      const th = this.parseStmt();
      let el = null;
      if (this.at("else")) { this.next(); el = this.parseStmt(); }
      return { t: "if", cond, th, el };
    }
    parseWhile() {
      this.next(); this.expect("(");
      const cond = this.parseExpr(); this.expect(")");
      const body = this.parseStmt();
      return { t: "while", cond, body };
    }
    parseFor() {
      this.next(); this.expect("(");
      let init = null;
      if (!this.at(";")) {
        if (this.at("int")) init = this.parseVarDecl();
        else { this.parseAssignOrPostfix(); }
      }
      const cond = this.at(";") ? null : this.parseExpr();
      this.expect(";");
      const step = this.at(")") ? null : this.parseAssignOrPostfix(true);
      this.expect(")");
      const body = this.parseStmt();
      return { t: "for", init, cond, step, body };
    }
    parseAssignOrPostfix(noSemi) {
      const line = this.toks[this.pos].line;
      const lhs = this.parsePostfixTarget();
      const t = this.toks[this.pos].t;
      if (t === "++" || t === "--") {
        this.next();
        if (!noSemi) this.expect(";");
        return { t: "postfix", op: t, lhs, line };
      }
      if (["=", "+=", "-=", "*=", "/="].includes(t)) {
        this.next();
        const e = this.parseExpr();
        if (!noSemi) this.expect(";");
        return { t: "assign", op: t, lhs, e, line };
      }
      throw new Err(`无法识别的表达式`, line);
    }
    parsePostfixTarget() {
      let node = { t: "var", name: this.expect("id", "变量").v };
      while (this.at(".")) { this.next(); node = { t: "member", obj: node, field: this.expect("id", "成员").v }; }
      return node;
    }
    parseCout() {
      this.next();
      const items = [];
      for (;;) {
        this.expect("<<");
        if (this.at("str")) items.push({ str: this.next().v });
        else { const e = this.parseExpr(); items.push({ e }); }
        if (!this.at("<<")) break;
      }
      this.expect(";");
      return { t: "cout", items };
    }

    parseExpr() { return this.parseBin(0); }
    parseBin(level) {
      const LEVELS = [["*", "/", "%"], ["+", "-"], ["<", "<=", ">", ">=", "==", "!="]];
      let left = level >= LEVELS.length ? this.parseUnary() : this.parseBin(level + 1);
      while (level < LEVELS.length && LEVELS[level].includes(this.toks[this.pos].t)) {
        const op = this.next().t;
        const right = this.parseBin(level + 1);
        left = { t: "binop", op, l: left, r: right };
      }
      return left;
    }
    parseUnary() {
      if (this.at("-")) { this.next(); return { t: "neg", e: this.parseUnary() }; }
      return this.parsePrimary();
    }
    parsePrimary() {
      const tk = this.toks[this.pos];
      if (tk.t === "num") { this.next(); return { t: "num", v: tk.v }; }
      if (this.at("(")) { this.next(); const e = this.parseExpr(); this.expect(")"); return e; }
      if (tk.t === "id") {
        const name = this.next().v;
        if (this.at("(")) {
          this.next();
          const args = [];
          if (!this.at(")")) for (;;) { args.push(this.parseExpr()); if (!this.eat(",")) break; }
          this.expect(")");
          return { t: "call", name, args };
        }
        let node = { t: "var", name };
        while (this.at(".")) { this.next(); node = { t: "member", obj: node, field: this.expect("id", "成员").v }; }
        return node;
      }
      throw new Err(`意外的符号 '${tk.t === "eof" ? "文件结束" : tk.v}'`, tk.line);
    }
  }

  // ---------------- MIR codegen ----------------
  let seq = 0;
  const LBL = p => `${p}.${seq++}`;

  class Codegen {
    constructor(prog) {
      this.prog = prog;
      this.classes = {};
      for (const c of prog.classes) {
        const members = {}; let off = 0;
        for (const f of c.fields) { members[f.name] = off; off += 4; }
        this.classes[c.name] = { members, size: off };
      }
      this.fns = {};
      for (const f of prog.fns) this.fns[f.name] = f;
    }

    compile() {
      const out = [];
      for (const f of this.prog.fns) out.push(this.genFn(f));
      return { fns: out, entry: "main" };
    }

    genFn(fn) {
      this.fn = fn;
      this.slots = {};
      this.mir = [];
      this.frameSize = 0;
      this.tmpCount = 0;
      this.tmpBase = 0;
      this.loops = [];

      for (const p of fn.params) this.newSlot({ name: p, kind: "int", isParam: true });
      this.gather(fn.body);
      this.tmpBase = this.frameSize;
      this.genBlock(fn.body);

      const tmpOffs = [];
      for (let i = 0; i < this.tmpCount; i++) { this.frameSize += 4; tmpOffs.push(-this.frameSize); }
      for (const m of this.mir) {
        if (m.slot && m.slot.__tmp != null) m.slot = { off: tmpOffs[m.slot.__tmp] };
        if (m.args) m.args = m.args.map(a => ({ off: tmpOffs[a.__tmp] }));
      }
      return { name: fn.name, type: fn.type, params: fn.params, slots: this.slots, frameSize: this.frameSize, mir: this.mir };
    }

    newSlot(s) {
      const size = s.kind === "cls" ? this.classes[s.cls].size : 4;
      this.frameSize += size;
      s.off = -this.frameSize;
      s.size = size;
      if (s.kind === "cls") s.members = this.classes[s.cls].members;
      this.slots[s.name] = s;
      return s;
    }
    allocTmp() { return { __tmp: this.tmpCount++ }; }

    varType(name) {
      const s = this.slots[name];
      if (!s) throw new Err(`未定义的变量 '${name}'`, 0);
      return s;
    }
    resolveLvalue(node) {
      if (node.t === "var") { const s = this.varType(node.name); if (s.kind === "cls") throw new Err(`不能整体使用对象 '${node.name}'`, 0); return s.off; }
      if (node.t === "member") {
        if (node.obj.t !== "var") throw new Err(`仅支持 a.field 形式的成员访问`, 0);
        const s = this.varType(node.obj.name);
        if (s.kind !== "cls") throw new Err(`'${node.obj.name}' 不是对象`, 0);
        if (!(node.field in s.members)) throw new Err(`类 ${s.cls} 没有成员 '${node.field}'`, 0);
        return s.off + s.members[node.field];
      }
      throw new Err(`非法的左值`, 0);
    }
    lvalueOffset(e) {
      if (e.t === "var") { const s = this.varType(e.name); if (s.kind === "cls") throw new Err(`不能整体使用对象 '${e.name}'`, 0); return s.off; }
      if (e.t === "member") return this.resolveLvalue(e);
      throw new Err(`该表达式不能作为值使用`, 0);
    }

    gather(block) {
      if (block.t === "block") { for (const s of block.body) this.gather(s); return; }
      if (block.t === "vardecl") {
        for (const d of block.list) {
          const inCls = this.prog.classes.some(c => d.cls === c.name);
          this.newSlot({ name: d.id, kind: d.cls ? "cls" : "int", cls: d.cls });
        }
        return;
      }
      if (block.t === "if") { this.gather(block.th); if (block.el) this.gather(block.el); return; }
      if (block.t === "while" || block.t === "for") { this.gather(block.body); if (block.init) this.gather(block.init); return; }
    }

    emit(m) { if (m.line === undefined) m.line = this.curLine || 0; this.mir.push(m); }

    genBlock(b) { for (const s of b.body) this.genStmt(s); }

    genStmt(s) {
      this.curLine = s.line || this.curLine || 0;
      switch (s.t) {
        case "block": this.genBlock(s); break;
        case "vardecl":
          for (const d of s.list) if (d.init) { this.genE(d.init, "A"); this.emit({ m: "st", slot: this.slots[d.id] }); }
          break;
        case "assign": {
          const off = this.resolveLvalue(s.lhs);
          if (s.op === "=") this.genE(s.e, "A");
          else {
            this.genE(s.e, "A");
            this.emit({ m: "ld", d: "B", slot: { off } });
            this.emit({ m: "bop", op: { "+=": "add", "-=": "sub", "*=": "mul", "/=": "div" }[s.op] });
          }
          this.emit({ m: "st", slot: { off } });
          break;
        }
        case "postfix": {
          const off = this.resolveLvalue(s.lhs);
          this.emit({ m: "ld", d: "A", slot: { off } });
          this.emit({ m: "addi", v: s.op === "++" ? 1 : -1 });
          this.emit({ m: "st", slot: { off } });
          break;
        }
        case "expr": if (s.e && s.e.t === "call") this.genE(s.e, "A"); break;
        case "cout":
          for (const it of s.items) {
            if (it.str != null) this.emit({ m: "outs", str: it.str });
            else { this.genE(it.e, "A"); this.emit({ m: "out" }); }
          }
          break;
        case "if": {
          const L = LBL("L"), E = LBL("E");
          this.genCond(s.cond, L);
          this.genStmt(s.th);
          if (s.el) { this.emit({ m: "jmp", label: E }); this.emit({ m: "label", name: L }); this.genStmt(s.el); this.emit({ m: "label", name: E }); }
          else this.emit({ m: "label", name: L });
          break;
        }
        case "while": {
          const LP = LBL("W"), LE = LBL("W");
          this.emit({ m: "label", name: LP });
          this.genCond(s.cond, LE);
          this.loops.push({ br: LE, cont: LP });
          this.genStmt(s.body);
          this.loops.pop();
          this.emit({ m: "jmp", label: LP });
          this.emit({ m: "label", name: LE });
          break;
        }
        case "for": {
          const LP = LBL("F"), LE = LBL("F");
          if (s.init) this.genStmt(s.init);
          this.emit({ m: "label", name: LP });
          if (s.cond) this.genCond(s.cond, LE);
          this.loops.push({ br: LE, cont: LP + ".c" });
          this.genStmt(s.body);
          this.emit({ m: "label", name: LP + ".c" });
          this.loops.pop();
          if (s.step) this.genStmt(s.step);
          this.emit({ m: "jmp", label: LP });
          this.emit({ m: "label", name: LE });
          break;
        }
        case "return":
          if (s.e) this.genE(s.e, "A");
          this.emit({ m: "ret" });
          break;
        case "break": if (!this.loops.length) throw new Err("break 必须在循环内", 0); this.emit({ m: "jmp", label: this.loops[this.loops.length - 1].br }); break;
        case "continue": if (!this.loops.length) throw new Err("continue 必须在循环内", 0); this.emit({ m: "jmp", label: this.loops[this.loops.length - 1].cont }); break;
        default: throw new Err(`不支持的语句 ${s.t}`, 0);
      }
    }

    // condition in jump context: jcc to label `falseLabel` when false
    genCond(e, falseLabel) {
      if (e.t === "binop" && ["<", "<=", ">", ">=", "==", "!="].includes(e.op)) {
        const t = this.allocTmp();
        this.genE(e.l, "A"); this.emit({ m: "st", slot: t });
        this.genE(e.r, "A"); this.emit({ m: "ld", d: "B", slot: t });
        this.emit({ m: "cmp" });
        const inv = { "<": "ge", "<=": "gt", ">": "le", ">=": "lt", "==": "ne", "!=": "eq" }[e.op];
        this.emit({ m: "jcc", cond: inv, label: falseLabel });
        return;
      }
      this.genE(e, "A");
      this.emit({ m: "cmp0" });
      this.emit({ m: "jcc", cond: "eq", label: falseLabel });
    }

    genE(e, dst) {
      switch (e.t) {
        case "num": this.emit({ m: "ldi", d: dst, k: e.v }); break;
        case "var": this.emit({ m: "ld", d: dst, slot: { off: this.lvalueOffset(e) } }); break;
        case "member": this.emit({ m: "ld", d: dst, slot: { off: this.lvalueOffset(e) } }); break;
        case "neg":
          this.genE(e.e, "A");
          this.emit({ m: "neg" });
          if (dst === "B") this.emit({ m: "movBA" });
          break;
        case "binop": {
          const t = this.allocTmp();
          this.genE(e.l, "A");
          this.emit({ m: "st", slot: t });
          this.genE(e.r, "A");
          this.emit({ m: "ld", d: "B", slot: t });
          if (["<", "<=", ">", ">=", "==", "!="].includes(e.op)) {
            this.emit({ m: "cmp" });
            const L = LBL("C");
            this.emit({ m: "movi", d: "A", v: 0 });
            this.emit({ m: "jcc", cond: e.op, label: L });
            this.emit({ m: "movi", d: "A", v: 1 });
            this.emit({ m: "label", name: L });
          } else {
            if (dst === "B") this.emit({ m: "movBA" });
            this.emit({ m: "bop", op: { "+": "add", "-": "sub", "*": "mul", "/": "div", "%": "mod" }[e.op] });
          }
          break;
        }
        case "call": {
          if (!this.fns[e.name]) throw new Err(`未定义的函数 '${e.name}'`, 0);
          const argSlots = e.args.map(a => { const t = this.allocTmp(); this.genE(a, "A"); this.emit({ m: "st", slot: t }); return t; });
          this.emit({ m: "call", fn: e.name, args: argSlots });
          if (dst === "B") this.emit({ m: "movBA" });
          break;
        }
        default: throw new Err(`不支持的表达式`, 0);
      }
    }
  }

  function compile(src) {
    const prog = new Parser(src).parseProgram();
    if (!prog.fns.some(f => f.name === "main")) throw new Err("缺少 main 函数", 0);
    // mark class var decls: scan for `ClsName id` usage -> handled by looking at init-less decls whose type token was an id
    // (our parser records int decls only; object decls use class name as type keyword-like id)
    return new Codegen(prog).compile();
  }

  g.CE = g.CE || {}; g.CE.compile = compile; g.CE.Err = Err;
})(typeof globalThis !== "undefined" ? globalThis : window);
