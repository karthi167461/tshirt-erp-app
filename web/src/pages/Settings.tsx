import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Settings as SettingsIcon,
  Plus,
  DatabaseBackup,
  Building2,
  Ruler,
  Tags,
  Palette,
  Send,
  Pencil,
  Trash2,
  Check,
  X,
  Printer,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Select,
  Button,
  Field,
  Badge,
} from "@/components/ui";
import {
  useSettings,
  useStretchingTypes,
  useBackupStatus,
  useCategories,
  useMasterColors,
  useSizes,
  useDiaSizeLinks,
} from "@/lib/data";
import { api } from "@/lib/api";
import { toastError } from "@/lib/notify";
import { PageTitle } from "@/pages/_parts";
import { PinGate } from "@/components/PinGate";
import { PrintSheet, type PrintLabel } from "@/components/PrintSheet";
import { encodeBarcode } from "@erp/shared";

function SettingsInner() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: settings } = useSettings();

  const [form, setForm] = useState({
    companyName: "",
    themeColor: "#4f46e5",
    adminPin: "",
    telegramChatId: "",
    telegramBotToken: "",
  });

  useEffect(() => {
    if (settings)
      setForm((f) => ({
        ...f,
        companyName: settings.companyName,
        themeColor: settings.themeColor,
        telegramChatId: settings.telegramChatId ?? "",
      }));
  }, [settings]);

  async function saveSettings() {
    try {
      const body: any = { ...form };
      if (!body.adminPin) delete body.adminPin; // leave PIN unchanged if blank
      if (!body.telegramBotToken) delete body.telegramBotToken; // keep token unchanged if blank
      await api.put("/api/settings", body);
      await qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success(t("toast.settingsSaved"));
    } catch (err) {
      toastError(err, t);
    }
  }

  return (
    <div className="space-y-6">
      <PageTitle icon={SettingsIcon} title={t("settings.title")} />

      {/* Company + theme + prices + pin */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {t("settings.company")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Field label={t("settings.companyName")}>
              <Input
                value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
              />
            </Field>
            <Field label={t("settings.themeColor")}>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  className="h-10 w-14 rounded-md border border-input bg-card"
                  value={form.themeColor}
                  onChange={(e) => setForm({ ...form, themeColor: e.target.value })}
                />
                <Input
                  value={form.themeColor}
                  onChange={(e) => setForm({ ...form, themeColor: e.target.value })}
                />
              </div>
            </Field>
          </div>

          <Field label={t("settings.adminPin")} hint={t("settings.adminPinHint")}>
            <Input
              type="password"
              inputMode="numeric"
              value={form.adminPin}
              onChange={(e) => setForm({ ...form, adminPin: e.target.value })}
              placeholder="••••"
            />
          </Field>

          <p className="text-sm font-medium pt-2 flex items-center gap-2">
            <Send className="h-4 w-4" />
            {t("settings.telegram")}
            {settings?.telegramConfigured && (
              <Badge tone="success">{t("settings.telegramConfigured")}</Badge>
            )}
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label={t("settings.telegramBotToken")} hint={t("settings.telegramBotTokenHint")}>
              <Input
                type="password"
                value={form.telegramBotToken}
                onChange={(e) => setForm({ ...form, telegramBotToken: e.target.value })}
                placeholder={settings?.telegramConfigured ? "••••••••" : ""}
              />
            </Field>
            <Field label={t("settings.telegramChatId")}>
              <Input
                value={form.telegramChatId}
                onChange={(e) => setForm({ ...form, telegramChatId: e.target.value })}
              />
            </Field>
          </div>

          <Button onClick={saveSettings}>{t("common.save")}</Button>
        </CardContent>
      </Card>

      <CategoriesCard />
      <DiaSizeLinksCard />
      <ColorsCard />
      <StretchingTypesCard />
      <BackupCard />
    </div>
  );
}

/* ---------------- Dia → category/size links ---------------- */
function DiaSizeLinksCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: links } = useDiaSizeLinks();
  const { data: categories } = useCategories(true);
  const [dia, setDia] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [sizeId, setSizeId] = useState("");
  const { data: sizes } = useSizes(categoryId ? Number(categoryId) : undefined, true);

  const refresh = () => qc.invalidateQueries({ queryKey: ["diaSizeLinks"] });

  async function add() {
    if (!dia.trim() || !categoryId || !sizeId) return;
    try {
      await api.post("/api/dia-size-links", {
        dia: dia.trim(),
        categoryId: Number(categoryId),
        sizeId: Number(sizeId),
      });
      await refresh();
      // Keep the dia: the same dia usually needs several links in a row.
      setSizeId("");
      toast.success(t("toast.saved"));
    } catch (err) {
      toastError(err, t);
    }
  }

  async function rename(id: number, newDia: string) {
    try {
      await api.put(`/api/dia-size-links/${id}`, { dia: newDia });
      await refresh();
      toast.success(t("toast.saved"));
    } catch (err) { toastError(err, t); }
  }

  async function del(id: number) {
    try {
      await api.del(`/api/dia-size-links/${id}`);
      await refresh();
      toast.success(t("toast.saved"));
    } catch (err) { toastError(err, t); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ruler className="h-5 w-5" />
          {t("settings.diaSizeLinks")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{t("settings.diaSizeLinksHint")}</p>
        <div className="divide-y divide-border">
          {links?.map((l) => (
            <RowEditDelete
              key={l.id}
              name={l.dia}
              extra={
                <span className="text-muted-foreground text-sm ml-2">
                  → {l.category.name} / {l.size.name}
                </span>
              }
              onRename={(v) => rename(l.id, v)}
              onDelete={() => del(l.id)}
            />
          ))}
          {links && !links.length && (
            <p className="text-muted-foreground text-sm py-2">{t("settings.noDiaLinks")}</p>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Input
            className="sm:w-28"
            value={dia}
            onChange={(e) => setDia(e.target.value)}
            placeholder={t("settings.diaValue")}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <Select
            value={categoryId}
            onChange={(e) => { setCategoryId(e.target.value); setSizeId(""); }}
          >
            <option value="">{t("cuttingLot.selectCategory")}</option>
            {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select value={sizeId} onChange={(e) => setSizeId(e.target.value)} disabled={!categoryId}>
            <option value="">{t("cuttingLot.selectSize")}</option>
            {sizes?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Button onClick={add} disabled={!dia.trim() || !categoryId || !sizeId}>
            <Plus className="h-4 w-4" />
            {t("settings.addDiaLink")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------------- Reusable rename + delete row ---------------- */
function RowEditDelete({
  name,
  extra,
  right,
  onRename,
  onDelete,
}: {
  name: string;
  extra?: React.ReactNode;
  right?: React.ReactNode;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(name);

  if (editing) {
    return (
      <div className="flex items-center gap-2 py-2">
        <Input className="h-8" value={v} onChange={(e) => setV(e.target.value)} />
        <button
          onClick={async () => {
            if (v.trim()) await onRename(v.trim());
            setEditing(false);
          }}
          aria-label={t("common.save")}
        >
          <Check className="h-4 w-4 text-emerald-600" />
        </button>
        <button onClick={() => { setV(name); setEditing(false); }} aria-label={t("common.cancel")}>
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 py-2">
      <div className="min-w-0">
        <span className="font-medium">{name}</span>
        {extra}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {right}
        <button onClick={() => { setV(name); setEditing(true); }} aria-label={t("common.edit")}>
          <Pencil className="h-4 w-4 text-muted-foreground" />
        </button>
        <button onClick={onDelete} aria-label={t("common.delete")}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </button>
      </div>
    </div>
  );
}

/* ---------------- Stretching types ---------------- */
function StretchingTypesCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: types } = useStretchingTypes();
  const [name, setName] = useState("");
  const [labels, setLabels] = useState<PrintLabel[]>([]);

  async function add() {
    if (!name.trim()) return;
    try {
      await api.post("/api/stretching-types", { name: name.trim() });
      await qc.invalidateQueries({ queryKey: ["stretchingTypes"] });
      setName("");
      toast.success(t("toast.typeSaved"));
    } catch (err) {
      toastError(err, t);
    }
  }

  async function toggle(id: number, active: boolean) {
    try {
      await api.put(`/api/stretching-types/${id}`, { active });
      await qc.invalidateQueries({ queryKey: ["stretchingTypes"] });
    } catch (err) {
      toastError(err, t);
    }
  }
  async function rename(id: number, newName: string) {
    try {
      await api.put(`/api/stretching-types/${id}`, { name: newName });
      await qc.invalidateQueries({ queryKey: ["stretchingTypes"] });
      toast.success(t("toast.saved"));
    } catch (err) { toastError(err, t); }
  }
  async function del(id: number) {
    try {
      await api.del(`/api/stretching-types/${id}`);
      await qc.invalidateQueries({ queryKey: ["stretchingTypes"] });
      toast.success(t("toast.saved"));
    } catch (err) { toastError(err, t); }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Ruler className="h-5 w-5" />
          {t("settings.stretchingTypes")}
        </CardTitle>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            setLabels(
              (types ?? [])
                .filter((ty) => ty.active)
                .map((ty) => ({ code: encodeBarcode("stretchingType", ty.id), title: ty.name }))
            )
          }
        >
          <Printer className="h-4 w-4" />
          {t("barcode.printAll")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="divide-y divide-border">
          {types?.map((ty) => (
            <RowEditDelete
              key={ty.id}
              name={ty.name}
              right={
                <>
                  <button onClick={() => toggle(ty.id, !ty.active)}>
                    <Badge tone={ty.active ? "success" : "muted"}>
                      {ty.active ? t("common.active") : t("common.inactive")}
                    </Badge>
                  </button>
                  <button
                    onClick={() => setLabels([{ code: encodeBarcode("stretchingType", ty.id), title: ty.name }])}
                    aria-label={t("barcode.print")}
                    title={encodeBarcode("stretchingType", ty.id)}
                  >
                    <Printer className="h-4 w-4 text-muted-foreground" />
                  </button>
                </>
              }
              onRename={(n) => rename(ty.id, n)}
              onDelete={() => del(ty.id)}
            />
          ))}
          {!types?.length && (
            <p className="text-muted-foreground py-2">{t("common.noData")}</p>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Input
            placeholder={t("settings.stretchingTypeName")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button onClick={add}>
            <Plus className="h-4 w-4" />
            {t("common.add")}
          </Button>
        </div>
        {!!labels.length && <PrintSheet labels={labels} onDone={() => setLabels([])} />}
      </CardContent>
    </Card>
  );
}

/* ---------------- Categories + sizes ---------------- */
function CategoriesCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: categories } = useCategories();
  const [name, setName] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["categories"] });
    qc.invalidateQueries({ queryKey: ["sizes"] });
  };

  async function addCategory() {
    if (!name.trim()) return;
    try {
      await api.post("/api/categories", { name: name.trim() });
      await invalidate();
      setName("");
      toast.success(t("toast.saved"));
    } catch (err) {
      toastError(err, t);
    }
  }

  async function toggleCategory(id: number, active: boolean) {
    try {
      await api.put(`/api/categories/${id}`, { active });
      await invalidate();
    } catch (err) {
      toastError(err, t);
    }
  }
  async function renameCategory(id: number, newName: string) {
    try {
      await api.put(`/api/categories/${id}`, { name: newName });
      await invalidate();
      toast.success(t("toast.saved"));
    } catch (err) { toastError(err, t); }
  }
  async function deleteCategory(id: number) {
    try {
      await api.del(`/api/categories/${id}`);
      await invalidate();
      toast.success(t("toast.saved"));
    } catch (err) { toastError(err, t); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tags className="h-5 w-5" />
          {t("settings.categories")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="divide-y divide-border">
          {categories?.map((cat) => (
            <div key={cat.id} className="py-3 space-y-2">
              <RowEditDelete
                name={cat.name}
                right={
                  <button onClick={() => toggleCategory(cat.id, !cat.active)}>
                    <Badge tone={cat.active ? "success" : "muted"}>
                      {cat.active ? t("common.active") : t("common.inactive")}
                    </Badge>
                  </button>
                }
                onRename={(n) => renameCategory(cat.id, n)}
                onDelete={() => deleteCategory(cat.id)}
              />
              <SizesInline categoryId={cat.id} sizes={cat.sizes} onChanged={invalidate} />
            </div>
          ))}
          {!categories?.length && (
            <p className="text-muted-foreground py-2">{t("common.noData")}</p>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Input
            placeholder={t("settings.categoryName")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button onClick={addCategory}>
            <Plus className="h-4 w-4" />
            {t("common.add")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SizesInline({
  categoryId,
  sizes,
  onChanged,
}: {
  categoryId: number;
  sizes: { id: number; name: string; active: boolean }[];
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");

  async function addSize() {
    if (!name.trim()) return;
    try {
      await api.post("/api/sizes", { categoryId, name: name.trim() });
      onChanged();
      setName("");
    } catch (err) {
      toastError(err, t);
    }
  }
  async function toggleSize(id: number, active: boolean) {
    try {
      await api.put(`/api/sizes/${id}`, { active });
      onChanged();
    } catch (err) {
      toastError(err, t);
    }
  }
  async function delSize(id: number) {
    try {
      await api.del(`/api/sizes/${id}`);
      onChanged();
    } catch (err) {
      toastError(err, t);
    }
  }

  return (
    <div className="pl-2 border-l-2 border-border space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {sizes.map((s) => (
          <span
            key={s.id}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
              s.active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground line-through"
            }`}
          >
            <button onClick={() => toggleSize(s.id, !s.active)} title={s.active ? t("common.active") : t("common.inactive")}>
              {s.name}
            </button>
            <button onClick={() => delSize(s.id)} aria-label={t("common.delete")}>
              <X className="h-3 w-3 hover:text-destructive" />
            </button>
          </span>
        ))}
        {!sizes.length && (
          <span className="text-xs text-muted-foreground">{t("settings.noSizes")}</span>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          className="h-8 w-32"
          placeholder={t("settings.sizeName")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addSize()}
        />
        <Button size="sm" variant="outline" onClick={addSize}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Colors ---------------- */
function ColorsCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: colors } = useMasterColors();
  const [name, setName] = useState("");
  const [labels, setLabels] = useState<PrintLabel[]>([]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["masterColors"] });

  async function add() {
    if (!name.trim()) return;
    try {
      await api.post("/api/colors", { name: name.trim() });
      await invalidate();
      setName("");
      toast.success(t("toast.saved"));
    } catch (err) {
      toastError(err, t);
    }
  }

  async function toggle(id: number, active: boolean) {
    try {
      await api.put(`/api/colors/${id}`, { active });
      await invalidate();
    } catch (err) {
      toastError(err, t);
    }
  }
  async function rename(id: number, newName: string) {
    try {
      await api.put(`/api/colors/${id}`, { name: newName });
      await invalidate();
      toast.success(t("toast.saved"));
    } catch (err) { toastError(err, t); }
  }
  async function del(id: number) {
    try {
      await api.del(`/api/colors/${id}`);
      await invalidate();
      toast.success(t("toast.saved"));
    } catch (err) { toastError(err, t); }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-5 w-5" />
          {t("settings.colors")}
        </CardTitle>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            setLabels(
              (colors ?? [])
                .filter((c) => c.active)
                .map((c) => ({ code: encodeBarcode("color", c.id), title: c.name }))
            )
          }
        >
          <Printer className="h-4 w-4" />
          {t("barcode.printAll")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="divide-y divide-border">
          {colors?.map((c) => (
            <RowEditDelete
              key={c.id}
              name={c.name}
              right={
                <>
                <button
                  onClick={() => setLabels([{ code: encodeBarcode("color", c.id), title: c.name }])}
                  aria-label={t("barcode.print")}
                  title={encodeBarcode("color", c.id)}
                >
                  <Printer className="h-4 w-4 text-muted-foreground" />
                </button>
                <button onClick={() => toggle(c.id, !c.active)}>
                  <Badge tone={c.active ? "success" : "muted"}>
                    {c.active ? t("common.active") : t("common.inactive")}
                  </Badge>
                </button>
                </>
              }
              onRename={(n) => rename(c.id, n)}
              onDelete={() => del(c.id)}
            />
          ))}
          {!colors?.length && (
            <p className="text-muted-foreground py-2">{t("common.noData")}</p>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Input
            placeholder={t("settings.colorName")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button onClick={add}>
            <Plus className="h-4 w-4" />
            {t("common.add")}
          </Button>
        </div>
        {!!labels.length && <PrintSheet labels={labels} onDone={() => setLabels([])} />}
      </CardContent>
    </Card>
  );
}

/* ---------------- Backup ---------------- */
function BackupCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: status } = useBackupStatus();
  const [running, setRunning] = useState(false);

  async function runBackup() {
    setRunning(true);
    toast.info(t("toast.backupStarted"));
    try {
      const res = await api.post<{ ok: boolean }>("/api/backup/run");
      await qc.invalidateQueries({ queryKey: ["backupStatus"] });
      if (res.ok) toast.success(t("toast.backupDone"));
      else toast.error(t("toast.backupFailed"));
    } catch (err) {
      toastError(err, t);
    } finally {
      setRunning(false);
    }
  }

  const telegramLabel =
    status?.telegram === "sent"
      ? { tone: "success" as const, text: t("settings.telegramSent") }
      : status?.telegram === "failed"
      ? { tone: "warning" as const, text: t("settings.telegramFailed") }
      : { tone: "muted" as const, text: t("settings.telegramSkipped") };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DatabaseBackup className="h-5 w-5" />
          {t("settings.backup")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm">
          <span className="text-muted-foreground">{t("settings.lastBackup")}: </span>
          {status?.lastRunAt ? (
            <span>
              {new Date(status.lastRunAt).toLocaleString()} · {status.lastFile}
            </span>
          ) : (
            <span>{t("settings.backupNever")}</span>
          )}
        </div>
        {status?.lastRunAt && (
          <Badge tone={telegramLabel.tone}>{telegramLabel.text}</Badge>
        )}
        <div>
          <Button onClick={runBackup} disabled={running} variant="outline">
            <DatabaseBackup className="h-4 w-4" />
            {t("settings.backupNow")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <PinGate>
      <SettingsInner />
    </PinGate>
  );
}
