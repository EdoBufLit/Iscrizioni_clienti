import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { OrgAdminMember } from "../../../lib/api";
import MembersTable from "./MembersTable";

const desktopMember: OrgAdminMember = {
  id: 42, name: "Mario Giordano", email: "mario.giordano@example.com", status: "ACTIVE",
  workflow_status: "active", is_active: true, deleted_at: null, card_no: 23, card_number: 23,
  joined_at: "2026-07-23T23:30:00", docs_count: 2,
};

it("uses the desktop row only for the quick profile and labels full navigation Profilo", () => {
  const select = vi.fn();
  const open = vi.fn();
  render(<MembersTable error={false} isLoading={false} members={[desktopMember]} totalPages={1} page={1}
    onPageChange={() => {}} onSelectMember={select} onOpenMember={open} />);
  const row = screen.getByTestId("member-row-42");
  fireEvent.click(within(row).getByText("Mario Giordano"));
  expect(select).toHaveBeenCalledExactlyOnceWith(42);
  expect(open).not.toHaveBeenCalled();
  const fullProfile = within(row).getByRole("button", { name: "Apri profilo completo di Mario Giordano" });
  expect(fullProfile).toHaveTextContent("Profilo");
  fireEvent.click(fullProfile);
  expect(open).toHaveBeenCalledExactlyOnceWith(42);
  expect(select).toHaveBeenCalledOnce();
});

it("opens the desktop quick profile with Enter or Space only when the row itself has focus", () => {
  const select = vi.fn();
  const open = vi.fn();
  const toggle = vi.fn();
  render(<MembersTable error={false} isLoading={false} members={[desktopMember]} totalPages={1} page={1}
    onPageChange={() => {}} onSelectMember={select} onOpenMember={open} onToggleMember={toggle} />);
  const row = screen.getByTestId("member-row-42");
  expect(row).toHaveAttribute("tabindex", "0");
  expect(row).toHaveAttribute("aria-label", "Mostra profilo rapido di Mario Giordano");
  fireEvent.keyDown(row, { key: "Enter" });
  fireEvent.keyDown(row, { key: " " });
  expect(select).toHaveBeenCalledTimes(2);
  expect(open).not.toHaveBeenCalled();
  const checkbox = within(row).getByRole("checkbox", { name: "Seleziona Mario Giordano" });
  fireEvent.keyDown(checkbox, { key: "Enter" });
  fireEvent.keyDown(checkbox, { key: " " });
  fireEvent.click(checkbox);
  fireEvent.keyDown(within(row).getByRole("button", { name: "Apri profilo completo di Mario Giordano" }), { key: "Enter" });
  expect(toggle).toHaveBeenCalledExactlyOnceWith(42);
  expect(select).toHaveBeenCalledTimes(2);
  expect(open).not.toHaveBeenCalled();
});

it("keeps page selection available in the header and reflects a partial selection", () => {
  const togglePage = vi.fn();
  const members = [desktopMember, { ...desktopMember, id: 43, name: "Anna Rossi" }];
  render(<MembersTable error={false} isLoading={false} members={members} totalPages={1} page={1}
    onPageChange={() => {}} onOpenMember={() => {}} onToggleMember={() => {}} onTogglePage={togglePage}
    checkedMemberIds={new Set([42])} />);
  const checkbox = screen.getByRole("checkbox", { name: "Seleziona tutti i soci della pagina" });
  expect(checkbox).not.toBeChecked();
  expect((checkbox as HTMLInputElement).indeterminate).toBe(true);
  fireEvent.click(checkbox);
  expect(togglePage).toHaveBeenCalledOnce();
});

it("shows the Rome calendar date for UTC API timestamps without a timezone", () => {
  render(<MembersTable error={false} isLoading={false} members={[desktopMember]} totalPages={1} page={1}
    onPageChange={() => {}} onOpenMember={() => {}} />);
  expect(within(screen.getByTestId("member-row-42")).getByText("24/07/2026")).toBeInTheDocument();
});

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
