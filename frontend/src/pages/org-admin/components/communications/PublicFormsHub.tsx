import { useEffect, useState } from "react";
import { fetchOrgAdminEmailTemplates, type OrgAdminEmailTemplate } from "../../../../lib/api";
import Skeleton from "../../../../components/ui/Skeleton";
import { useToast } from "../../../../components/ui/ToastProvider";
import { OrgAdminFormsWorkspace } from "../../OrgAdminForms";

type PublicFormsHubProps = {
  locked?: boolean;
};

export function PublicFormsHub({ locked = false }: PublicFormsHubProps) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<OrgAdminEmailTemplate[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchOrgAdminEmailTemplates({ scope: "all", includeInactive: true })
      .then((response) => {
        if (!cancelled) {
          setTemplates(response.items);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          showToast({
            tone: "error",
            title: "Template non disponibili",
            message: err instanceof Error ? err.message : "Errore caricamento template.",
          });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  if (loading) {
    return <Skeleton className="h-[32rem] w-full rounded-[2rem]" />;
  }

  return <OrgAdminFormsWorkspace embedded locked={locked} availableTemplates={templates} />;
}
