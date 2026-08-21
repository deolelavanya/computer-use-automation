export type MemberStatus = "ACTIVE" | "RESTRICTED";

export type Member = {
  id: string;
  name: string;
  status: MemberStatus;
  existingAccounts: string[];
  scenario?: "PERMISSION_INTERVENTION";
};

export const members: Record<string, Member> = {
  "12345": {
    id: "12345",
    name: "Alice Carter",
    status: "ACTIVE",
    existingAccounts: ["CHECKING-001", "SAVINGS-001"]
  },
  "20002": {
    id: "20002",
    name: "Marcus Lee",
    status: "RESTRICTED",
    existingAccounts: ["CHECKING-114"]
  },
  "30003": {
    id: "30003",
    name: "Jordan Davis",
    status: "ACTIVE",
    existingAccounts: ["CHECKING-208"],
    scenario: "PERMISSION_INTERVENTION"
  }
};
