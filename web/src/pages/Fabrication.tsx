import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { Factory, Plus, Lock, ChevronRight } from "lucide-react";
import { Card, CardContent, Button, Badge } from "@/components/ui";
import { useFabricationLotsPaged } from "@/lib/data";
import { PageTitle, SearchBox, Pagination } from "@/pages/_parts";

const PAGE_SIZE = 20;

export function statusTone(status: string): "default" | "success" | "muted" | "warning" {
  if (status === "ready") return "success";
  if (status === "dyeing") return "warning";
  return "muted";
}

export default function FabricationPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data } = useFabricationLotsPaged({ search, page, pageSize: PAGE_SIZE });

  const lots = data?.items;

  function onSearch(v: string) {
    setSearch(v);
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <PageTitle icon={Factory} title={t("fabrication.title")} subtitle={t("fabrication.subtitle")} />
        <Button onClick={() => navigate("/fabrication/new")}>
          <Plus className="h-4 w-4" />
          {t("fabrication.newLot")}
        </Button>
      </div>

      <SearchBox value={search} onChange={onSearch} placeholder={t("fabrication.searchLot")} />

      <Card>
        <CardContent className="pt-5">
          <div className="divide-y divide-border">
            {lots?.map((lot) => (
              <Link
                key={lot.id}
                to={`/fabrication/${lot.id}`}
                className="flex items-center justify-between gap-3 py-3 -mx-2 px-2 rounded-md hover:bg-muted transition-colors"
              >
                <div className="min-w-0">
                  <span className="font-medium">{lot.lotNumber}</span>
                  <span className="text-muted-foreground text-sm ml-2">
                    {lot.rolls.length} {t("fabrication.rolls")}
                  </span>
                  {lot.type !== "own" && (
                    <span className="text-muted-foreground text-xs ml-2">· {t(`fabType.${lot.type}`)}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {lot.locked && (
                    <span className="flex items-center gap-1 text-xs text-amber-700">
                      <Lock className="h-3.5 w-3.5" />
                      {t("fabrication.locked")}
                    </span>
                  )}
                  <Badge tone={statusTone(lot.status)}>{t(`fabStatus.${lot.status}`)}</Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
            {lots && !lots.length && (
              <p className="text-muted-foreground text-sm py-3">{t("fabrication.noLots")}</p>
            )}
          </div>
          {data && (
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
