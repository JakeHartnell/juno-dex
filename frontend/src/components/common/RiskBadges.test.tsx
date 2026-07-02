import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RiskAcknowledgement, RiskBadgeList } from "./RiskBadges";

const assessment = {
  verified: false,
  requiresAcknowledgement: true,
  badges: [
    { id: "unverified", label: "Unverified", severity: "warning" as const, description: "Needs review", requiresAcknowledgement: true },
    { id: "factory", label: "Factory", severity: "info" as const, description: "Discovered" },
  ],
};

describe("RiskBadges", () => {
  it("renders badge labels with severity classes", () => {
    render(<RiskBadgeList assessment={assessment} />);
    expect(screen.getByText("Unverified").className).toContain("risk-badge-warning");
    expect(screen.getByText("Factory").className).toContain("risk-badge-info");
  });

  it("renders acknowledgement copy only when required", () => {
    render(<RiskAcknowledgement assessment={assessment} checked={false} onChange={() => undefined} action="swap" />);
    expect(screen.getByLabelText(/i understand this swap uses unverified or risky assets/i)).toBeTruthy();
  });
});
