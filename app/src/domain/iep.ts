// One entry in data/iep-history/{studentId}.jsonl — appended at each IEP
// review (written by the Slice 6 review flow; read-only here).
export interface IepReview {
  date: string;
  added?: number;
  retired?: number;
  kept?: number;
  nothingChanged?: boolean;
  note?: string;
}
