export type Mode = "regular" | "filming-day";

export type ColorKey =
  | "purple"
  | "blue"
  | "teal"
  | "green"
  | "amber"
  | "coral"
  | "pink"
  | "red"
  | "purple-deep"
  | "teal-deep"
  | "amber-deep"
  | "gray";

export interface TeacherColor {
  label: string;
  // Pill background and a readable foreground for text on that background.
  bg: string;
  text: string;
}

export const TEACHER_COLORS: Record<ColorKey, TeacherColor> = {
  purple: { label: "Purple", bg: "#CECBF6", text: "#26215C" },
  blue: { label: "Blue", bg: "#B5D4F4", text: "#0C447C" },
  teal: { label: "Teal", bg: "#9FE1CB", text: "#0F5641" },
  green: { label: "Green", bg: "#C0DD97", text: "#27500A" },
  amber: { label: "Amber", bg: "#FAC775", text: "#412402" },
  coral: { label: "Coral", bg: "#F5C4B3", text: "#5A2310" },
  pink: { label: "Pink", bg: "#F4C0D1", text: "#4B1528" },
  red: { label: "Red", bg: "#F7C1C1", text: "#791F1F" },
  "purple-deep": { label: "Purple deep", bg: "#AFA9EC", text: "#26215C" },
  "teal-deep": { label: "Teal deep", bg: "#5DCAA5", text: "#0F5641" },
  "amber-deep": { label: "Amber deep", bg: "#EF9F27", text: "#412402" },
  gray: { label: "Gray", bg: "#D3D1C7", text: "#3A3A35" },
};

export function teacherColor(key: string | undefined): TeacherColor {
  if (key && key in TEACHER_COLORS) return TEACHER_COLORS[key as ColorKey];
  return TEACHER_COLORS.gray;
}

export interface Activity {
  id: string;
  name: string;
  hasSegmentName?: boolean;
  freeText?: boolean;
}

export interface Role {
  id: string;
  name: string;
  phrase: string;
  // Keys of the conditional field-components enabled for this role.
  fields: string[];
}

export interface PerStudentField {
  key: string;
  label: string;
  type: "bool";
}

export interface Teacher {
  id: string;
  name: string;
  color: ColorKey;
  modes: Mode[];
  activities: Activity[];
  roles: Role[];
  perStudentFields: PerStudentField[];
  promptOverrides?: Record<string, string>;
}
