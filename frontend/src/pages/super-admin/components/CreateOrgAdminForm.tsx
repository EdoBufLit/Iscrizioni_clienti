import { FormEvent, memo, useState } from "react";
import { type Organization } from "../../../lib/api";

type CreateOrgAdminFormProps = {
  orgs: Organization[];
  onCreate: (email: string, orgId: number) => Promise<string>;
};

const CreateOrgAdminForm = memo(function CreateOrgAdminForm({
  orgs,
  onCreate,
}: CreateOrgAdminFormProps) {
  const [newEmail, setNewEmail] = useState("");
  const [newOrgId, setNewOrgId] = useState<number | "">("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!newEmail.trim() || newOrgId === "" || creating) return;

    setCreateError("");
    setCreateSuccess("");
    setCreating(true);
    try {
      const successMessage = await onCreate(newEmail.trim(), newOrgId);
      setCreateSuccess(successMessage);
      setNewEmail("");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Errore nella creazione.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <section className="sa-card p-5" data-component="superadmin-orgadmins-create-form">
      <div className="flex flex-col gap-1">
        <p className="sa-eyebrow">Invita nuovo amministratore</p>
        <h3 className="text-base font-bold text-neutral-900">Accesso sede locale</h3>
        <p className="text-sm text-neutral-500">
          L'invito con magic link verra inviato automaticamente all'indirizzo email.
        </p>
      </div>

      <div className="mt-4 min-h-[44px]">
        {createError && (
          <div className="rounded-md border border-red-200/60 bg-red-50 px-4 py-3">
            <p className="text-sm text-red-700">{createError}</p>
          </div>
        )}
        {createSuccess && (
          <div className="rounded-md border border-emerald-200/60 bg-emerald-50 px-4 py-3">
            <p className="text-sm text-emerald-700">{createSuccess}</p>
          </div>
        )}
      </div>

      <form
        className="sa-form-grid mt-1"
        onSubmit={handleCreate}
      >
        <div>
          <label
            htmlFor="new-admin-email"
            className="sa-eyebrow"
          >
            Email
          </label>
          <input
            id="new-admin-email"
            className="theme-input mt-2 w-full px-3 py-2 text-sm"
            type="email"
            placeholder="admin@associazione.it"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
        </div>
        <div>
          <label
            htmlFor="new-admin-org"
            className="sa-eyebrow"
          >
            Associazione
          </label>
          <select
            id="new-admin-org"
            className="theme-select mt-2 w-full px-3 py-2 text-sm"
            value={newOrgId}
            onChange={(e) =>
              setNewOrgId(e.target.value ? Number(e.target.value) : "")
            }
          >
            <option value="">Seleziona...</option>
            {orgs.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </div>
        <button
          className="btn-primary self-end px-5 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          type="submit"
          disabled={!newEmail.trim() || newOrgId === "" || creating}
          data-component="superadmin-orgadmins-invite"
        >
          {creating ? "Invio..." : "Invita"}
        </button>
      </form>
    </section>
  );
});

export default CreateOrgAdminForm;
