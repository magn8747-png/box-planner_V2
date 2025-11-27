import React, { useState, useEffect } from "react";
import { Upload, Package, Trash2, FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";

// =============================================
// Packing logic & helpers  (includes 5000 ml BIB rules)
// =============================================
function combo(
  name,
  c60 = 0,
  c250 = 0,
  c340 = 0,
  c750 = 0,
  c5000 = 0,
  onlyIfPure750 = false
) {
  return { name, c60, c250, c340, c750, c5000, onlyIfPure750 };
}

function generateAllCombos(pure750) {
  const combos = [];
  // Full single-size boxes
  combos.push(combo("10×60", 10, 0, 0, 0, 0));
  combos.push(combo("8×250", 0, 8, 0, 0, 0));
  combos.push(combo("8×340", 0, 0, 8, 0, 0));
  combos.push(combo("2×750", 0, 0, 0, 2, 0, false));
  combos.push(combo("3×5000", 0, 0, 0, 0, 3)); // BIB full box

  // BIB (5000 ml) mix rules
  combos.push(combo("2×5000 + 2×250 + 1×60", 1, 2, 0, 0, 2));
  combos.push(combo("2×5000 + 2×340", 0, 0, 2, 0, 2));
  combos.push(combo("1×5000 + 1×750 + 1×250", 0, 1, 0, 1, 1));
  combos.push(combo("1×5000 + 1×750 + 2×60", 2, 0, 0, 1, 1));
  combos.push(combo("1×5000 + 4×250 + 1×60", 1, 4, 0, 0, 1));
  combos.push(combo("1×5000 + 4×340 + 1×60", 1, 0, 4, 0, 1));

  // Existing mixed patterns (no 5000 unless explicitly above)
  for (let a60 = 0; a60 <= 2; a60++) {
    for (let a250 = 0; a250 <= 2 - a60; a250++) {
      const a340 = 2 - a60 - a250;
      if (a60 === 0 && a250 === 0 && a340 === 0) continue;
      combos.push(
        combo(
          `2×750 + (${a60}×60,${a250}×250,${a340}×340)`,
          a60,
          a250,
          a340,
          2,
          0
        )
      );
    }
  }
  for (let a250 = 0; a250 <= 5; a250++) {
    const a340 = 5 - a250;
    combos.push(combo(`1×750 + (${a250}×250,${a340}×340)`, 0, a250, a340, 1, 0));
  }
  combos.push(combo("1×750 + 8×60", 8, 0, 0, 1, 0));
  combos.push(combo("1×250 + 8×60", 8, 1, 0, 0, 0));

  // Deduplicate identical vectors (keep shortest name)
  const map = new Map();
  for (const cb of combos) {
    const key = `${cb.c60},${cb.c250},${cb.c340},${cb.c750},${cb.c5000},${cb.onlyIfPure750}`;
    if (!map.has(key) || cb.name.length < map.get(key).name.length) map.set(key, cb);
  }
  return Array.from(map.values());
}

function solveOptimal(counts) {
  const aInit = counts["60"] || 0;
  const bInit = counts["250"] || 0;
  const cInit = counts["340"] || 0;
  const dInit = counts["750"] || 0;
  const eInit = counts["5000"] || 0;

  const pure750 =
    aInit === 0 && bInit === 0 && cInit === 0 && dInit > 0 && eInit === 0;
  const combos = generateAllCombos(pure750);

  const CAP = { 60: 10, 250: 8, 340: 8, 750: 2, 5000: 3 };
  const ceilDiv = (x, m) => (x <= 0 ? 0 : Math.floor((x + m - 1) / m));
  const partialCost = (a, b, c, d, e) =>
    ceilDiv(a, CAP[60]) +
    ceilDiv(b, CAP[250]) +
    ceilDiv(c, CAP[340]) +
    ceilDiv(d, CAP[750]) +
    ceilDiv(e, CAP[5000]);

  const memo = new Map();
  const key = (a, b, c, d, e) => `${a}|${b}|${c}|${d}|${e}`;
  const better = (x, y) => {
    if (x.cost !== y.cost) return x.cost < y.cost;
    if (x.fullCount !== y.fullCount) return x.fullCount > y.fullCount;
    return (x.tailPartial ?? 0) < (y.tailPartial ?? 0);
  };

  function dp(a, b, c, d, e) {
    const k = key(a, b, c, d, e);
    if (memo.has(k)) return memo.get(k);
    let best = {
      cost: partialCost(a, b, c, d, e),
      fullCount: 0,
      tailPartial: partialCost(a, b, c, d, e),
      picks: [],
    };
    for (let i = 0; i < combos.length; i++) {
      const cb = combos[i];
      if (
        cb.c60 <= a &&
        cb.c250 <= b &&
        cb.c340 <= c &&
        cb.c750 <= d &&
        cb.c5000 <= e &&
        (!cb.onlyIfPure750 || pure750)
      ) {
        const child = dp(
          a - cb.c60,
          b - cb.c250,
          c - cb.c340,
          d - cb.c750,
          e - cb.c5000
        );
        const cand = {
          cost: child.cost + 1,
          fullCount: child.fullCount + 1,
          tailPartial: child.tailPartial,
          picks: [...child.picks, i],
        };
        if (better(cand, best)) best = cand;
      }
    }
    memo.set(k, best);
    return best;
  }

  const res = dp(aInit, bInit, cInit, dInit, eInit);

  const boxes = [];
  const pushBox = (name, c60, c250, c340, c750, c5000) =>
    boxes.push({ name, c60, c250, c340, c750, c5000, onlyIfPure750: false });

  let a = aInit,
    b = bInit,
    c = cInit,
    d = dInit,
    e = eInit;
  for (const idx of [...res.picks].reverse()) {
    const cb = combos[idx];
    pushBox(cb.name, cb.c60, cb.c250, cb.c340, cb.c750, cb.c5000);
    a -= cb.c60;
    b -= cb.c250;
    c -= cb.c340;
    d -= cb.c750;
    e -= cb.c5000;
  }

  const drain = (label, amount, cap) => {
    let x = amount;
    while (x > 0) {
      const take = Math.min(cap, x);
      if (label === "60") pushBox(`Partial box: ${take}×60`, take, 0, 0, 0, 0);
      if (label === "250") pushBox(`Partial box: ${take}×250`, 0, take, 0, 0, 0);
      if (label === "340") pushBox(`Partial box: ${take}×340`, 0, 0, take, 0, 0);
      if (label === "750") pushBox(`Partial box: ${take}×750`, 0, 0, 0, take, 0);
      if (label === "5000") pushBox(`Partial box: ${take}×5000`, 0, 0, 0, 0, take);
      x -= take;
    }
  };
  drain("60", a, CAP[60]);
  drain("250", b, CAP[250]);
  drain("340", c, CAP[340]);
  drain("750", d, CAP[750]);
  drain("5000", e, CAP[5000]);

  return {
    boxes,
    summary: {
      boxes: boxes.length,
      left_60: 0,
      left_250: 0,
      left_340: 0,
      left_750: 0,
      left_5000: 0,
    },
  };
}

// =============================================
// Parsers
// =============================================

// Fallback-parser til gammelt format med Enhed/Navn/Antal
function parseCountsFromSheet(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  const wanted = rows.filter(
    (r) => String(r.Enhed || "").toLowerCase().trim() === "kolli"
  );
  const sizeFromName = (name) => {
    const m = String(name || "").match(/(60|250|340|750|5000)\s*ml/i);
    return m ? m[1] : null;
  };
  const counts = { "60": 0, "250": 0, "340": 0, "750": 0, "5000": 0 };
  for (const r of wanted) {
    const ml = sizeFromName(r.Navn);
    if (!ml) continue;
    const antal = Number(r.Antal || 0);
    counts[ml] = (counts[ml] || 0) + (isFinite(antal) ? antal : 0);
  }
  return counts;
}

// NY: Parser til ordreliste med flere kunder
//  - A (index 0): Leveringsdato
//  - B (index 1): Kundenavn
//  - C (index 2): Ordrelinje produktnavn
//  - E (index 4): Ordrelinje antal
function parseCustomersFromSheet(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  const sizeFromName = (name) => {
    const m = String(name || "").match(/(60|250|340|750|5000)\s*ml/i);
    return m ? m[1] : null;
  };

  const byCustomer = new Map();

  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const rawDate = row[0]; // kolonne A
    let dateStr = "";
    if (rawDate instanceof Date) {
      dateStr = rawDate.toLocaleDateString("da-DK");
    } else if (
      typeof rawDate === "number" &&
      XLSX.SSF &&
      typeof XLSX.SSF.parse_date_code === "function"
    ) {
      try {
        const dc = XLSX.SSF.parse_date_code(rawDate);
        if (dc) {
          const jsDate = new Date(dc.y, dc.m - 1, dc.d);
          dateStr = jsDate.toLocaleDateString("da-DK");
        }
      } catch {
        dateStr = String(rawDate || "").trim();
      }
    } else {
      dateStr = String(rawDate || "").trim();
    }

    const customerName = String(row[1] || "").trim(); // kolonne B
    const productName = String(row[2] || ""); // kolonne C
    const qtyRaw = row[4]; // kolonne E

    if (!customerName) continue;

    const ml = sizeFromName(productName);
    if (!ml) continue;

    const qty = Number(qtyRaw || 0);
    if (!isFinite(qty) || qty <= 0) continue;

    if (!byCustomer.has(customerName)) {
      byCustomer.set(customerName, {
        customerId: customerName,
        customerName,
        counts: { "60": 0, "250": 0, "340": 0, "750": 0, "5000": 0 },
        deliveryDate: dateStr || "",
      });
    }

    const entry = byCustomer.get(customerName);
    entry.counts[ml] = (entry.counts[ml] || 0) + qty;
    if (!entry.deliveryDate && dateStr) {
      entry.deliveryDate = dateStr;
    }
  }

  return Array.from(byCustomer.values());
}

// =============================================

function prettyCounts(counts) {
  return `60ml ${counts["60"] || 0}, 250ml ${counts["250"] || 0}, 340ml ${
    counts["340"] || 0
  }, 750ml ${counts["750"] || 0}, 5000ml ${counts["5000"] || 0}`;
}

function runSelfTests() {
  const tests = [
    {
      name: "pure 3×5000",
      counts: { 5000: 3 },
      expectBoxes: 1,
      contains: ["3×5000"],
    },
    {
      name: "4×5000 → 1 full + 1 partial",
      counts: { 5000: 4 },
      expectBoxes: 2,
      contains: ["3×5000", "Partial box: 1×5000"],
    },
    {
      name: "2×5000 + 2×250 + 1×60",
      counts: { 5000: 2, 250: 2, 60: 1 },
      expectBoxes: 1,
      contains: ["2×5000 + 2×250 + 1×60"],
    },
    {
      name: "2×5000 + 2×340",
      counts: { 5000: 2, 340: 2 },
      expectBoxes: 1,
      contains: ["2×5000 + 2×340"],
    },
    {
      name: "1×5000 + 1×750 + 1×250",
      counts: { 5000: 1, 750: 1, 250: 1 },
      expectBoxes: 1,
      contains: ["1×5000 + 1×750 + 1×250"],
    },
    {
      name: "1×5000 + 1×750 + 2×60",
      counts: { 5000: 1, 750: 1, 60: 2 },
      expectBoxes: 1,
      contains: ["1×5000 + 1×750 + 2×60"],
    },
    {
      name: "1×5000 + 4×250 + 1×60",
      counts: { 5000: 1, 250: 4, 60: 1 },
      expectBoxes: 1,
      contains: ["1×5000 + 4×250 + 1×60"],
    },
    {
      name: "1×5000 + 4×340 + 1×60",
      counts: { 5000: 1, 340: 4, 60: 1 },
      expectBoxes: 1,
      contains: ["1×5000 + 4×340 + 1×60"],
    },
  ];
  let passed = 0;
  for (const t of tests) {
    const out = solveOptimal(t.counts);
    const names = out.boxes.map((b) => b.name).join(" | ");
    const okBoxes =
      typeof t.expectBoxes === "number"
        ? out.summary.boxes === t.expectBoxes
        : true;
    const okContains = (t.contains || []).every((s) => names.includes(s));
    const ok = okBoxes && okContains;
    if (ok) passed++;
    console.log(
      `${ok ? "✔" : "✘"} ${t.name} → boxes=${out.summary.boxes}; combos=[${names}]`
    );
  }
  console.log(`Self-tests: ${passed}/${tests.length} passed`);
}

// =============================================
// Print-komponent (kun til print)
// =============================================
function CustomerPrintSection({ customerName, date, counts, result, isLast }) {
  if (!result || !counts) return null;
  return (
    <div style={{ pageBreakAfter: isLast ? "auto" : "always" }}>
      <h2
        style={{
          fontSize: "18px",
          fontWeight: "bold",
          marginBottom: "4px",
        }}
      >
        Box Planner – {customerName || "Ukendt kunde"}
      </h2>
      <div
        style={{
          marginBottom: "8px",
          fontSize: "12px",
          color: "#555",
        }}
      >
        Date: {date || "-"}
      </div>
      <div
        style={{
          border: "1px solid #ddd",
          padding: "6px",
          marginBottom: "8px",
          fontSize: "12px",
        }}
      >
        {prettyCounts(counts)}
      </div>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "12px",
        }}
      >
        <thead>
          <tr>
            <th style={{ border: "1px solid #ddd", padding: "4px" }}>#</th>
            <th style={{ border: "1px solid #ddd", padding: "4px" }}>
              Combination
            </th>
            <th style={{ border: "1px solid #ddd", padding: "4px" }}>60</th>
            <th style={{ border: "1px solid #ddd", padding: "4px" }}>250</th>
            <th style={{ border: "1px solid #ddd", padding: "4px" }}>340</th>
            <th style={{ border: "1px solid #ddd", padding: "4px" }}>750</th>
            <th style={{ border: "1px solid #ddd", padding: "4px" }}>5000</th>
          </tr>
        </thead>
        <tbody>
          {result.boxes.map((b, i) => (
            <tr key={i}>
              <td
                style={{
                  border: "1px solid #ddd",
                  padding: "4px",
                  textAlign: "center",
                }}
              >
                {i + 1}
              </td>
              <td style={{ border: "1px solid #ddd", padding: "4px" }}>
                {b.name}
              </td>
              <td
                style={{
                  border: "1px solid #ddd",
                  padding: "4px",
                  textAlign: "center",
                }}
              >
                {b.c60 ?? 0}
              </td>
              <td
                style={{
                  border: "1px solid #ddd",
                  padding: "4px",
                  textAlign: "center",
                }}
              >
                {b.c250 ?? 0}
              </td>
              <td
                style={{
                  border: "1px solid #ddd",
                  padding: "4px",
                  textAlign: "center",
                }}
              >
                {b.c340 ?? 0}
              </td>
              <td
                style={{
                  border: "1px solid #ddd",
                  padding: "4px",
                  textAlign: "center",
                }}
              >
                {b.c750 ?? 0}
              </td>
              <td
                style={{
                  border: "1px solid #ddd",
                  padding: "4px",
                  textAlign: "center",
                }}
              >
                {b.c5000 ?? 0}
              </td>
            </tr>
          ))}
          {result.boxes.length === 0 && (
            <tr>
              <td
                colSpan={7}
                style={{
                  border: "1px solid #ddd",
                  padding: "4px",
                  textAlign: "center",
                  color: "#777",
                }}
              >
                No boxes – nothing to pack
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// =============================================
// React component with multi-customer support
// =============================================
export default function App() {
  const [file, setFile] = useState(null);
  const [counts, setCounts] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [customer, setCustomer] = useState("");

  const [customersData, setCustomersData] = useState([]); // [{ customerId, customerName, counts, result, deliveryDate }]
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [printAll, setPrintAll] = useState(false);
  const [displayDate, setDisplayDate] = useState("");

  const today = new Date().toLocaleDateString("da-DK");
  const effectiveDate = displayDate || today;

  useEffect(() => {
    try {
      if (import.meta?.env?.DEV) runSelfTests();
    } catch {}
  }, []);

  function handleSelectCustomer(id) {
    setSelectedCustomerId(id);
    const entry = customersData.find((c) => c.customerId === id);
    if (!entry) return;
    setCounts(entry.counts);
    setResult(entry.result);
    setCustomer(entry.customerName || entry.customerId);
    setDisplayDate(entry.deliveryDate || "");
  }

  async function handleFile(e) {
    const f = e.target.files?.[0];
    setFile(f || null);
    setError("");
    setCounts(null);
    setResult(null);
    setCustomer("");
    setCustomersData([]);
    setSelectedCustomerId("");
    setDisplayDate("");
    setPrintAll(false);

    if (!f) return;

    try {
      const data = await f.arrayBuffer();
      const wb = XLSX.read(data, {
        cellStyles: false,
        cellHTML: false,
        WTF: false,
      });

      const preferredSheetName = wb.SheetNames.includes("Ordreliste")
        ? "Ordreliste"
        : wb.SheetNames[0];
      const sheet = wb.Sheets[preferredSheetName];

      const customers = parseCustomersFromSheet(sheet);

      if (customers.length === 0) {
        const c = parseCountsFromSheet(sheet);
        setCounts(c);
        const res = solveOptimal(c);
        setResult(res);
        setDisplayDate("");
        return;
      }

      const withResults = customers.map((c) => ({
        ...c,
        result: solveOptimal(c.counts),
      }));

      setCustomersData(withResults);

      const first = withResults[0];
      if (first) {
        setSelectedCustomerId(first.customerId);
        setCounts(first.counts);
        setResult(first.result);
        setCustomer(first.customerName);
        setDisplayDate(first.deliveryDate || "");
      }
    } catch (err) {
      console.error(err);
      setError(
        "Kunne ikke læse regnearket. Tjek at fanen 'Ordreliste' og kolonnerne A (Leveringsdato), B (kundenavn), C (produktnavn) og E (antal) er udfyldt, eller brug det gamle format med 'Enhed', 'Navn' og 'Antal'."
      );
    }
  }

  function reset() {
    setFile(null);
    setCounts(null);
    setResult(null);
    setError("");
    setCustomer("");
    setCustomersData([]);
    setSelectedCustomerId("");
    setPrintAll(false);
    setDisplayDate("");
  }

  function onDownloadCSV() {
    if (!result) return;
    const rows = [
      ["Customer", customer || ""],
      ["Date", effectiveDate || ""],
      [],
      ["Box", "Combination", "60", "250", "340", "750", "5000"],
    ];
    result.boxes.forEach((b, i) =>
      rows.push([
        String(i + 1),
        b.name,
        String(b.c60 ?? 0),
        String(b.c250 ?? 0),
        String(b.c340 ?? 0),
        String(b.c750 ?? 0),
        String(b.c5000 ?? 0),
      ])
    );
    const csv = rows
      .map((r) =>
        r
          .map((cell) => String(cell).replace(/;/g, ","))
          .join(";")
      )
      .join("\n");
    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const safeName = (customer || "packing-plan").replace(
      /[^a-z0-9_-]/gi,
      "-"
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 print:bg-white">
      <div className="max-w-5xl mx-auto">
        {/* Header kun på skærm */}
        <header className="flex items-center gap-3 mb-6 print:mb-2 print:hidden">
          <Package className="w-8 h-8" />
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold">Box Planner</h1>
          </div>
        </header>

        {/* Skærmvisning */}
        <div className="bg-white rounded-2xl shadow p-6 print:shadow-none print:p-0 print:hidden">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <label className="inline-flex items-center gap-2">
              <Upload className="w-5 h-5" />
              <input
                type="file"
                accept=".xlsx"
                onChange={handleFile}
                className="block"
              />
            </label>
            {file && (
              <button
                onClick={reset}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200"
              >
                <Trash2 className="w-4 h-4" /> Clear
              </button>
            )}

            {(customersData.length > 0 || counts) && (
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-700">Customer</label>

                {customersData.length > 1 ? (
                  <select
                    value={selectedCustomerId || ""}
                    onChange={(e) => handleSelectCustomer(e.target.value)}
                    className="px-3 py-2 rounded-xl border focus:outline-none focus:ring w-72"
                  >
                    <option value="" disabled>
                      Vælg kunde…
                    </option>
                    {customersData.map((c) => (
                      <option key={c.customerId} value={c.customerId}>
                        {c.customerName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={customer}
                    onChange={(e) => setCustomer(e.target.value)}
                    placeholder="Type customer name"
                    className="px-3 py-2 rounded-xl border focus:outline-none focus:ring w-56"
                  />
                )}
              </div>
            )}

            {result && (
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={onDownloadCSV}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                  title="Download packing plan as CSV"
                >
                  ⇩ Download CSV
                </button>
                <button
                  onClick={() => {
                    setPrintAll(true);
                    setTimeout(() => window.print(), 0);
                  }}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700"
                  title="Print alle kunder"
                >
                  🖨️ Print alle kunder
                </button>
              </div>
            )}
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-xl">
              {error}
            </div>
          )}

          {counts && (
            <div className="mt-6">
              <h2 className="font-semibold mb-2 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5" /> Detected units
              </h2>
              <div className="flex items-center justify-between">
                <div className="rounded-xl border p-3 bg-gray-50">
                  {prettyCounts(counts)}
                </div>
                <div className="text-sm text-gray-600 text-right">
                  {customer && (
                    <>
                      Customer: <b>{customer}</b>
                      <br />
                    </>
                  )}
                  Date: {effectiveDate}
                </div>
              </div>
            </div>
          )}

          {result && (
            <div className="mt-8">
              <h3 className="text-lg font-semibold mb-2">Result</h3>
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="rounded-2xl border p-4 bg-gradient-to-b from-white to-gray-50">
                  <div className="text-sm text-gray-500">Total boxes</div>
                  <div className="text-3xl font-bold">
                    {result.summary.boxes}
                  </div>
                </div>
                <div className="rounded-2xl border p-4 bg-gradient-to-b from-white to-gray-50">
                  <div className="text-sm text-gray-500">Customer</div>
                  <div className="mt-1 text-base">
                    {customer || <span className="text-gray-400">—</span>}
                  </div>
                </div>
                <div className="rounded-2xl border p-4 bg-gradient-to-b from-white to-gray-50">
                  <div className="text-sm text-gray-500">Date</div>
                  <div className="mt-1 text-base">{effectiveDate}</div>
                </div>
              </div>

              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full border rounded-xl overflow-hidden">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="p-2 border">#</th>
                      <th className="p-2 border">Combination</th>
                      <th className="p-2 border">60</th>
                      <th className="p-2 border">250</th>
                      <th className="p-2 border">340</th>
                      <th className="p-2 border">750</th>
                      <th className="p-2 border">5000</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.boxes.map((b, i) => (
                      <tr key={i} className="odd:bg-white even:bg-gray-50">
                        <td className="border p-2 text-center">{i + 1}</td>
                        <td className="border p-2">{b.name}</td>
                        <td className="border p-2 text-center">{b.c60 ?? 0}</td>
                        <td className="border p-2 text-center">{b.c250 ?? 0}</td>
                        <td className="border p-2 text-center">{b.c340 ?? 0}</td>
                        <td className="border p-2 text-center">{b.c750 ?? 0}</td>
                        <td className="border p-2 text-center">{b.c5000 ?? 0}</td>
                      </tr>
                    ))}
                    {result.boxes.length === 0 && (
                      <tr>
                        <td
                          colSpan={7}
                          className="p-4 text-center text-gray-500"
                        >
                          No boxes – nothing to pack
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Print-layout (kun ved print) */}
        {printAll && (
          <div className="hidden print:block">
            {customersData.length > 0
              ? customersData.map((c, idx) => (
                  <CustomerPrintSection
                    key={c.customerId}
                    customerName={c.customerName}
                    date={c.deliveryDate || today}
                    counts={c.counts}
                    result={c.result}
                    isLast={idx === customersData.length - 1}
                  />
                ))
              : (
                <CustomerPrintSection
                  customerName={customer}
                  date={effectiveDate}
                  counts={counts}
                  result={result}
                  isLast={true}
                />
              )}
          </div>
        )}
      </div>
    </div>
  );
}
