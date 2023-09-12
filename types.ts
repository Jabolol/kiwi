export type GiveawayMeta = {
  prize: string;
  startedAt: Date;
  endsAt: Date;
  winners: number;
  participants: { id: string; username: string }[];
};
