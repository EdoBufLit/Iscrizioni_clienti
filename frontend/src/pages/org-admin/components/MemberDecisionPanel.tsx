import { memo, useEffect, useState } from "react";
import AsyncActionButton, { type AsyncActionState } from "../../../components/ui/AsyncActionButton";
import { formatMemberDate } from "./memberDetailPresentation";

type MemberDecisionPanelProps = {
  status: string;
  decisionAt?: string;
  initialNotes?: string;
  isSubmitting: boolean;
  approveState?: AsyncActionState;
  rejectState?: AsyncActionState;
  onSubmit: (decision: "approve" | "reject", notes: string) => void;
};

const MemberDecisionPanel = memo(function MemberDecisionPanel({
  status,
  decisionAt,
  initialNotes,
  isSubmitting,
  approveState = "idle",
  rejectState = "idle",
  onSubmit,
}: MemberDecisionPanelProps) {
  const [notes, setNotes] = useState(initialNotes ?? "");
  const normalizedStatus = status.trim().toLowerCase();
  const isApproved = normalizedStatus !== "rejected" && (normalizedStatus === "active" || Boolean(decisionAt));
  const isDecisionMade = isApproved || normalizedStatus === "rejected";

  useEffect(() => {
    setNotes(initialNotes ?? "");
  }, [initialNotes]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
      <h2 className="text-lg font-semibold mb-4">Iscrizione</h2>

      <div className="space-y-4" data-component="orgadmin-member-decision-panel">
        {!isDecisionMade && <div>
          <label htmlFor="decisionNotes" className="block text-sm font-medium text-neutral-700 mb-1">
            Note decisione (opzionale)
          </label>
          <textarea
            id="decisionNotes"
            rows={3}
            className="w-full rounded-md border border-neutral-300 shadow-sm focus:border-brand focus:ring-brand sm:text-sm p-2"
            placeholder="Inserisci eventuali note per l'approvazione o il rifiuto..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={isSubmitting}
          />
        </div>}

        {isDecisionMade ? (
          <div>
            <p className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${isApproved ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
              {isApproved ? "Iscrizione approvata" : "Iscrizione rifiutata"}
            </p>
            {decisionAt && (
              <p className="text-sm mt-2 text-neutral-500">
                {formatMemberDate(decisionAt, true)}
              </p>
            )}
            {initialNotes?.trim() && (
              <p className="text-sm mt-3 whitespace-pre-wrap break-words text-neutral-700">
                {initialNotes}
              </p>
            )}
          </div>
        ) : (
          <div className="flex gap-4">
            <AsyncActionButton
              onClick={() => onSubmit("approve", notes)}
              disabled={isSubmitting}
              state={approveState}
              idleLabel="Approva Iscrizione"
              loadingLabel="Approvazione..."
              successLabel="Approvata"
              errorLabel="Errore"
              className="flex-1 rounded-lg bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 shadow-sm"
            />
            <AsyncActionButton
              onClick={() => onSubmit("reject", notes)}
              disabled={isSubmitting}
              state={rejectState}
              idleLabel="Rigetta Iscrizione"
              loadingLabel="Rigetto..."
              successLabel="Rigettata"
              errorLabel="Errore"
              className="flex-1 rounded-lg border border-red-200 bg-white px-4 py-2 font-medium text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 shadow-sm"
            />
          </div>
        )}
      </div>
    </div>
  );
});

export default MemberDecisionPanel;
