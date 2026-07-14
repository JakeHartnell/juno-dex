import type { RiskAssessment, RiskBadge as RiskBadgeModel } from "../../lib/risk";

const severityClass = {
  ok: "risk-badge-ok",
  info: "risk-badge-info",
  warning: "risk-badge-warning",
  danger: "risk-badge-danger",
} as const;

export function RiskBadge({ badge }: { badge: RiskBadgeModel }) {
  return <em className={`risk-badge ${severityClass[badge.severity]}`} title={badge.description}>{badge.label}</em>;
}

export function RiskBadgeList({ assessment, max = 4 }: { assessment: RiskAssessment; max?: number }) {
  const visible = assessment.badges.slice(0, max);
  const hiddenCount = Math.max(0, assessment.badges.length - visible.length);
  return (
    <span className="risk-badge-list" aria-label={`Risk badges: ${assessment.badges.map((badge) => badge.label).join(", ") || "none"}`}>
      {visible.map((badge) => <RiskBadge badge={badge} key={badge.id} />)}
      {hiddenCount > 0 ? <em className="risk-badge risk-badge-info" title={assessment.badges.slice(max).map((badge) => badge.label).join(", ")}>+{hiddenCount}</em> : null}
    </span>
  );
}

export function RiskAcknowledgement({ assessment, checked, onChange, action }: { assessment: RiskAssessment; checked: boolean; onChange: (checked: boolean) => void; action: string }) {
  if (!assessment.requiresAcknowledgement || assessment.blocked) return null;
  const risks = assessment.badges.filter((badge) => badge.requiresAcknowledgement).map((badge) => badge.label).join(", ");
  return (
    <label className="price-impact-warning price-impact-danger risk-acknowledgement">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      I understand this {action} uses unverified or risky assets ({risks}) and have checked the asset identifiers and pool address.
    </label>
  );
}
