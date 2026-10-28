import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { OrgAdminMember } from "../../../lib/api";
import MembersTable from "./MembersTable";

it("keeps checkbox keyboard selection separate from opening the mobile profile", () => {
  const open = vi.fn();
  const toggle = vi.fn();
  const member: OrgAdminMember = { id: 1, name: "Anna Rossi", email: "anna@example.com", status: "ACTIVE",
    is_active: true, deleted_at: null, card_no: 12, card_number: 12, joined_at: null, docs_count: 0 };
  render(<MembersTable error={false} isLoading={false} members={[member]} totalPages={1} page={1}
    onPageChange={() => {}} onOpenMember={open} onToggleMember={toggle} mobileSelectionMode />);
  const card = screen.getByTestId("member-mobile-row-1");
  const checkbox = card.querySelector('input[type="checkbox"]')!;
  expect(fireEvent.keyDown(checkbox, { key: " " })).toBe(true);
  expect(open).not.toHaveBeenCalled();
  fireEvent.click(checkbox);
  expect(toggle).toHaveBeenCalledWith(1);
  expect(open).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("link", { name: "Apri profilo di Anna Rossi" }));
  expect(open).toHaveBeenCalledExactlyOnceWith(1);
});
