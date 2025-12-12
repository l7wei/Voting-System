export type VotingCampaign = {
  id: string;
  name: string;
  rule: "choose_all" | "choose_one";
  open_from: Date;
  open_to: Date;
  options: string[];
  visibility: "public" | "restricted";
  created_at?: FirebaseFirestore.FieldValue | Date;
  updated_at?: FirebaseFirestore.FieldValue | Date;
};

export type VotingBallot = {
  id?: string;
  campaign_id: string;
  token: string;
  rule: "choose_all" | "choose_one";
  choose_all?: { option_id: string; remark: string }[];
  choose_one?: string;
  created_at?: FirebaseFirestore.FieldValue | Date;
};
