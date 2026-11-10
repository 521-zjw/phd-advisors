const CAT = { A: "农业", F: "食品", P: "植物", C: "作物" };

export const COUNTRIES = ["美国", "英国", "德国", "瑞士", "荷兰", "丹麦", "瑞典", "法国", "新西兰", "澳大利亚"];

const OVERVIEW_COLS = ["导师", "职称", "研究方向", "学校/研究所 · 院系", "国家", "类别", "在招状态"];
const APPLY_COLS = ["导师", "申请入口", "语言要求", "GPA 要求", "申请时间/截止", "在招状态"];
const SOURCE_COLS = ["导师", "主页", "来源", "申请要求来源", "首次收录", "最后核实"];
const RECENT_COLS = ["首次收录", "导师", "学校/研究所", "国家", "最后核实"];
const PROGRAM_COLS = ["申请入口", "语言要求", "GPA 要求", "申请时间/截止", "状态", "收录导师数"];

export function todayStr(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function cats(letters) {
  return String(letters)
    .split("")
    .map((ch) => CAT[ch] || "")
    .filter((name) => name.length > 0)
    .join("、");
}

export function safeUrl(value) {
  if (typeof value !== "string" || value.length === 0) return "";
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || url.protocol === "http:") return value;
  } catch {
    return "";
  }
  return "";
}

export function statusOf(record, programs, today) {
  const program = programs[record.p];
  if (record.x) {
    return { label: record.x, tone: "warning", open: false, date: record.add || program?.dd || "" };
  }
  if (record.ad) {
    if (record.add && record.add < today) {
      return { label: "已截止", tone: "warning", open: false, date: record.add };
    }
    return { label: "有在招岗位", tone: "success", open: true, date: record.add || "" };
  }
  if (!program) return { label: "未公布", tone: "", open: false, date: "" };
  if (program.dd) {
    if (program.dd < today) return { label: "已截止", tone: "warning", open: false, date: program.dd };
    return { label: "项目开放申请", tone: "success", open: true, date: program.dd };
  }
  if (program.o === "jobs") return { label: "岗位制·看招聘页", tone: "", open: false, date: "" };
  if (program.o === "rolling") return { label: "滚动", tone: "", open: false, date: "" };
  return { label: "未公布", tone: "", open: false, date: "" };
}

export function programStatus(program, today) {
  if (program.dd) {
    if (program.dd < today) return { label: "已截止", tone: "warning" };
    return { label: "开放申请", tone: "success" };
  }
  if (program.o === "jobs") return { label: "岗位制", tone: "" };
  if (program.o === "rolling") return { label: "滚动", tone: "" };
  return { label: "未公布", tone: "" };
}

export function filterRecords(records, programs, state, today) {
  const needle = state.q.trim().toLowerCase();
  const list = records.filter((record) => {
    if (state.country !== "全部" && record.c !== state.country) return false;
    if (state.cat !== "全部" && !cats(record.k).includes(state.cat)) return false;
    if (state.fitOnly && !record.f) return false;
    if (state.openOnly && !statusOf(record, programs, today).open) return false;
    if (needle) {
      const hay = `${record.n} ${record.r} ${record.i} ${record.d} ${record.t} ${record.c}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
  if (state.sort === "deadline") {
    const key = (record) => {
      const status = statusOf(record, programs, today);
      if (status.date && status.open) return `0-${status.date}`;
      if (status.date) return `2-${status.date}`;
      return "1-9999";
    };
    list.sort((a, b) => key(a).localeCompare(key(b)));
  } else if (state.sort === "added") {
    list.sort((a, b) => b.a.localeCompare(a.a));
  }
  return list;
}

export function recentRecords(records) {
  return records.slice().sort((a, b) => b.a.localeCompare(a.a) || a.c.localeCompare(b.c));
}

export function sortedPrograms(programs) {
  return Object.keys(programs)
    .map((key) => ({ key, program: programs[key] }))
    .sort((a, b) => (a.program.dd || "9999").localeCompare(b.program.dd || "9999"));
}

export function barRows(records) {
  const counts = new Map();
  for (const record of records) counts.set(record.c, (counts.get(record.c) || 0) + 1);
  const rows = COUNTRIES.map((country) => ({ c: country, n: counts.get(country) || 0 }));
  const extras = [...counts.keys()]
    .filter((country) => !COUNTRIES.includes(country))
    .sort((a, b) => a.localeCompare(b, "zh"));
  for (const country of extras) rows.push({ c: country, n: counts.get(country) });
  return rows;
}

function pill(status) {
  const node = document.createElement("span");
  const tone = status.tone === "success" ? "success" : status.tone === "warning" ? "warning" : "neutral";
  node.className = `pill ${tone}`;
  node.textContent = status.label;
  return node;
}

function statusCell(status) {
  const wrap = document.createElement("span");
  wrap.className = "status";
  wrap.append(pill(status));
  if (status.date) {
    const time = document.createElement("time");
    time.dateTime = status.date;
    time.textContent = status.date;
    wrap.append(time);
  }
  return wrap;
}

function nameCell(record) {
  const wrap = document.createElement("span");
  wrap.className = "person";
  const text = document.createElement("span");
  text.textContent = record.n;
  if (/[A-Za-z]/.test(record.n)) text.lang = "en";
  wrap.append(text);
  if (record.f) {
    const tag = document.createElement("span");
    tag.className = "tag-fit";
    tag.textContent = "高匹配";
    tag.title = "研究涉及小麦贮藏蛋白、面筋结构、烘焙品质、水氮与籽粒品质、谷物淀粉或蛋白质组学。";
    wrap.append(tag);
  }
  return wrap;
}

function textNode(value) {
  const span = document.createElement("span");
  span.textContent = value;
  if (/[A-Za-z]/.test(value) && !/[\u3400-\u9fff]/.test(value)) span.lang = "en";
  return span;
}

function timeNode(value) {
  const time = document.createElement("time");
  time.dateTime = value;
  time.textContent = value;
  return time;
}

function externalLink(url, label) {
  const safe = safeUrl(url);
  if (!safe) {
    const span = document.createElement("span");
    span.textContent = label;
    if (url) span.title = String(url);
    return span;
  }
  const link = document.createElement("a");
  link.setAttribute("href", safe);
  link.target = "_blank";
  link.rel = "noreferrer noopener";
  link.append(document.createTextNode(label));
  const hint = document.createElement("span");
  hint.className = "visually-hidden";
  hint.textContent = "（新窗口）";
  link.append(hint);
  return link;
}

function renderTable(host, captionText, columns, rows) {
  host.replaceChildren();
  if (rows.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "没有符合条件的记录。可以清空搜索，或关掉筛选。";
    host.append(empty);
    return;
  }
  const wrap = document.createElement("div");
  wrap.className = "table-wrap";
  const table = document.createElement("table");
  const caption = document.createElement("caption");
  caption.className = "visually-hidden";
  caption.textContent = captionText;
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const column of columns) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = column;
    headRow.append(th);
  }
  thead.append(headRow);
  const tbody = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    if (row.id) tr.dataset.id = row.id;
    if (row.state) tr.dataset.state = row.state;
    row.cells.forEach((cell, index) => {
      const td = document.createElement("td");
      td.dataset.label = columns[index];
      td.append(cell);
      tr.append(td);
    });
    tbody.append(tr);
  }
  table.append(caption, thead, tbody);
  wrap.append(table);
  host.append(wrap);
}

function rowState(status) {
  if (status.open) return "open";
  if (status.label === "已截止") return "closed";
  return "neutral";
}

function readState() {
  return {
    view: document.querySelector('input[name="view"]:checked').value,
    sort: document.querySelector('input[name="sort"]:checked').value,
    cols: document.querySelector('input[name="cols"]:checked').value,
    q: document.getElementById("q").value,
    country: document.getElementById("country").value,
    cat: document.getElementById("cat").value,
    fitOnly: document.getElementById("fit-only").checked,
    openOnly: document.getElementById("open-only").checked,
  };
}

function fillCountries(records) {
  const select = document.getElementById("country");
  const present = new Set(records.map((record) => record.c));
  const countries = COUNTRIES.filter((country) => present.has(country));
  const extras = [...present].filter((country) => !COUNTRIES.includes(country)).sort((a, b) => a.localeCompare(b, "zh"));
  select.replaceChildren();
  for (const country of ["全部", ...countries, ...extras]) {
    const option = document.createElement("option");
    option.value = country;
    option.textContent = country;
    select.append(option);
  }
}

function renderBars(records) {
  const rows = barRows(records);
  const max = Math.max(1, ...rows.map((row) => row.n));
  const list = document.createElement("ul");
  list.className = "bars";
  for (const row of rows) {
    const item = document.createElement("li");
    const label = document.createElement("span");
    label.className = "bar-label";
    label.textContent = row.c;
    const track = document.createElement("span");
    track.className = "bar-track";
    track.setAttribute("role", "img");
    track.setAttribute("aria-label", `${row.c} ${row.n} 位`);
    const fill = document.createElement("span");
    fill.className = "bar-fill";
    fill.style.width = `${(row.n / max) * 100}%`;
    track.append(fill);
    const value = document.createElement("span");
    value.className = "bar-value";
    value.textContent = `${row.n} 位`;
    item.append(label, track, value);
    list.append(item);
  }
  document.getElementById("bars").replaceChildren(list);
}

function renderStats(records, programs, log, today) {
  const fit = records.filter((record) => record.f).length;
  const open = records.filter((record) => statusOf(record, programs, today).open).length;
  const latest = log.length ? log[log.length - 1].date : "—";
  const items = [
    ["收录导师", `${records.length} 位`],
    ["高匹配", `${fit} 位`],
    ["所属项目当前开放申请", `${open} 位`],
    ["申请项目/入口", `${Object.keys(programs).length} 个`],
    ["最近一次更新", latest],
  ];
  const dl = document.getElementById("stats");
  dl.replaceChildren();
  for (const [label, value] of items) {
    const wrap = document.createElement("div");
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    wrap.append(dt, dd);
    dl.append(wrap);
  }
}

function renderLog(log) {
  const host = document.getElementById("log-list");
  host.replaceChildren();
  if (log.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "还没有更新日志。";
    host.append(empty);
    return;
  }
  const list = document.createElement("ol");
  list.className = "log";
  for (const entry of log.slice().reverse()) {
    const item = document.createElement("li");
    const time = document.createElement("time");
    time.dateTime = entry.date;
    time.textContent = entry.date;
    const title = document.createElement("h3");
    title.textContent = entry.title;
    const detail = document.createElement("p");
    detail.textContent = entry.detail;
    item.append(time, title, detail);
    list.append(item);
  }
  host.append(list);
}

function mentorRows(records, programs, cols, today) {
  return records.map((record) => {
    const program = programs[record.p];
    const status = statusOf(record, programs, today);
    let cells;
    if (cols === "apply") {
      cells = [
        nameCell(record),
        program ? externalLink(program.u, program.n) : textNode("未公布"),
        textNode(program ? program.l : "未明确"),
        textNode(program ? program.g : "未明确"),
        textNode(program ? program.d : "未公布"),
        record.ad ? externalLink(record.ad, "岗位广告") : statusCell(status),
      ];
    } else if (cols === "source") {
      cells = [
        nameCell(record),
        externalLink(record.h, "导师主页"),
        externalLink(record.s || record.h, "来源"),
        program ? externalLink(program.s, "申请要求来源") : textNode("—"),
        timeNode(record.a),
        timeNode(record.v),
      ];
    } else {
      const category = document.createElement("span");
      category.textContent = cats(record.k);
      category.title = record.k;
      cells = [
        nameCell(record),
        textNode(record.t),
        textNode(record.r),
        textNode(`${record.i} · ${record.d}`),
        textNode(record.c),
        category,
        statusCell(status),
      ];
    }
    return { id: record.id, state: rowState(status), cells };
  });
}

function renderView(data, today) {
  const state = readState();
  const filtered = filterRecords(data.records, data.programs, state, today);
  document.getElementById("filters").hidden = state.view !== "all";
  document.getElementById("count-all").textContent = String(filtered.length);
  document.getElementById("count-programs").textContent = String(Object.keys(data.programs).length);
  const meta = document.getElementById("result-meta");
  const panel = document.getElementById("panel");

  if (state.view === "recent") {
    const rows = recentRecords(data.records).map((record) => ({
      id: record.id,
      state: rowState(statusOf(record, data.programs, today)),
      cells: [timeNode(record.a), nameCell(record), textNode(record.i), textNode(record.c), timeNode(record.v)],
    }));
    meta.textContent = `共 ${data.records.length} 位，按首次收录从新到旧；同一天再按国家名排序。`;
    renderTable(panel, "最近新增", RECENT_COLS, rows);
    return;
  }

  if (state.view === "programs") {
    const counts = new Map();
    for (const record of data.records) counts.set(record.p, (counts.get(record.p) || 0) + 1);
    const rows = sortedPrograms(data.programs).map(({ key, program }) => {
      const status = programStatus(program, today);
      return {
        id: key,
        state: status.label === "已截止" ? "closed" : status.label === "开放申请" ? "open" : "neutral",
        cells: [
          externalLink(program.u, program.n),
          textNode(program.l),
          textNode(program.g),
          textNode(program.d),
          statusCell({ ...status, date: program.dd || "" }),
          textNode(String(counts.get(key) || 0)),
        ],
      };
    });
    meta.textContent = `共 ${Object.keys(data.programs).length} 个申请项目或入口，按截止日期从早到晚；没有具体日期的排在最后。已经过去的日期仍排在前面，并标成已截止。`;
    renderTable(panel, "申请项目", PROGRAM_COLS, rows);
    return;
  }

  const sortHint =
    state.sort === "deadline"
      ? "未过期且有日期的在前，没有日期的居中，已过期的在后"
      : state.sort === "added"
        ? "最近收录的在前"
        : "按数据文件中的原有顺序";
  meta.textContent = `共 ${filtered.length} 位。${sortHint}。`;
  const columns = state.cols === "apply" ? APPLY_COLS : state.cols === "source" ? SOURCE_COLS : OVERVIEW_COLS;
  const caption = state.cols === "apply" ? "申请信息" : state.cols === "source" ? "主页与来源" : "导师总表";
  renderTable(panel, caption, columns, mentorRows(filtered, data.programs, state.cols, today));
}

async function loadJson(url) {
  let response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error(String(url));
  }
  if (!response.ok) throw new Error(`${url}（HTTP ${response.status}）`);
  return response.json();
}

function boot() {
  const database = document.getElementById("database");
  const filters = document.getElementById("filters");
  filters.addEventListener("submit", (event) => event.preventDefault());

  const backTop = document.getElementById("back-top");
  window.addEventListener(
    "scroll",
    () => {
      backTop.hidden = window.scrollY < 480;
    },
    { passive: true },
  );
  backTop.addEventListener("click", () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (document.activeElement && document.activeElement.isContentEditable)) return;
    event.preventDefault();
    const search = document.getElementById("q");
    search.focus();
    search.select();
  });

  const base = document.baseURI;
  Promise.all([
    loadJson(new URL("data/programs.json", base)),
    loadJson(new URL("data/records.json", base)),
    loadJson(new URL("data/log.json", base)),
  ])
    .then(([programs, records, log]) => {
      const today = todayStr();
      const data = { programs, records, log };
      document.getElementById("as-of").textContent = `截止日期按本地日期 ${today} 判断：早于这一天显示为已截止，当天仍算开放。`;
      fillCountries(records);
      renderBars(records);
      renderStats(records, programs, log, today);
      renderLog(log);
      const render = () => renderView(data, today);
      database.addEventListener("input", render);
      document.getElementById("reset").addEventListener("click", () => {
        document.getElementById("q").value = "";
        document.getElementById("country").value = "全部";
        document.getElementById("cat").value = "全部";
        document.getElementById("fit-only").checked = false;
        document.getElementById("open-only").checked = false;
        render();
      });
      render();
      const syncStickyOffset = () => {
        const bar = document.querySelector(".view-bar");
        if (!bar) return;
        document.documentElement.style.setProperty("--view-bar-height", `${Math.ceil(bar.getBoundingClientRect().height)}px`);
      };
      syncStickyOffset();
      window.addEventListener("resize", syncStickyOffset);
      document.documentElement.dataset.ready = "true";
    })
    .catch((error) => {
      document.getElementById("as-of").textContent = "";
      const box = document.getElementById("load-error");
      box.hidden = false;
      box.textContent = `数据没有载入。请用本地 HTTP 服务打开本页（不要直接双击文件），并确认可以访问 ${error.message}。`;
    });
}

if (typeof document !== "undefined") boot();
