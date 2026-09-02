import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Plus, Check, X, Clock, Pause, Play, Trash2, RotateCcw, Sparkles, Pencil, Undo2, Search, Download, Upload, Settings, Layers } from "lucide-react";

// ---------- constants ----------

const CATEGORIES = [
  "Streaming",
  "Music",
  "Software",
  "Fitness",
  "News & media",
  "Cloud & storage",
  "Gaming",
  "Other",
];

const CYCLES = [
  { id: "monthly", label: "Monthly", days: 30 },
  { id: "yearly", label: "Yearly", days: 365 },
  { id: "weekly", label: "Weekly", days: 7 },
];

const DEFAULT_SETTINGS = { unusedDays: 90, priceThreshold: 500, dismissedOverlaps: [] };
const STORAGE_KEY = "ledger:subscriptions";
const SETTINGS_KEY = "ledger:settings";

const AVATAR_COLORS = ["#8B5CF6", "#2DD4BF", "#FB7185", "#FBBF24", "#60A5FA"];

// ---------- helpers ----------


const uid = () => Math.random().toString(36).slice(2, 10);
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

const monthlyEquivalent = (sub) => {
  if (sub.billingCycle === "yearly") return sub.cost / 12;
  if (sub.billingCycle === "weekly") return sub.cost * 4.345;
  return sub.cost;
};

const yourShare = (sub) => monthlyEquivalent(sub) / (sub.sharedCount || 1);

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const formatMoney = (n) => inrFormatter.format(n);

const formatRelative = (dateStr) => {
  if (!dateStr) return "never";
  const d = daysBetween(dateStr, todayISO());
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d} days ago`;
  const months = Math.round(d / 30);
  if (months < 12) return `${months} mo ago`;
  const years = Math.round(months / 12);
  return `${years} yr ago`;
};

const lastActivityDate = (sub) => {
  const dates = [...sub.usageLogs];
  if (sub.nudgeAckAt) dates.push(sub.nudgeAckAt);
  if (!dates.length) return sub.createdAt;
  return dates.sort().slice(-1)[0];
};

const usageCountInWindow = (sub, windowDays) => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);
  return sub.usageLogs.filter((d) => new Date(d) >= cutoff).length;
};

const costPerUse = (sub) => {
  const count = usageCountInWindow(sub, 90);
  if (count === 0) return Infinity;
  const cost90 = yourShare(sub) * 3;
  return cost90 / count;
};

const getNextRenewal = (sub) => {
  const cycle = CYCLES.find((c) => c.id === sub.billingCycle) || CYCLES[0];
  let next = new Date(sub.nextBillingDate);
  const today = new Date();
  let guard = 0;
  while (next < today && guard < 1000) {
    next.setDate(next.getDate() + cycle.days);
    guard++;
  }
  return next.toISOString().slice(0, 10);
};

const computeNudge = (sub, settings) => {
  if (sub.status !== "active") return null;
  const today = todayISO();
  if (sub.snoozeUntil && sub.snoozeUntil > today) return null;

  const lastActive = lastActivityDate(sub);
  const idleDays = daysBetween(lastActive, today);
  const cpu = costPerUse(sub);

  if (idleDays >= settings.unusedDays) {
    return { reason: "unused", metric: idleDays, label: `${formatRelative(lastActive)}` };
  }
  if (cpu !== Infinity && cpu >= settings.priceThreshold) {
    return { reason: "pricey", metric: cpu, label: `${formatMoney(cpu)} per use` };
  }
  return null;
};

const avatarColor = (name) => {
  const sum = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
};

const TREND_MONTHS = 6;

const monthEndDate = (monthsAgo) => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - monthsAgo + 1, 0);
};

const computeTrend = (subs) => {
  const months = [];
  for (let i = TREND_MONTHS - 1; i >= 0; i--) {
    const end = monthEndDate(i);
    const endStr = end.toISOString().slice(0, 10);
    const total = subs.reduce((sum, s) => {
      if (s.createdAt > endStr) return sum;
      if (s.cancelledAt && s.cancelledAt <= endStr) return sum;
      return sum + yourShare(s);
    }, 0);
    months.push({ label: end.toLocaleDateString("en-IN", { month: "short" }), value: total });
  }
  return months;
};

const seedData = () => {
  const today = new Date();
  const daysAgo = (n) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  };
  const monthsAgo = (n) => daysAgo(n * 30);

  return [
    {
      id: uid(), name: "Netflix", category: "Streaming", cost: 199,
      billingCycle: "monthly", nextBillingDate: daysAgo(-12), status: "active",
      createdAt: monthsAgo(14), usageLogs: [daysAgo(2), daysAgo(9), daysAgo(16)],
      nudgeAckAt: null, snoozeUntil: null, cancelledAt: null, sharedCount: 4,
    },
    {
      id: uid(), name: "Disney+ Hotstar", category: "Streaming", cost: 299,
      billingCycle: "yearly", nextBillingDate: daysAgo(-3), status: "active",
      createdAt: monthsAgo(18), usageLogs: [monthsAgo(4)],
      nudgeAckAt: null, snoozeUntil: null, cancelledAt: null, sharedCount: 1,
    },
    {
      id: uid(), name: "Spotify", category: "Music", cost: 119,
      billingCycle: "monthly", nextBillingDate: daysAgo(-20), status: "active",
      createdAt: monthsAgo(30), usageLogs: [daysAgo(0), daysAgo(1), daysAgo(2), daysAgo(4), daysAgo(6), daysAgo(8)],
      nudgeAckAt: null, snoozeUntil: null, cancelledAt: null, sharedCount: 2,
    },
    {
      id: uid(), name: "Figma", category: "Software", cost: 11500, billingCycle: "yearly",
      nextBillingDate: daysAgo(-140), status: "active", createdAt: monthsAgo(9),
      usageLogs: [daysAgo(5)], nudgeAckAt: null, snoozeUntil: null, cancelledAt: null, sharedCount: 1,
    },
    {
      id: uid(), name: "Cult.fit", category: "Fitness", cost: 999,
      billingCycle: "monthly", nextBillingDate: daysAgo(-8), status: "active",
      createdAt: monthsAgo(20), usageLogs: [daysAgo(1)],
      nudgeAckAt: null, snoozeUntil: null, cancelledAt: null, sharedCount: 1,
    },
    {
      id: uid(), name: "iCloud+", category: "Cloud & storage", cost: 219,
      billingCycle: "monthly", nextBillingDate: daysAgo(-15), status: "active",
      createdAt: monthsAgo(24), usageLogs: [],
      nudgeAckAt: null, snoozeUntil: null, cancelledAt: null, sharedCount: 1,
    },
    {
      id: uid(), name: "The Ken", category: "News & media", cost: 500,
      billingCycle: "monthly", nextBillingDate: daysAgo(-25), status: "active",
      createdAt: monthsAgo(6), usageLogs: [daysAgo(3), daysAgo(10)],
      nudgeAckAt: null, snoozeUntil: null, cancelledAt: null, sharedCount: 1,
    },
  ];
};

// ---------- small UI atoms ----------

// ---------- accessibility: focus trap + escape-to-close for modals ----------

function useModalA11y(isOpen, onClose) {
  const containerRef = useRef(null);
  const previouslyFocused = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    previouslyFocused.current = document.activeElement;

    const getFocusable = () => {
      const container = containerRef.current;
      if (!container) return [];
      return Array.from(
        container.querySelectorAll('input, select, textarea, button, a[href], [tabindex]:not([tabindex="-1"])')
      ).filter((el) => !el.disabled && el.offsetParent !== null);
    };

    const raf = requestAnimationFrame(() => {
      const items = getFocusable();
      if (items.length) items[0].focus();
    });

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key === "Tab") {
        const items = getFocusable();
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", handleKeyDown, true);
      if (previouslyFocused.current && typeof previouslyFocused.current.focus === "function") {
        previouslyFocused.current.focus();
      }
    };
  }, [isOpen]);

  return containerRef;
}

function IconButton({ onClick, title, children, tone = "violet" }) {
  const colorMap = { violet: "var(--text)", rust: "var(--coral)" };
  return (
    <button
      onClick={onClick}
      title={title}
      className="icon-btn"
      style={{ color: colorMap[tone] || colorMap.violet }}
    >
      {children}
    </button>
  );
}

function TrendChart({ data }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const w = 640, h = 150, padX = 10, padY = 16;
  const max = Math.max(...data.map((d) => d.value), 1);
  const stepX = (w - padX * 2) / (data.length - 1 || 1);
  const points = data.map((d, i) => {
    const x = padX + i * stepX;
    const y = padY + (1 - d.value / max) * (h - padY * 2);
    return { x, y, ...d };
  });
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x},${h - padY} L${points[0].x},${h - padY} Z`;

  const tooltipW = 84, tooltipH = 36;
  const active = hoverIdx !== null ? points[hoverIdx] : null;
  const tooltipX = active ? Math.min(Math.max(active.x, tooltipW / 2 + 2), w - tooltipW / 2 - 2) : 0;
  const tooltipAboveY = active ? Math.max(active.y - tooltipH - 10, 2) : 0;

  return (
    <svg viewBox={`0 0 ${w} ${h + 22}`} width="100%" height={h + 22} preserveAspectRatio="none">
      <defs>
        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="trendLine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#2DD4BF" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#trendFill)" />
      <path d={linePath} fill="none" stroke="url(#trendLine)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {hoverIdx !== null && (
        <line x1={points[hoverIdx].x} y1={padY} x2={points[hoverIdx].x} y2={h - padY} stroke="rgba(245,243,255,0.25)" strokeWidth="1" />
      )}
      {points.map((p, i) => (
        <g
          key={i}
          onMouseEnter={() => setHoverIdx(i)}
          onMouseLeave={() => setHoverIdx(null)}
          onClick={() => setHoverIdx(hoverIdx === i ? null : i)}
          style={{ cursor: "pointer" }}
        >
          <circle cx={p.x} cy={p.y} r="16" fill="transparent" />
          <circle
            cx={p.x} cy={p.y} r={hoverIdx === i ? 5.5 : 3.5}
            fill={hoverIdx === i ? "#2DD4BF" : "#F5F3FF"}
          />
        </g>
      ))}
      {points.map((p, i) => (
        <text key={i} x={p.x} y={h + 16} textAnchor="middle" fontSize="11" fill="#A9A3C9" fontFamily="Inter, sans-serif">
          {p.label}
        </text>
      ))}
      {active && (
        <g>
          <rect
            x={tooltipX - tooltipW / 2} y={tooltipAboveY} width={tooltipW} height={tooltipH} rx="8"
            fill="#231A4D" stroke="rgba(255,255,255,0.15)"
          />
          <text x={tooltipX} y={tooltipAboveY + 15} textAnchor="middle" fontSize="10.5" fill="#A9A3C9" fontFamily="Inter, sans-serif">
            {active.label}
          </text>
          <text x={tooltipX} y={tooltipAboveY + 28} textAnchor="middle" fontSize="13" fontWeight="700" fill="#F5F3FF" fontFamily="Inter, sans-serif">
            {formatMoney(active.value)}
          </text>
        </g>
      )}
    </svg>
  );
}

// ---------- main component ----------

export default function LedgerApp() {
  const [subs, setSubs] = useState(null);
  const [saveError, setSaveError] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: "", category: CATEGORIES[0], cost: "", billingCycle: "monthly", sharedCount: "1" });
  const [formError, setFormError] = useState("");
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("All");
  const [sortBy, setSortBy] = useState("cost");
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState({ unusedDays: "90", priceThreshold: "500" });
  const [exportOpen, setExportOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const [heroView, setHeroView] = useState("month");
  const fileInputRef = useRef(null);

  useEffect(() => () => { if (pendingDelete) clearTimeout(pendingDelete.timeoutId); }, [pendingDelete]);

  useEffect(() => {
    (async () => {
      try {
        const result = await window.storage.get(STORAGE_KEY, false);
        setSubs(result ? JSON.parse(result.value) : []);
      } catch (e) {
        setSubs([]);
      }
      try {
        const settingsResult = await window.storage.get(SETTINGS_KEY, false);
        if (settingsResult) {
          const loaded = { ...DEFAULT_SETTINGS, ...JSON.parse(settingsResult.value) };
          setSettings(loaded);
        }
      } catch (e) {
        // keep defaults
      }
    })();
  }, []);

  const persistSettings = useCallback(async (next) => {
    setSettings(next);
    try {
      await window.storage.set(SETTINGS_KEY, JSON.stringify(next), false);
    } catch (e) {
      // non-fatal — settings just won't survive a reload
    }
  }, []);

  const persist = useCallback(async (next) => {
    setSubs(next);
    try {
      const result = await window.storage.set(STORAGE_KEY, JSON.stringify(next), false);
      setSaveError(!result);
    } catch (e) {
      setSaveError(true);
    }
  }, []);

  const update = (id, patch) => persist(subs.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const logUsage = (id) => {
    const t = todayISO();
    update(id, { usageLogs: [...subs.find((s) => s.id === id).usageLogs.filter((d) => d !== t), t] });
  };

  const acknowledge = (id) => update(id, { nudgeAckAt: todayISO(), snoozeUntil: null });
  const snooze = (id, weeks) => {
    const d = new Date();
    d.setDate(d.getDate() + weeks * 7);
    update(id, { snoozeUntil: d.toISOString().slice(0, 10) });
  };
  const cancelSub = (id) => update(id, { status: "cancelled", cancelledAt: todayISO() });
  const togglePause = (id) => {
    const sub = subs.find((s) => s.id === id);
    update(id, { status: sub.status === "paused" ? "active" : "paused" });
  };
  const removeSub = (id) => {
    const index = subs.findIndex((s) => s.id === id);
    if (index === -1) return;
    const sub = subs[index];
    if (pendingDelete) clearTimeout(pendingDelete.timeoutId);
    persist(subs.filter((s) => s.id !== id));
    const timeoutId = setTimeout(() => setPendingDelete(null), 6000);
    setPendingDelete({ sub, index, timeoutId });
  };
  const undoDelete = () => {
    if (!pendingDelete) return;
    clearTimeout(pendingDelete.timeoutId);
    const restored = [...subs];
    restored.splice(Math.min(pendingDelete.index, restored.length), 0, pendingDelete.sub);
    persist(restored);
    setPendingDelete(null);
  };

  const loadExample = () => persist(seedData());
  const resetAll = () => { persist([]); setConfirmClearOpen(false); };

  const defaultForm = { name: "", category: CATEGORIES[0], cost: "", billingCycle: "monthly", sharedCount: "1" };
  const openAdd = () => { setEditingId(null); setForm(defaultForm); setFormError(""); setAddOpen(true); };
  const openEdit = (sub) => {
    setEditingId(sub.id);
    setForm({ name: sub.name, category: sub.category, cost: String(sub.cost), billingCycle: sub.billingCycle, sharedCount: String(sub.sharedCount || 1) });
    setFormError("");
    setAddOpen(true);
  };
  const closeForm = () => { setAddOpen(false); setEditingId(null); setForm(defaultForm); setFormError(""); };

  const submitAdd = () => {
    if (!form.name.trim()) { setFormError("Give the subscription a name."); return; }
    const parsedCost = parseFloat(form.cost);
    if (!form.cost || isNaN(parsedCost) || parsedCost <= 0) { setFormError("Enter a cost greater than ₹0."); return; }
    setFormError("");
    const sharedCount = Math.max(1, parseInt(form.sharedCount, 10) || 1);
    if (editingId) {
      update(editingId, {
        name: form.name.trim(), category: form.category,
        cost: parsedCost, billingCycle: form.billingCycle, sharedCount,
      });
    } else {
      const next = {
        id: uid(), name: form.name.trim(), category: form.category,
        cost: parsedCost, billingCycle: form.billingCycle, sharedCount,
        nextBillingDate: todayISO(), status: "active", createdAt: todayISO(),
        usageLogs: [], nudgeAckAt: null, snoozeUntil: null, cancelledAt: null,
      };
      persist([...subs, next]);
    }
    closeForm();
  };
  const handleFormKeyDown = (e) => {
    if (e.key === "Enter" && e.target.tagName !== "SELECT") {
      e.preventDefault();
      submitAdd();
    }
  };

  const openSettings = () => {
    setSettingsDraft({ unusedDays: String(settings.unusedDays), priceThreshold: String(settings.priceThreshold) });
    setSettingsOpen(true);
  };
  const saveSettings = () => {
    const unusedDays = Math.max(1, parseInt(settingsDraft.unusedDays, 10) || DEFAULT_SETTINGS.unusedDays);
    const priceThreshold = Math.max(1, parseFloat(settingsDraft.priceThreshold) || DEFAULT_SETTINGS.priceThreshold);
    persistSettings({ ...settings, unusedDays, priceThreshold });
    setSettingsOpen(false);
  };

  const exportJSON = () => JSON.stringify(subs || [], null, 2);
  const downloadExport = () => {
    try {
      const blob = new Blob([exportJSON()], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `subscriptions-${todayISO()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setCopyStatus("Download isn't available here — use Copy instead.");
      setTimeout(() => setCopyStatus(""), 3000);
    }
  };
  const copyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportJSON());
      setCopyStatus("Copied to clipboard.");
    } catch (e) {
      setCopyStatus("Couldn't copy — select the text and copy manually.");
    }
    setTimeout(() => setCopyStatus(""), 3000);
  };

  const openImport = () => { setImportText(""); setImportError(""); setImportOpen(true); };
  const handleFileChosen = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImportText(String(reader.result || ""));
    reader.readAsText(file);
  };
  const runImport = () => {
    let parsed;
    try {
      parsed = JSON.parse(importText);
    } catch (e) {
      setImportError("That isn't valid JSON. Paste the exported text exactly, or choose the file.");
      return;
    }
    if (!Array.isArray(parsed)) {
      setImportError("Expected a list of subscriptions — this file looks different.");
      return;
    }
    const cleaned = parsed.map((s) => ({
      id: typeof s.id === "string" && s.id ? s.id : uid(),
      name: String(s.name || "Untitled"),
      category: CATEGORIES.includes(s.category) ? s.category : "Other",
      cost: Number(s.cost) || 0,
      billingCycle: CYCLES.some((c) => c.id === s.billingCycle) ? s.billingCycle : "monthly",
      nextBillingDate: s.nextBillingDate || todayISO(),
      status: ["active", "paused", "cancelled"].includes(s.status) ? s.status : "active",
      createdAt: s.createdAt || todayISO(),
      usageLogs: Array.isArray(s.usageLogs) ? s.usageLogs : [],
      nudgeAckAt: s.nudgeAckAt || null,
      snoozeUntil: s.snoozeUntil || null,
      cancelledAt: s.cancelledAt || null,
      sharedCount: Math.max(1, Number(s.sharedCount) || 1),
    }));
    persist(cleaned);
    setImportOpen(false);
    setImportText("");
    setImportError("");
  };

  const active = useMemo(() => (subs || []).filter((s) => s.status === "active"), [subs]);
  const totalMonthly = useMemo(() => active.reduce((sum, s) => sum + yourShare(s), 0), [active]);
  const trend = useMemo(() => computeTrend(subs || []), [subs]);
  const monthDelta = useMemo(() => {
    if (trend.length < 2) return null;
    return trend[trend.length - 1].value - trend[trend.length - 2].value;
  }, [trend]);
  const heroValue = heroView === "year" ? totalMonthly * 12 : totalMonthly;

  const nudges = useMemo(() => {
    return active
      .map((s) => ({ sub: s, nudge: computeNudge(s, settings) }))
      .filter((x) => x.nudge)
      .sort((a, b) => {
        if (a.nudge.reason !== b.nudge.reason) return a.nudge.reason === "unused" ? -1 : 1;
        return b.nudge.metric - a.nudge.metric;
      });
  }, [active, settings]);

  const overlaps = useMemo(() => {
    const map = {};
    active.forEach((s) => { (map[s.category] = map[s.category] || []).push(s); });
    return Object.entries(map)
      .filter(([cat, list]) => list.length >= 2 && !settings.dismissedOverlaps.includes(cat))
      .map(([cat, list]) => ({
        category: cat,
        subs: list,
        total: list.reduce((sum, s) => sum + yourShare(s), 0),
      }));
  }, [active, settings.dismissedOverlaps]);

  const dismissOverlap = (cat) => {
    persistSettings({ ...settings, dismissedOverlaps: [...settings.dismissedOverlaps, cat] });
  };

  const categoryTotals = useMemo(() => {
    const map = {};
    active.forEach((s) => { map[s.category] = (map[s.category] || 0) + yourShare(s); });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [active]);

  const maxCategory = categoryTotals.length ? categoryTotals[0][1] : 1;

  const upcoming = useMemo(() => {
    return active
      .map((s) => ({ sub: s, next: getNextRenewal(s) }))
      .filter((x) => daysBetween(todayISO(), x.next) <= 7)
      .sort((a, b) => (a.next > b.next ? 1 : -1));
  }, [active]);

  const allFilteredSorted = useMemo(() => {
    let list = [...(subs || [])];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q));
    }
    if (filterCategory !== "All") {
      list = list.filter((s) => s.category === filterCategory);
    }
    list.sort((a, b) => {
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "lastUsed") return new Date(lastActivityDate(b)) - new Date(lastActivityDate(a));
      return yourShare(b) - yourShare(a);
    });
    return list;
  }, [subs, search, filterCategory, sortBy]);

  const formModalRef = useModalA11y(addOpen, closeForm);
  const clearModalRef = useModalA11y(confirmClearOpen, () => setConfirmClearOpen(false));
  const settingsModalRef = useModalA11y(settingsOpen, () => setSettingsOpen(false));
  const exportModalRef = useModalA11y(exportOpen, () => setExportOpen(false));
  const importModalRef = useModalA11y(importOpen, () => setImportOpen(false));

  if (subs === null) {
    return (
      <div className="ledger-root" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
        <GlobalStyle />
        <span style={{ color: "var(--text-soft)", fontFamily: "'Inter', sans-serif" }}>Loading your dashboard…</span>
      </div>
    );
  }

  return (
    <div className="ledger-root">
      <GlobalStyle />
      <div className="glow-orb" aria-hidden="true" />

      <div className="shell">

        {/* header */}
        <div className="top-row">
          <div className="brand">
            <span className="brand-dot" />
            Subly
          </div>
          <div className="toolbar">
            {subs.length > 0 && (
              <div className="badges">
                <span className="badge">{active.length} active</span>
                {nudges.length > 0 && <span className="badge badge-alert">{nudges.length} flagged</span>}
              </div>
            )}
            <IconButton title="Nudge settings" onClick={openSettings}><Settings size={15} /></IconButton>
            <IconButton title="Export data" onClick={() => setExportOpen(true)}><Download size={15} /></IconButton>
            <IconButton title="Import data" onClick={openImport}><Upload size={15} /></IconButton>
          </div>
        </div>

        <div className="hero">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div className="hero-label">{heroView === "year" ? "This Year, Across All Your Subscriptions (Est.)" : "This Month, Across All Your Subscriptions"}</div>
              <div className="hero-number">{formatMoney(heroValue)}</div>
              {heroView === "month" && monthDelta !== null && (
                <div className={`hero-delta ${monthDelta > 0 ? "delta-up" : "delta-down"}`}>
                  {monthDelta === 0 ? "No change" : `${monthDelta > 0 ? "+" : "−"}${formatMoney(Math.abs(monthDelta))}`} vs last month
                </div>
              )}
            </div>
            <div className="view-toggle">
              <button className={heroView === "month" ? "toggle-btn active" : "toggle-btn"} onClick={() => setHeroView("month")}>Month</button>
              <button className={heroView === "year" ? "toggle-btn active" : "toggle-btn"} onClick={() => setHeroView("year")}>Year</button>
            </div>
          </div>
        </div>

        {saveError && (
          <div style={{ marginTop: 12, fontFamily: "'Inter', sans-serif", fontSize: 13, color: "var(--coral)" }}>
            Changes aren't saving right now — your edits will hold for this session.
          </div>
        )}

        {subs.length === 0 && (
          <div className="panel empty-panel">
            <Sparkles size={22} color="var(--violet)" style={{ marginBottom: 12 }} />
            <p className="empty-title">Nothing Tracked Yet</p>
            <p className="empty-sub">Add your subscriptions one by one, or load a few examples to see how it works.</p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button onClick={openAdd} className="btn-primary">Add a subscription</button>
              <button onClick={loadExample} className="btn-ghost">Load example data</button>
            </div>
          </div>
        )}

        {nudges.length > 0 && (
          <section className="section">
            <div className="section-label">Worth a Look</div>
            <div className="nudge-list">
              {nudges.map(({ sub, nudge }) => (
                <div key={sub.id} className={`nudge-card ${nudge.reason === "unused" ? "nudge-unused" : "nudge-pricey"}`}>
                  <div className="avatar" style={{ background: avatarColor(sub.name) }}>{sub.name[0]}</div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="row-name">{sub.name}</div>
                    <div className="row-sub">
                      {nudge.reason === "unused" ? `Idle — last activity ${nudge.label}` : `${nudge.label} lately`}
                      {" · "}{formatMoney(yourShare(sub))}/mo
                    </div>
                  </div>
                  <div className="row-actions">
                    <IconButton title="Still using it" onClick={() => acknowledge(sub.id)}><Check size={15} /></IconButton>
                    <IconButton title="Remind me in a month" onClick={() => snooze(sub.id, 4)}><Clock size={15} /></IconButton>
                    <IconButton title="Cancel it" tone="rust" onClick={() => cancelSub(sub.id)}><X size={15} /></IconButton>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {overlaps.length > 0 && (
          <section className="section">
            <div className="section-label">Possible Overlaps</div>
            <div className="nudge-list">
              {overlaps.map(({ category, subs: list, total }) => (
                <div key={category} className="nudge-card nudge-overlap">
                  <div className="avatar" style={{ background: "#60A5FA" }}><Layers size={16} color="#10091F" /></div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="row-name">{category}</div>
                    <div className="row-sub">
                      {list.map((s) => s.name).join(", ")} {" · "}{formatMoney(total)}/mo combined
                    </div>
                  </div>
                  <div className="row-actions">
                    <IconButton title="Dismiss" onClick={() => dismissOverlap(category)}><X size={15} /></IconButton>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {categoryTotals.length > 0 && (
          <section className="section">
            <div className="section-label">Spend by Category</div>
            <div className="panel">
              {categoryTotals.map(([cat, amt]) => (
                <div key={cat} className="cat-row">
                  <div className="cat-name">{cat}</div>
                  <div className="cat-track">
                    <div className="cat-fill" style={{ width: `${(amt / maxCategory) * 100}%` }} />
                  </div>
                  <div className="cat-amt">{formatMoney(amt)}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {subs.length > 0 && (
          <section className="section">
            <div className="section-label">Spend Trend</div>
            <div className="panel trend-panel">
              <TrendChart data={trend} />
            </div>
          </section>
        )}

        {upcoming.length > 0 && (
          <section className="section">
            <div className="section-label">Renewing This Week</div>
            <div className="pill-row">
              {upcoming.map(({ sub, next }) => (
                <div key={sub.id} className="renewal-pill">
                  <span>{sub.name}</span>
                  <span className="renewal-when">
                    {daysBetween(todayISO(), next) === 0 ? "today" : `${daysBetween(todayISO(), next)}d`} · {formatMoney(sub.cost)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {subs.length > 0 && (
          <section className="section">
            <div className="section-label">All Subscriptions</div>

            <div className="filter-row">
              <div className="search-wrap">
                <Search size={14} color="var(--text-soft)" />
                <input
                  className="input search-input"
                  placeholder="Search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <select className="input" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
                <option value="All">All categories</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select className="input" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="cost">Sort: cost</option>
                <option value="name">Sort: name</option>
                <option value="lastUsed">Sort: last used</option>
              </select>
            </div>

            {allFilteredSorted.length === 0 ? (
              <div className="panel" style={{ color: "var(--text-soft)", fontSize: 14 }}>No subscriptions match that search.</div>
            ) : (
              <div className="panel list-panel">
                {allFilteredSorted.map((sub) => (
                  <div className={`sub-row ${sub.status !== "active" ? "sub-row-inactive" : ""}`} key={sub.id}>
                    <div className="avatar" style={{ background: avatarColor(sub.name) }}>{sub.name[0]}</div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="row-name">
                        {sub.name}
                        {sub.status === "paused" && <span className="status-tag">paused</span>}
                        {sub.status === "cancelled" && <span className="status-tag">cancelled</span>}
                      </div>
                      <div className="row-sub">
                        <span className="cat-pill">{sub.category}</span>
                        {sub.sharedCount > 1 && <span className="shared-pill">Split ×{sub.sharedCount}</span>}
                        {"  ·  used " + formatRelative(lastActivityDate(sub))}
                      </div>
                    </div>
                    <div className="row-amt">
                      {formatMoney(yourShare(sub))}<span className="row-amt-unit">/mo</span>
                      {sub.sharedCount > 1 && <div className="row-amt-total">{formatMoney(monthlyEquivalent(sub))} total</div>}
                    </div>
                    <div className="row-actions">
                      {sub.status === "active" && (
                        <IconButton title="Log usage today" onClick={() => logUsage(sub.id)}><Check size={14} /></IconButton>
                      )}
                      {sub.status !== "cancelled" && (
                        <IconButton title={sub.status === "paused" ? "Resume" : "Pause"} onClick={() => togglePause(sub.id)}>
                          {sub.status === "paused" ? <Play size={14} /> : <Pause size={14} />}
                        </IconButton>
                      )}
                      <IconButton title="Edit" onClick={() => openEdit(sub)}><Pencil size={14} /></IconButton>
                      <IconButton title="Delete" tone="rust" onClick={() => removeSub(sub.id)}><Trash2 size={14} /></IconButton>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <section className="section">
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={openAdd} className="btn-primary">
              <Plus size={15} />
              <span>Add a subscription</span>
            </button>
            {subs.length > 0 && (
              <button onClick={() => setConfirmClearOpen(true)} className="btn-ghost" style={{ marginLeft: "auto" }}>
                <RotateCcw size={13} />
                <span>Clear all data</span>
              </button>
            )}
          </div>
        </section>
      </div>

      {addOpen && (
        <div className="modal-backdrop" onClick={closeForm}>
          <div ref={formModalRef} className="modal-panel form-modal" onClick={(e) => e.stopPropagation()} onKeyDown={handleFormKeyDown}>
            <div className="form-modal-head">
              <div className="modal-title" style={{ marginBottom: 0 }}>{editingId ? "Edit Subscription" : "Add a Subscription"}</div>
              <IconButton onClick={closeForm} title="Close"><X size={15} /></IconButton>
            </div>
            {formError && <div className="form-error">{formError}</div>}
            <div className="add-form-fields">
              <Field label="Name" full>
                <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" placeholder="Netflix" />
              </Field>
              <Field label="Category">
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input">
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Billing">
                <select value={form.billingCycle} onChange={(e) => setForm({ ...form, billingCycle: e.target.value })} className="input">
                  {CYCLES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </Field>
              <Field label="Cost (₹)">
                <input type="number" step="1" min="0" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} className="input" placeholder="199" />
              </Field>
              <Field label="Shared with (people)">
                <input type="number" step="1" min="1" value={form.sharedCount} onChange={(e) => setForm({ ...form, sharedCount: e.target.value })} className="input" placeholder="1" />
              </Field>
            </div>
            <div className="modal-actions">
              <button type="button" onClick={closeForm} className="btn-ghost">Cancel</button>
              <button type="button" onClick={submitAdd} className="btn-primary">{editingId ? "Save changes" : "Save"}</button>
            </div>
          </div>
        </div>
      )}

      {confirmClearOpen && (
        <div className="modal-backdrop" onClick={() => setConfirmClearOpen(false)}>
          <div ref={clearModalRef} className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Clear All Data?</div>
            <div className="modal-body">This removes every subscription and usage log you've tracked. This can't be undone.</div>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setConfirmClearOpen(false)}>Cancel</button>
              <button className="btn-danger" onClick={resetAll}>Clear everything</button>
            </div>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
          <div ref={settingsModalRef} className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="form-modal-head">
              <div className="modal-title" style={{ marginBottom: 0 }}>Nudge Settings</div>
              <IconButton onClick={() => setSettingsOpen(false)} title="Close"><X size={15} /></IconButton>
            </div>
            <div className="modal-body" style={{ marginBottom: 14 }}>Tune when a subscription gets flagged under "Worth a Look."</div>
            <div className="add-form-fields" style={{ gridTemplateColumns: "1fr" }}>
              <Field label="Flag as unused after (days)">
                <input type="number" step="1" min="1" value={settingsDraft.unusedDays} onChange={(e) => setSettingsDraft({ ...settingsDraft, unusedDays: e.target.value })} className="input" />
              </Field>
              <Field label="Flag as pricey above (₹ per use)">
                <input type="number" step="1" min="1" value={settingsDraft.priceThreshold} onChange={(e) => setSettingsDraft({ ...settingsDraft, priceThreshold: e.target.value })} className="input" />
              </Field>
            </div>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setSettingsOpen(false)}>Cancel</button>
              <button className="btn-primary" onClick={saveSettings}>Save</button>
            </div>
          </div>
        </div>
      )}

      {exportOpen && (
        <div className="modal-backdrop" onClick={() => setExportOpen(false)}>
          <div ref={exportModalRef} className="modal-panel form-modal" onClick={(e) => e.stopPropagation()}>
            <div className="form-modal-head">
              <div className="modal-title" style={{ marginBottom: 0 }}>Export Data</div>
              <IconButton onClick={() => setExportOpen(false)} title="Close"><X size={15} /></IconButton>
            </div>
            <div className="modal-body" style={{ marginBottom: 12 }}>Download a backup, or copy it to paste somewhere else.</div>
            <textarea readOnly value={exportJSON()} className="input export-textarea" onFocus={(e) => e.target.select()} />
            {copyStatus && <div className="form-error" style={{ color: "var(--teal)" }}>{copyStatus}</div>}
            <div className="modal-actions">
              <button className="btn-ghost" onClick={copyExport}>Copy to clipboard</button>
              <button className="btn-primary" onClick={downloadExport}>
                <Download size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                Download .json
              </button>
            </div>
          </div>
        </div>
      )}

      {importOpen && (
        <div className="modal-backdrop" onClick={() => setImportOpen(false)}>
          <div ref={importModalRef} className="modal-panel form-modal" onClick={(e) => e.stopPropagation()}>
            <div className="form-modal-head">
              <div className="modal-title" style={{ marginBottom: 0 }}>Import Data</div>
              <IconButton onClick={() => setImportOpen(false)} title="Close"><X size={15} /></IconButton>
            </div>
            <div className="modal-body" style={{ marginBottom: 12 }}>Paste previously exported JSON, or choose a file. This replaces everything currently tracked.</div>
            <textarea
              value={importText}
              onChange={(e) => { setImportText(e.target.value); setImportError(""); }}
              className="input export-textarea"
              placeholder="Paste exported JSON here…"
            />
            {importError && <div className="form-error">{importError}</div>}
            <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={handleFileChosen} style={{ display: "none" }} />
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => fileInputRef.current && fileInputRef.current.click()}>Choose file</button>
              <button className="btn-primary" onClick={runImport} disabled={!importText.trim()}>Import</button>
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div className="toast">
          <span>{pendingDelete.sub.name} deleted</span>
          <button className="toast-undo" onClick={undoDelete}>
            <Undo2 size={14} />
            <span>Undo</span>
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, children, full }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontFamily: "'Inter', sans-serif", fontSize: 12, color: "var(--text-soft)", gridColumn: full ? "1 / -1" : undefined }}>
      {label}
      {children}
    </label>
  );
}

function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700;800&family=Inter:wght@400;500;600;700&display=swap');

      .ledger-root {
        --bg-deep: #0F0B24;
        --bg-mid: #1B1440;
        --glass: rgba(255,255,255,0.055);
        --glass-border: rgba(255,255,255,0.10);
        --violet: #8B5CF6;
        --teal: #2DD4BF;
        --coral: #FB7185;
        --amber: #FBBF24;
        --text: #F5F3FF;
        --text-soft: #A9A3C9;

        position: relative;
        background: radial-gradient(1200px 600px at 15% -10%, #2A1F5E 0%, transparent 60%),
                    radial-gradient(900px 500px at 100% 0%, #123A3A 0%, transparent 55%),
                    var(--bg-deep);
        min-height: 100%;
        padding: clamp(16px, 4vw, 56px);
        overflow: hidden;
        font-family: 'Inter', sans-serif;
      }
      .glow-orb {
        position: absolute;
        top: -120px; right: -120px;
        width: 420px; height: 420px;
        border-radius: 50%;
        background: linear-gradient(135deg, var(--violet), var(--teal));
        opacity: 0.28;
        filter: blur(90px);
        pointer-events: none;
      }
      .shell { position: relative; max-width: 880px; margin: 0 auto; }

      .top-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 28px; flex-wrap: wrap; gap: 12px; }
      .brand { display: flex; align-items: center; gap: 8px; font-family: 'Sora', sans-serif; font-weight: 700; font-size: 17px; color: var(--text); }
      .brand-dot { width: 9px; height: 9px; border-radius: 50%; background: linear-gradient(135deg, var(--violet), var(--teal)); }
      .toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .badges { display: flex; gap: 8px; }
      .badge { font-size: 12px; font-weight: 600; padding: 5px 11px; border-radius: 999px; background: var(--glass); border: 1px solid var(--glass-border); color: var(--text-soft); }
      .badge-alert { color: var(--amber); border-color: rgba(251,191,36,0.35); }

      .hero { margin-bottom: 8px; }
      .hero-label { font-size: 13px; color: var(--text-soft); margin-bottom: 6px; }
      .hero-number {
        font-family: 'Sora', sans-serif; font-weight: 800; font-variant-numeric: tabular-nums;
        font-size: clamp(40px, 8vw, 64px); line-height: 1;
        background: linear-gradient(100deg, #FFFFFF 10%, var(--teal) 60%, var(--violet) 100%);
        -webkit-background-clip: text; background-clip: text; color: transparent;
      }
      .hero-delta { font-size: 13px; margin-top: 8px; font-weight: 600; }
      .delta-up { color: var(--coral); }
      .delta-down { color: var(--teal); }
      .view-toggle { display: flex; background: var(--glass); border: 1px solid var(--glass-border); border-radius: 10px; padding: 3px; }
      .toggle-btn {
        font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 600; padding: 6px 14px;
        border-radius: 7px; border: none; background: transparent; color: var(--text-soft); cursor: pointer;
      }
      .toggle-btn.active { background: var(--violet); color: white; }

      .section { margin-top: 30px; }
      .section-label { font-size: 13px; color: var(--text-soft); margin-bottom: 12px; font-weight: 500; }

      .panel { background: var(--glass); border: 1px solid var(--glass-border); border-radius: 20px; padding: 18px; backdrop-filter: blur(14px); }
      .empty-panel { text-align: left; padding: 32px; }
      .empty-title { font-family: 'Sora', sans-serif; font-size: 19px; color: var(--text); margin: 0 0 8px; }
      .empty-sub { font-size: 14px; color: var(--text-soft); margin: 0 0 20px; max-width: 440px; }

      .nudge-list { display: flex; flex-direction: column; gap: 10px; }
      .nudge-card {
        display: flex; align-items: center; gap: 14px;
        background: var(--glass); border: 1px solid var(--glass-border);
        border-left: 3px solid var(--coral);
        border-radius: 16px; padding: 14px 16px;
      }
      .nudge-pricey { border-left-color: var(--amber); }
      .nudge-overlap { border-left-color: #60A5FA; }

      .avatar {
        width: 38px; height: 38px; border-radius: 50%; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        font-family: 'Sora', sans-serif; font-weight: 700; font-size: 15px; color: #10091F;
      }
      .row-name { font-family: 'Sora', sans-serif; font-weight: 600; font-size: 15px; color: var(--text); }
      .row-sub { font-size: 12.5px; color: var(--text-soft); margin-top: 2px; }
      .status-tag { font-size: 11px; color: var(--text-soft); margin-left: 8px; font-weight: 400; font-family: 'Inter', sans-serif; }
      .row-actions { display: flex; gap: 6px; flex-shrink: 0; }
      .row-amt { font-variant-numeric: tabular-nums; font-weight: 700; color: var(--text); font-size: 14.5px; flex-shrink: 0; text-align: right; }
      .row-amt-unit { font-weight: 400; color: var(--text-soft); font-size: 12px; }
      .row-amt-total { font-weight: 400; color: var(--text-soft); font-size: 11px; margin-top: 2px; }
      .shared-pill {
        background: rgba(45,212,191,0.14); color: var(--teal); padding: 1px 8px; border-radius: 999px;
        font-size: 11.5px; margin-left: 6px; display: inline-block; font-weight: 600;
      }
      .trend-panel { padding: 14px 10px 6px; }

      .icon-btn {
        width: 30px; height: 30px; border-radius: 10px; border: 1px solid var(--glass-border);
        background: rgba(255,255,255,0.03); display: flex; align-items: center; justify-content: center;
        cursor: pointer; transition: background 0.15s;
      }
      .icon-btn:hover { background: rgba(255,255,255,0.10); }

      .cat-row { display: flex; align-items: center; gap: 14px; padding: 8px 0; }
      .cat-row + .cat-row { border-top: 1px solid var(--glass-border); }
      .cat-name { width: 130px; flex-shrink: 0; font-size: 13px; color: var(--text-soft); }
      .cat-track { flex: 1; height: 8px; background: rgba(255,255,255,0.06); border-radius: 999px; overflow: hidden; }
      .cat-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--violet), var(--teal)); }
      .cat-amt { width: 90px; text-align: right; flex-shrink: 0; font-variant-numeric: tabular-nums; font-weight: 600; color: var(--text); font-size: 13px; }

      .pill-row { display: flex; flex-wrap: wrap; gap: 10px; }
      .renewal-pill {
        display: flex; flex-direction: column; gap: 2px;
        background: var(--glass); border: 1px solid var(--glass-border); border-radius: 14px;
        padding: 10px 14px; font-size: 13.5px; color: var(--text); font-weight: 600;
      }
      .renewal-when { font-size: 12px; color: var(--text-soft); font-weight: 400; }

      .list-panel { display: flex; flex-direction: column; padding: 6px 18px; }
      .sub-row { display: flex; align-items: center; gap: 14px; padding: 13px 0; }
      .sub-row + .sub-row { border-top: 1px solid var(--glass-border); }
      .sub-row-inactive { opacity: 0.45; }
      .cat-pill { background: rgba(255,255,255,0.07); padding: 1px 8px; border-radius: 999px; font-size: 11.5px; }

      .cat-pill { display: inline-block; }

      .input {
        font-family: 'Inter', sans-serif; font-size: 14px; padding: 9px 12px;
        border: 1px solid var(--glass-border); border-radius: 10px;
        background: rgba(255,255,255,0.04); color: var(--text);
        width: 100%; box-sizing: border-box;
      }
      .input:focus { outline: 2px solid var(--violet); outline-offset: 1px; }
      .add-form-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 16px 0 22px; }
      .form-error { font-size: 13px; color: var(--coral); margin-top: 10px; }
      .export-textarea {
        width: 100%; height: 160px; resize: vertical; font-family: 'Inter', monospace;
        font-size: 12px; line-height: 1.5; margin-top: 4px; box-sizing: border-box;
      }

      .filter-row { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; }
      .search-wrap { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 140px;
        border: 1px solid var(--glass-border); border-radius: 10px; padding: 0 12px; background: rgba(255,255,255,0.04); }
      .search-input { border: none; background: transparent; padding: 9px 0; flex: 1; }
      .search-input:focus { outline: none; }

      .modal-backdrop {
        position: absolute; inset: 0; background: rgba(6,4,18,0.65); backdrop-filter: blur(4px);
        display: flex; align-items: center; justify-content: center; z-index: 50; padding: 20px;
        animation: fadeIn 0.18s ease-out;
      }
      .modal-panel {
        background: var(--bg-mid); border: 1px solid var(--glass-border); border-radius: 18px;
        padding: 24px; max-width: 360px; width: 100%;
        box-shadow: 0 24px 60px rgba(0,0,0,0.5);
        animation: slideUp 0.22s cubic-bezier(0.2, 0.8, 0.3, 1);
      }
      .form-modal { max-width: 420px; }
      .form-modal-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes slideUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
      .modal-title { font-family: 'Sora', sans-serif; font-weight: 700; font-size: 17px; color: var(--text); margin-bottom: 10px; }
      .modal-body { font-size: 14px; color: var(--text-soft); margin-bottom: 20px; line-height: 1.5; }
      .modal-actions { display: flex; gap: 10px; justify-content: flex-end; }
      .btn-danger {
        display: inline-flex; align-items: center; gap: 7px;
        font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 600;
        padding: 10px 18px; border-radius: 12px; border: none; cursor: pointer;
        background: var(--coral); color: #2A0E14;
      }
      .btn-danger:hover { filter: brightness(1.08); }

      .toast {
        position: absolute; left: 50%; bottom: 28px; transform: translateX(-50%);
        display: flex; align-items: center; gap: 16px;
        background: var(--bg-mid); border: 1px solid var(--glass-border); border-radius: 14px;
        padding: 12px 16px; box-shadow: 0 16px 40px rgba(0,0,0,0.45);
        font-family: 'Inter', sans-serif; font-size: 13.5px; color: var(--text); z-index: 60;
      }
      .toast-undo {
        display: inline-flex; align-items: center; gap: 6px;
        background: transparent; border: none; color: var(--teal); font-weight: 600;
        font-size: 13.5px; cursor: pointer; font-family: 'Inter', sans-serif;
      }

      .btn-primary, .btn-ghost {
        display: inline-flex; align-items: center; gap: 7px; white-space: nowrap;
        font-family: 'Inter', sans-serif; font-size: 14px;
        padding: 10px 18px; border-radius: 12px; cursor: pointer;
      }
      .btn-primary {
        font-weight: 600; border: none;
        background: linear-gradient(100deg, var(--violet), #6D4CE0); color: white;
        box-shadow: 0 8px 20px rgba(139,92,246,0.35);
      }
      .btn-primary:hover { filter: brightness(1.08); }
      .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; filter: none; }
      .btn-ghost {
        font-weight: 500; background: transparent; border: 1px solid var(--glass-border); color: var(--text);
      }
      .btn-ghost:hover { background: rgba(255,255,255,0.06); }

      @media (max-width: 560px) {
        .sub-row { flex-wrap: wrap; }
        .row-amt { order: 3; margin-left: 52px; }
        .row-actions { order: 4; margin-left: 52px; }
        .add-form-fields { grid-template-columns: 1fr; }
      }
    `}</style>
  );
}
