export interface GiftIdea {
  id: string;
  description: string;
  status: "idea" | "purchased" | "given";
}

export interface PinnedFact {
  id: string;
  label: string | null;
  text: string;
}

export interface Person {
  id: string;
  name: string;
  relationship: string | null;
  birthday: string | null;
  birthdayYearKnown: boolean;
  notes: string | null;
  giftIdeaCount: number;
  pinnedFacts: PinnedFact[];
}

export interface ReminderInstance {
  id: string;
  fireAt: string;
  sentAt: string | null;
}

export interface ReminderCascade {
  id: string;
  personId: string | null;
  anchorDate: string;
  cadenceDays: number[];
  calendarEventId?: string | null;
  instances: ReminderInstance[];
}

export interface NoteItem {
  id: string;
  label: string | null;
  text: string;
  isPinned: boolean;
  giftStatus: "idea" | "purchased" | "given" | null;
  children: NoteItem[];
}

export interface PersonNote {
  id: string;
  title: string;
  kind: "list" | "text";
  body: string | null;
  items: NoteItem[];
}

export interface PersonSection {
  kind: "notes" | "gift_ideas";
  id: string;
  title: string;
  isPrivate: boolean;
  notes: PersonNote[];
}
